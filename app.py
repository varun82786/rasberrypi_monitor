from flask import Flask, render_template, jsonify, request, abort
import requests
import pandas as pd
import csv
import io
import logging
import os
from datetime import datetime, timedelta
from functools import wraps
from time import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Security configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-change-in-production')

# Configure logging
log_level = getattr(logging, os.getenv('LOG_LEVEL', 'INFO').upper())
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ThingSpeak API details from environment
READ_API_KEY = os.getenv('THINGSPEAK_READ_API_KEY', 'H0USM137GRY8Y3IA')
YOUR_CHANNEL_ID = os.getenv('THINGSPEAK_CHANNEL_ID', '2662777')
THINGSPEAK_URL = f'https://api.thingspeak.com/channels/{YOUR_CHANNEL_ID}/feed.json'
API_TIMEOUT = int(os.getenv('THINGSPEAK_API_TIMEOUT', '10'))

# Field configuration
FIELD_LABELS = {
    'field1': 'CPU Temperature',
    'field2': 'GPU Temperature',
    'field3': 'CPU Usage',
    'field4': 'Memory Usage',
    'field5': 'Disk Usage',
    'field6': 'Bytes Sent',
    'field7': 'Bytes Received',
    'field8': 'System Uptime'
}

FIELD_UNITS = {
    'field1': '°C',
    'field2': '°C',
    'field3': '%',
    'field4': 'GB',
    'field5': 'GB',
    'field6': 'GB',
    'field7': 'GB',
    'field8': 'Days'
}

# Threshold configuration
THRESHOLDS = {
    'field1': {'warning': 50, 'critical': 60},  # CPU Temp
    'field2': {'warning': 55, 'critical': 70},  # GPU Temp
    'field3': {'warning': 70, 'critical': 90},  # CPU Usage
    'field4': {'warning': 4, 'critical': 6},    # Memory
    'field5': {'warning': 100, 'critical': 200}, # Disk
}

# Simple in-memory cache with TTL
cache = {}
CACHE_TTL = int(os.getenv('CACHE_TTL', '8'))  # seconds

# Rate limiting configuration
RATE_LIMIT_REQUESTS = int(os.getenv('RATE_LIMIT_REQUESTS', '30'))
RATE_LIMIT_PERIOD = int(os.getenv('RATE_LIMIT_PERIOD', '60'))

# Input validation
VALID_FIELDS = ['field1', 'field2', 'field3', 'field4', 'field5', 'field6', 'field7', 'field8']
VALID_PERIODS = ['live', '30min', '1hr', '3hrs', '6hrs', '12hrs', '24hrs', '48hrs', '72hrs']
MAX_RESULTS = 8640  # Maximum data points (24hrs * 60min * 6 points/min)

class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass

class APIError(Exception):
    """Custom exception for API errors"""
    pass

def validate_field(field):
    """Validate field parameter"""
    if not field or field not in VALID_FIELDS:
        raise ValidationError(f"Invalid field '{field}'. Must be one of: {', '.join(VALID_FIELDS)}")
    return field

def validate_period(period):
    """Validate period parameter"""
    if not period or period not in VALID_PERIODS:
        raise ValidationError(f"Invalid period '{period}'. Must be one of: {', '.join(VALID_PERIODS)}")
    return period

def sanitize_input(value, max_length=100):
    """Sanitize string input"""
    if not isinstance(value, str):
        return str(value)
    return value.strip()[:max_length]

def get_cache(key):
    """Get value from cache if not expired"""
    try:
        if key in cache:
            value, timestamp = cache[key]
            if time() - timestamp < CACHE_TTL:
                logger.debug(f"Cache hit for key: {key}")
                return value
            else:
                # Remove expired cache entry
                del cache[key]
                logger.debug(f"Cache expired for key: {key}")
    except Exception as e:
        logger.error(f"Cache retrieval error for key {key}: {e}")
    return None

def set_cache(key, value):
    """Set value in cache with timestamp"""
    try:
        cache[key] = (value, time())
        logger.debug(f"Cache set for key: {key}")
        
        # Clean up old cache entries if cache gets too large
        if len(cache) > 100:
            oldest_key = min(cache.keys(), key=lambda k: cache[k][1])
            del cache[oldest_key]
            logger.debug(f"Cleaned up old cache entry: {oldest_key}")
    except Exception as e:
        logger.error(f"Cache storage error for key {key}: {e}")

