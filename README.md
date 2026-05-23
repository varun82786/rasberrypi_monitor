# Raspberry Pi System Monitor Dashboard

A modern, real-time web dashboard for monitoring Raspberry Pi system metrics with enhanced error handling, security features, and improved user experience.

## ✨ Features

### 🔧 Core Functionality
- **Real-time monitoring** of CPU temperature, usage, memory, disk, and network
- **Interactive charts** with Chart.js for data visualization
- **Historical data analysis** with multiple time ranges (live to 72 hours)
- **ThingSpeak integration** for data collection and storage
- **CSV data export** functionality

### 🛡️ Security & Reliability
- **Environment variable configuration** for sensitive data
- **Comprehensive error handling** with retry mechanisms
- **Input validation** and sanitization
- **Rate limiting** to prevent API abuse
- **Caching system** for improved performance
- **Connection status monitoring** with automatic reconnection

### 🎨 Enhanced User Experience
- **Modern sci-fi themed UI** with responsive design
- **Real-time alerts** for threshold violations
- **Auto-refresh with countdown** and manual refresh options
- **Keyboard shortcuts** (Ctrl+R refresh, Ctrl+Space pause/resume)
- **Loading indicators** and error messages
- **Tooltips and help text** for better usability
- **Min/Max value tracking** for performance monitoring

### 📊 Advanced Features
- **Smart caching** with TTL (Time To Live)
- **Automatic retry logic** for failed API calls
- **Threshold-based color coding** in charts
- **Export functionality** with detailed CSV reports
- **System health monitoring** endpoint
- **Comprehensive logging** with configurable levels

## 🚀 Quick Start

### Prerequisites
- Python 3.7+
- ThingSpeak account and API key
- Modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rasberrypi_monitor
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your ThingSpeak credentials
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

5. **Access the dashboard**
   Open http://localhost:6060 in your browser

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# ThingSpeak API Configuration
THINGSPEAK_READ_API_KEY=your_api_key_here
THINGSPEAK_CHANNEL_ID=your_channel_id
THINGSPEAK_API_TIMEOUT=10

# Flask Configuration
FLASK_HOST=0.0.0.0
FLASK_PORT=6060
FLASK_DEBUG=False
SECRET_KEY=your-secret-key-here

# Rate Limiting Configuration
RATE_LIMIT_REQUESTS=30
RATE_LIMIT_PERIOD=60

# Cache Configuration
CACHE_TTL=8

# Logging Configuration
LOG_LEVEL=INFO
```

### ThingSpeak Setup

1. Create a ThingSpeak account at https://thingspeak.com
2. Create a new channel with the following fields:
   - Field 1: CPU Temperature (°C)
   - Field 2: GPU Temperature (°C)
   - Field 3: CPU Usage (%)
   - Field 4: Memory Usage (GB)
   - Field 5: Disk Usage (GB)
   - Field 6: Bytes Sent (GB)
   - Field 7: Bytes Received (GB)
   - Field 8: System Uptime (hours)

3. Get your Channel ID and Read API Key from the channel settings

## 🎮 Usage

### Dashboard Navigation
- **Main Dashboard**: Real-time overview with key metrics and charts
- **Detailed Analysis**: Click any metric button for historical analysis
- **Export Data**: Use export buttons or Ctrl+E to download CSV reports

### Keyboard Shortcuts
- `Ctrl + R`: Manual refresh
- `Ctrl + Space`: Pause/resume auto-refresh
- `Ctrl + E`: Export current data (on graph pages)
- `Escape`: Clear all alerts

### API Endpoints

- `GET /`: Main dashboard
- `GET /data`: Latest sensor data (JSON)
- `GET /historic_data/<field>/<period>`: Historical data
- `GET /alerts`: Current threshold violations
- `GET /export/<field>/<period>`: CSV export
- `GET /health`: Health check
- `GET /system/status`: System status and metrics

## 🔧 Development

### Project Structure
```
rasberrypi_monitor/
├── app.py                 # Main Flask application
├── templates/
│   ├── index.html        # Main dashboard template
│   └── graph.html        # Graph analysis template
├── static/
│   ├── css/
│   │   ├── styles.css    # Main stylesheet
│   │   └── graph.css     # Graph-specific styles
│   └── js/
│       ├── scripts.js    # Main dashboard JavaScript
│       └── graph.js      # Graph functionality
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
└── README.md             # This file
```

### Error Handling
The application includes comprehensive error handling:
- **API timeouts** with automatic retry
- **Connection failures** with graceful degradation
- **Invalid data** with sanitization and validation
- **Rate limiting** with informative error messages
- **Client-side errors** with user-friendly notifications

### Performance Features
- **Intelligent caching** reduces API calls
- **Rate limiting** prevents abuse
- **Lazy loading** for better initial load times
- **Optimized chart updates** for smooth animations
- **Background refresh** when tab is not visible

## 🚀 Deployment

### Production Deployment

1. **Set production environment variables**
   ```bash
   export FLASK_DEBUG=False
   export SECRET_KEY=your-production-secret-key
   ```

2. **Use a production WSGI server**
   ```bash
   gunicorn -w 4 -b 0.0.0.0:6060 app:app
   ```

3. **Set up reverse proxy** (nginx recommended)
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://127.0.0.1:6060;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

### Docker Deployment

```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 6060
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:6060", "app:app"]
```

## 🔍 Monitoring & Troubleshooting

### Health Checks
- Visit `/health` for basic health status
- Visit `/system/status` for detailed system information

### Logging
Logs are configured based on the `LOG_LEVEL` environment variable:
- `DEBUG`: Detailed debugging information
- `INFO`: General information (default)
- `WARNING`: Warning messages only
- `ERROR`: Error messages only

### Common Issues

1. **API Connection Errors**
   - Check ThingSpeak API key and channel ID
   - Verify internet connection
   - Check rate limiting settings

2. **Performance Issues**
   - Increase cache TTL
   - Reduce refresh frequency
   - Check system resources

3. **UI Not Loading**
   - Check browser console for JavaScript errors
   - Verify static file serving
   - Clear browser cache

## 📈 Version History

### v2.0.0 (Current)
- ✅ Enhanced error handling and input validation
- ✅ Environment variable configuration
- ✅ Improved UX with refresh countdown and tooltips
- ✅ Comprehensive logging and monitoring
- ✅ Smart caching and rate limiting
- ✅ Keyboard shortcuts and accessibility improvements
- ✅ Advanced export functionality
- ✅ Real-time connection status monitoring

### v1.0.0
- Basic dashboard functionality
- ThingSpeak integration
- Simple charts and data display

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- ThingSpeak for IoT data platform
- Chart.js for beautiful charts
- Bootstrap for responsive UI components
- Font Awesome for icons