def ratelimit(limit=None, period=None):
    """Enhanced rate limiting decorator with configurable limits"""
    limit = limit or RATE_LIMIT_REQUESTS
    period = period or RATE_LIMIT_PERIOD
    
    def decorator(f):
        calls = {}
        @wraps(f)
        def wrapped(*args, **kwargs):
            try:
                client = request.remote_addr or 'unknown'
                now = time()
                
                if client not in calls:
                    calls[client] = []
                
                # Clean old calls
                calls[client] = [t for t in calls[client] if now - t < period]
                
                if len(calls[client]) >= limit:
                    logger.warning(f"Rate limit exceeded for client {client}")
                    return jsonify({
                        'error': 'Rate limit exceeded',
                        'message': f'Maximum {limit} requests per {period} seconds',
                        'retry_after': period
                    }), 429
                
                calls[client].append(now)
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"Rate limiting error: {e}")
                return f(*args, **kwargs)  # Continue without rate limiting on error
        return wrapped
    return decorator

def calculate_statistics(values):
    """Calculate statistics for a dataset with enhanced error handling"""
    try:
        if not values:
            return {'average': 0, 'min': 0, 'max': 0, 'count': 0}
        
        # Filter and convert to float values
        float_values = []
        for v in values:
            if v is not None:
                try:
                    # Handle both string and numeric inputs
                    if isinstance(v, str):
                        # Remove any non-numeric characters except decimal point and minus
                        cleaned = ''.join(c for c in v if c.isdigit() or c in '.-')
                        if cleaned and cleaned != '.' and cleaned != '-':
                            float_values.append(float(cleaned))
                    else:
                        float_values.append(float(v))
                except (ValueError, TypeError):
                    continue
        
        if not float_values:
            return {'average': 0, 'min': 0, 'max': 0, 'count': 0}
        
        return {
            'average': round(sum(float_values) / len(float_values), 2),
            'min': round(min(float_values), 2),
            'max': round(max(float_values), 2),
            'count': len(float_values),
            'total_entries': len(values)
        }
    except Exception as e:
        logger.error(f"Error calculating statistics: {e}")
        return {'average': 0, 'min': 0, 'max': 0, 'count': 0, 'error': str(e)}

def fetch_from_thingspeak(results):
    """Fetch data from ThingSpeak with comprehensive error handling"""
    try:
        # Validate results parameter
        if not isinstance(results, int) or results <= 0 or results > MAX_RESULTS:
            raise ValidationError(f"Invalid results parameter: {results}. Must be between 1 and {MAX_RESULTS}")
        
        logger.info(f"Fetching {results} data points from ThingSpeak")
        
        response = requests.get(
            THINGSPEAK_URL,
            params={'api_key': READ_API_KEY, 'results': results},
            timeout=API_TIMEOUT,
            headers={'User-Agent': 'RaspberryPi-Monitor/1.0'}
        )
        
        # Check HTTP status
        response.raise_for_status()
        
        # Validate response content
        if not response.content:
            raise APIError("Empty response from ThingSpeak API")
        
        data = response.json()
        
        # Validate JSON structure
        if not isinstance(data, dict):
            raise APIError("Invalid JSON structure from ThingSpeak API")
        
        if 'feeds' not in data:
            logger.warning("No 'feeds' key in ThingSpeak response")
            data['feeds'] = []
        
        logger.info(f"Successfully fetched {len(data.get('feeds', []))} data points")
        return data
        
    except requests.exceptions.Timeout:
        logger.error(f"ThingSpeak API timeout after {API_TIMEOUT} seconds")
        raise APIError(f"API timeout after {API_TIMEOUT} seconds")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"ThingSpeak API connection error: {e}")
        raise APIError("Unable to connect to ThingSpeak API")
    except requests.exceptions.HTTPError as e:
        logger.error(f"ThingSpeak API HTTP error: {e}")
        if response.status_code == 429:
            raise APIError("API rate limit exceeded")
        elif response.status_code == 401:
            raise APIError("Invalid API key")
        elif response.status_code == 404:
            raise APIError("Channel not found")
        else:
            raise APIError(f"HTTP {response.status_code}: {e}")
    except ValueError as e:
        logger.error(f"Invalid JSON response from ThingSpeak: {e}")
        raise APIError("Invalid response format from API")
    except Exception as e:
        logger.error(f"Unexpected error fetching from ThingSpeak: {e}")
        raise APIError(f"Unexpected API error: {str(e)}")

@app.errorhandler(ValidationError)
def handle_validation_error(e):
    """Handle validation errors"""
    logger.warning(f"Validation error: {e}")
    return jsonify({
        'error': 'Validation Error',
        'message': str(e),
        'timestamp': datetime.now().isoformat()
    }), 400

@app.errorhandler(APIError)
def handle_api_error(e):
    """Handle API errors"""
    logger.error(f"API error: {e}")
    return jsonify({
        'error': 'API Error',
        'message': str(e),
        'timestamp': datetime.now().isoformat(),
        'status': 'degraded'
    }), 502

@app.errorhandler(404)
def handle_not_found(e):
    """Handle 404 errors"""
    return jsonify({
        'error': 'Not Found',
        'message': 'The requested resource was not found',
        'timestamp': datetime.now().isoformat()
    }), 404

@app.errorhandler(500)
def handle_internal_error(e):
    """Handle internal server errors"""
    logger.error(f"Internal server error: {e}")
    return jsonify({
        'error': 'Internal Server Error',
        'message': 'An unexpected error occurred',
        'timestamp': datetime.now().isoformat()
    }), 500

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/data')
@ratelimit()
def data():
    """Fetch latest 15 data points with enhanced error handling and caching"""
    cache_key = 'data_latest'
    
    try:
        # Check cache first
        cached_data = get_cache(cache_key)
        if cached_data:
            logger.debug("Returning cached data")
            return jsonify(cached_data)
        
        # Fetch fresh data
        api_data = fetch_from_thingspeak(15)
        
        response_data = {
            'feeds': api_data.get('feeds', []),
            'channel': api_data.get('channel', {}),
            'field_labels': FIELD_LABELS,
            'field_units': FIELD_UNITS,
            'thresholds': THRESHOLDS,
            'timestamp': datetime.now().isoformat(),
            'status': 'ok',
            'cache_hit': False
        }
        
        # Add current values and statistics
        feeds = api_data.get('feeds', [])
        if feeds:
            latest = feeds[-1]  # Get most recent entry
            for i in range(1, 9):
                field_key = f'field{i}'
                if field_key in latest and latest[field_key] is not None:
                    response_data[f'{field_key}_current'] = latest[field_key]
            
            # Add basic statistics for the dataset
            response_data['data_summary'] = {
                'total_points': len(feeds),
                'time_range': {
                    'start': feeds[0].get('created_at') if feeds else None,
                    'end': feeds[-1].get('created_at') if feeds else None
                }
            }
        
        # Cache the response
        set_cache(cache_key, response_data)
        
        logger.info("Successfully fetched and cached latest data")
        return jsonify(response_data)
        
    except (ValidationError, APIError):
        # These are handled by error handlers
        raise
    except Exception as e:
        logger.error(f"Unexpected error in /data endpoint: {e}")
        return jsonify({
            'error': 'Internal Error',
            'message': 'Failed to fetch data',
            'timestamp': datetime.now().isoformat(),
            'status': 'error'
        }), 500

@app.route('/test/graph/<field>')
def test_graph(field):
    """Test endpoint for debugging graph issues"""
    try:
        field = sanitize_input(field)
        validate_field(field)
        
        # Return some test data
        test_data = {
            'field': field,
            'field_label': FIELD_LABELS.get(field, field),
            'field_unit': FIELD_UNITS.get(field, ''),
            'valid_fields': VALID_FIELDS,
            'valid_periods': VALID_PERIODS
        }
        
        return jsonify(test_data)
    except ValidationError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in test_graph: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/graph/<field>')
def graph(field):
    """Render graph page with field validation"""
    try:
        field = sanitize_input(field)
        validate_field(field)
        logger.info(f"Rendering graph page for field: {field}")
        return render_template(
            'graph.html',
            field=field,
            field_name=FIELD_LABELS.get(field, field),
            field_label=FIELD_LABELS.get(field, field)
        )
    except ValidationError as e:
        logger.warning(f"Invalid field in graph route: {field} - {e}")
        abort(400)
    except Exception as e:
        logger.error(f"Error in graph route: {e}")
        abort(500)

@app.route('/historic_data/<field>/<period>')
@ratelimit()
def historic_data(field, period):
    """Fetch historical data with comprehensive validation and caching"""
    try:
        # Sanitize and validate inputs
        field = sanitize_input(field)
        period = sanitize_input(period)
        
        validate_field(field)
        validate_period(period)
        
        # Results mapping with validation
        results_map = {
            'live': 15,
            '30min': 30,
            '1hr': 60,
            '3hrs': 180,
            '6hrs': 360,
            '12hrs': 720,
            '24hrs': 1440,
            '48hrs': 2880,
            '72hrs': 4320
        }
        
        results = results_map[period]
        
        # Check cache
        cache_key = f'historic_{field}_{period}'
        cached_data = get_cache(cache_key)
        if cached_data:
            cached_data['cache_hit'] = True
            logger.debug(f"Returning cached historic data for {field}/{period}")
            return jsonify(cached_data)
        
        # Fetch fresh data
        api_data = fetch_from_thingspeak(results)
        feeds = api_data.get('feeds', [])
        
        # Calculate statistics
        if feeds:
            values = [feed.get(field) for feed in feeds if feed.get(field) is not None]
            stats = calculate_statistics(values)
        else:
            stats = {'average': 0, 'min': 0, 'max': 0, 'count': 0}
        
        response_data = {
            'feeds': feeds,
            'channel': api_data.get('channel', {}),
            'field': field,
            'field_label': FIELD_LABELS.get(field, field),
            'field_unit': FIELD_UNITS.get(field, ''),
            'period': period,
            'statistics': stats,
            'timestamp': datetime.now().isoformat(),
            'status': 'ok',
            'cache_hit': False,
            'data_summary': {
                'requested_points': results,
                'actual_points': len(feeds),
                'field_values': len([f for f in feeds if f.get(field) is not None])
            }
        }
        
        # Add threshold information if available
        if field in THRESHOLDS:
            response_data['thresholds'] = THRESHOLDS[field]
        
        set_cache(cache_key, response_data)
        
        logger.info(f"Successfully fetched historic data for {field}/{period}")
        return jsonify(response_data)
        
    except (ValidationError, APIError):
        # These are handled by error handlers
        raise
    except Exception as e:
        logger.error(f"Unexpected error in /historic_data endpoint: {e}")
        return jsonify({
            'error': 'Internal Error',
            'message': 'Failed to fetch historic data',
            'timestamp': datetime.now().isoformat(),
            'status': 'error'
        }), 500

@app.route('/alerts')
@ratelimit()
def get_alerts():
    """Get current threshold violations with enhanced error handling"""
    try:
        api_data = fetch_from_thingspeak(1)
        alerts = []
        
        feeds = api_data.get('feeds', [])
        if feeds:
            latest = feeds[-1]
            
            for field, threshold_config in THRESHOLDS.items():
                value = latest.get(field)
                if value is not None:
                    try:
                        float_value = float(value)
                        alert_info = {
                            'field': field,
                            'label': FIELD_LABELS.get(field, field),
                            'value': float_value,
                            'unit': FIELD_UNITS.get(field, ''),
                            'timestamp': latest.get('created_at')
                        }
                        
                        if float_value > threshold_config['critical']:
                            alert_info.update({
                                'threshold': threshold_config['critical'],
                                'severity': 'critical',
                                'message': f"{alert_info['label']} is critically high"
                            })
                            alerts.append(alert_info)
                        elif float_value > threshold_config['warning']:
                            alert_info.update({
                                'threshold': threshold_config['warning'],
                                'severity': 'warning',
                                'message': f"{alert_info['label']} is above warning level"
                            })
                            alerts.append(alert_info)
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Invalid value for {field}: {value} - {e}")
                        continue
        
        # Sort alerts by severity (critical first)
        alerts.sort(key=lambda x: 0 if x['severity'] == 'critical' else 1)
        
        return jsonify({
            'alerts': alerts,
            'count': len(alerts),
            'critical_count': len([a for a in alerts if a['severity'] == 'critical']),
            'warning_count': len([a for a in alerts if a['severity'] == 'warning']),
            'timestamp': datetime.now().isoformat(),
            'status': 'ok'
        })
        
    except (ValidationError, APIError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error in /alerts endpoint: {e}")
        return jsonify({
            'error': 'Internal Error',
            'message': 'Failed to fetch alerts',
            'alerts': [],
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/export/<field>/<period>')
@ratelimit(limit=10, period=60)
def export_csv(field, period):
    """Export field data as CSV with enhanced validation and error handling"""
    try:
        # Sanitize and validate inputs
        field = sanitize_input(field)
        period = sanitize_input(period)
        
        validate_field(field)
        validate_period(period)
        
        results_map = {
            'live': 15, '30min': 30, '1hr': 60, '3hrs': 180,
            '6hrs': 360, '12hrs': 720, '24hrs': 1440, '48hrs': 2880, '72hrs': 4320
        }
        
        results = results_map[period]
        api_data = fetch_from_thingspeak(results)
        
        # Create CSV with enhanced headers
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write headers with metadata
        writer.writerow(['# Raspberry Pi Monitor Data Export'])
        writer.writerow(['# Field:', FIELD_LABELS.get(field, field)])
        writer.writerow(['# Period:', period])
        writer.writerow(['# Export Time:', datetime.now().isoformat()])
        writer.writerow(['# Total Records:', len(api_data.get('feeds', []))])
        writer.writerow([])  # Empty row for separation
        
        # Write data headers
        writer.writerow(['Timestamp', FIELD_LABELS.get(field, field), 'Unit', 'Entry_ID'])
        
        # Write data
        feeds = api_data.get('feeds', [])
        valid_records = 0
        
        for feed in feeds:
            timestamp = feed.get('created_at', 'N/A')
            value = feed.get(field, 'N/A')
            unit = FIELD_UNITS.get(field, '')
            entry_id = feed.get('entry_id', 'N/A')
            
            writer.writerow([timestamp, value, unit, entry_id])
            
            if value != 'N/A':
                valid_records += 1
        
        # Add summary at the end
        writer.writerow([])
        writer.writerow(['# Summary'])
        writer.writerow(['# Valid Records:', valid_records])
        writer.writerow(['# Invalid Records:', len(feeds) - valid_records])
        
        if valid_records > 0:
            values = [float(feed.get(field, 0)) for feed in feeds 
                     if feed.get(field) is not None and str(feed.get(field)).replace('.', '', 1).isdigit()]
            if values:
                stats = calculate_statistics(values)
                writer.writerow(['# Average:', stats.get('average', 'N/A')])
                writer.writerow(['# Min:', stats.get('min', 'N/A')])
                writer.writerow(['# Max:', stats.get('max', 'N/A')])
        
        # Return CSV as download
        output.seek(0)
        csv_content = output.getvalue()
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{field}_{period}_{timestamp}.csv"
        
        logger.info(f"CSV export completed: {filename} ({len(feeds)} records)")
        
        return csv_content, 200, {
            'Content-Disposition': f'attachment;filename={filename}',
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Length': str(len(csv_content.encode('utf-8')))
        }
        
    except (ValidationError, APIError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error in /export endpoint: {e}")
        return jsonify({
            'error': 'Export Error',
            'message': 'Failed to generate CSV export',
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/system/status')
def system_status():
    """System health and status endpoint"""
    try:
        # Test API connectivity
        test_data = fetch_from_thingspeak(1)
        api_status = 'healthy' if test_data.get('feeds') else 'degraded'
        
        # Cache statistics
        cache_stats = {
            'entries': len(cache),
            'max_entries': 100,
            'hit_rate': 'N/A'  # Could be implemented with counters
        }
        
        status_info = {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'version': '2.0.0',
            'api_status': api_status,
            'cache_stats': cache_stats,
            'configuration': {
                'cache_ttl': CACHE_TTL,
                'api_timeout': API_TIMEOUT,
                'rate_limit': f"{RATE_LIMIT_REQUESTS}/{RATE_LIMIT_PERIOD}s"
            },
            'uptime': time() - app.start_time if hasattr(app, 'start_time') else 'N/A'
        }
        
        return jsonify(status_info)
        
    except Exception as e:
        logger.error(f"Error in system status endpoint: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '2.0.0'
    })

# Initialize app start time for uptime calculation
app.start_time = time()

if __name__ == '__main__':
    # Get configuration from environment
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', '6060'))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    
    logger.info(f"Starting Raspberry Pi Monitor on {host}:{port} (debug={debug})")
    logger.info(f"ThingSpeak Channel: {YOUR_CHANNEL_ID}")
    logger.info(f"Cache TTL: {CACHE_TTL}s, API Timeout: {API_TIMEOUT}s")
    
    app.run(host=host, port=port, debug=debug)
