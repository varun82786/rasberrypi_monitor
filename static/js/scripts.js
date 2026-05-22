// Enhanced configuration and state management
const CONFIG = {
    refreshInterval: 5000, // 5 seconds
    maxRetries: 3,
    retryDelay: 2000, // 2 seconds
    alertTimeout: 6000, // 6 seconds
    chartAnimationDuration: 750
};

const STATE = {
    isOnline: true,
    retryCount: 0,
    lastSuccessfulUpdate: null,
    refreshCountdown: 5,
    isPaused: false
};

const charts = {
    cpuTemp: createChart('cpuTempChart', 'CPU Temperature (°C)', 'line'),
    cpuUsage: createChart('cpuUsageChart', 'CPU Usage (%)', 'line'),
    memUsage: createChart('memUsageChart', 'Memory Usage (GB)', 'line'),
    diskUsage: createChart('diskUsageChart', 'Disk Usage (GB)', 'line')
};

// Tracking for min/max values
const valueTracking = {
    field1: { min: Infinity, max: -Infinity },
    field3: { min: Infinity, max: -Infinity },
    field4: { min: Infinity, max: -Infinity },
    field5: { min: Infinity, max: -Infinity }
};

// Alert state
let lastAlertCheck = {};

function createChart(canvasId, label, type) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
        console.error(`Canvas element ${canvasId} not found`);
        return null;
    }
    
    return new Chart(ctx.getContext('2d'), {
        type: type,
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: 'rgba(0, 212, 255, 1)',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: 'rgba(0, 212, 255, 1)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: CONFIG.chartAnimationDuration
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.9)',
                    titleColor: '#00d4ff',
                    bodyColor: 'rgba(255, 255, 255, 0.8)',
                    borderColor: 'rgba(0, 212, 255, 0.5)',
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                }
            }
        }
    });
}

function updateRefreshCountdown() {
    if (STATE.isPaused) return;
    
    STATE.refreshCountdown--;
    const countdownEl = document.getElementById('refresh-countdown');
    if (countdownEl) {
        if (STATE.refreshCountdown > 0) {
            countdownEl.textContent = `Next update in ${STATE.refreshCountdown}s`;
            countdownEl.className = 'ml-2';
        } else {
            countdownEl.textContent = 'Updating...';
            countdownEl.className = 'ml-2 text-warning';
            STATE.refreshCountdown = 5; // Reset for next cycle
        }
    }
}

function updateConnectionStatus(isConnected, message = '') {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;
    
    STATE.isOnline = isConnected;
    statusEl.className = `status-indicator ${isConnected ? 'healthy' : 'critical'}`;
    statusEl.title = isConnected ? 'Connected to API' : `Connection Error: ${message}`;
    
    if (isConnected) {
        STATE.retryCount = 0;
        STATE.lastSuccessfulUpdate = new Date();
    }
}

function showAlert(message, type = 'info', fieldId = null, autoHide = true) {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;

    // Remove existing alert for the same field
    if (fieldId) {
        const existingAlert = alertContainer.querySelector(`[data-field="${fieldId}"]`);
        if (existingAlert) {
            existingAlert.remove();
        }
    }

    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    if (fieldId) alertEl.setAttribute('data-field', fieldId);
    
    alertEl.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${getAlertIcon(type)} mr-2"></i>
            <span>${message}</span>
            <button type="button" class="close ml-auto" data-dismiss="alert">
                <span>&times;</span>
            </button>
        </div>
    `;
    
    alertContainer.appendChild(alertEl);
    
    // Auto-remove after timeout
    if (autoHide) {
        setTimeout(() => {
            if (alertEl.parentNode) {
                alertEl.classList.remove('show');
                setTimeout(() => alertEl.remove(), 300);
            }
        }, CONFIG.alertTimeout);
    }
}

function getAlertIcon(type) {
    const icons = {
        'critical': 'exclamation-triangle',
        'warning': 'exclamation-circle',
        'ok': 'check-circle',
        'info': 'info-circle',
        'error': 'times-circle'
    };
    return icons[type] || 'info-circle';
}

function checkAlerts(data) {
    try {
        const feeds = data.feeds;
        if (!feeds || feeds.length === 0) return;
        
        const latestFeed = feeds[feeds.length - 1];
        if (!latestFeed) return;

        const thresholds = {
            'field1': { warning: 50, critical: 60, label: 'CPU Temp', unit: '°C' },
            'field3': { warning: 70, critical: 90, label: 'CPU Usage', unit: '%' },
            'field4': { warning: 4, critical: 6, label: 'Memory', unit: 'GB' },
            'field5': { warning: 100, critical: 200, label: 'Disk', unit: 'GB' }
        };

        for (const [field, config] of Object.entries(thresholds)) {
            const value = parseFloat(latestFeed[field]);
            if (isNaN(value)) continue;

            const currentStatus = lastAlertCheck[field];
            let newStatus = null;
            
            if (value > config.critical) {
                newStatus = 'critical';
                if (currentStatus !== 'critical') {
                    showAlert(
                        `🔴 CRITICAL: ${config.label} is ${value.toFixed(1)}${config.unit} (threshold: ${config.critical}${config.unit})`,
                        'critical',
                        field
                    );
                }
            } else if (value > config.warning) {
                newStatus = 'warning';
                if (currentStatus !== 'warning' && currentStatus !== 'critical') {
                    showAlert(
                        `🟡 WARNING: ${config.label} is ${value.toFixed(1)}${config.unit} (threshold: ${config.warning}${config.unit})`,
                        'warning',
                        field
                    );
                }
            } else {
                if (currentStatus === 'critical' || currentStatus === 'warning') {
                    showAlert(
                        `🟢 OK: ${config.label} returned to normal (${value.toFixed(1)}${config.unit})`,
                        'ok',
                        field
                    );
                }
            }
            
            lastAlertCheck[field] = newStatus;
        }
    } catch (error) {
        console.error('Error checking alerts:', error);
        showAlert('Error checking system alerts', 'error');
    }
}

function updateDataCards(data) {
    try {
        const feeds = data.feeds;
        if (!feeds || feeds.length === 0) {
            showAlert('No data available from sensors', 'warning');
            return;
        }
        
        const latestFeed = feeds[feeds.length - 1];
        if (!latestFeed) return;

        // CPU Temperature Card
        updateCard('cpu-temp', 'cpu-temp-status', 'cpu-temp-minmax', 
                  latestFeed.field1, '°C', 'field1', 50, 60);
        
        // CPU Usage Card
        updateCard('cpu-usage', 'cpu-usage-status', 'cpu-usage-minmax', 
                  latestFeed.field3, '%', 'field3', 70, 90);
        
        // Memory Usage Card
        updateCard('mem-usage', 'mem-usage-status', 'mem-usage-minmax', 
                  latestFeed.field4, ' GB', 'field4', 4, 6);
        
        // Disk Usage Card
        updateCard('disk-usage', 'disk-usage-status', 'disk-usage-minmax', 
                  latestFeed.field5, ' GB', 'field5', 100, 200);
        
        // Update Last Update Time
        const updateTime = new Date(latestFeed.created_at);
        const formattedTime = updateTime.toLocaleString();
        const lastUpdateEl = document.getElementById('last-update');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = `Last update: ${formattedTime}`;
            lastUpdateEl.title = `Full timestamp: ${updateTime.toISOString()}`;
        }
        
    } catch (error) {
        console.error('Error updating data cards:', error);
        showAlert('Error updating dashboard data', 'error');
    }
}

function updateCard(valueId, statusId, minmaxId, value, unit, field, warningThreshold, criticalThreshold) {
    const valueEl = document.getElementById(valueId);
    const statusEl = document.getElementById(statusId);
    
    if (!valueEl) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
        valueEl.textContent = '--' + unit;
        if (statusEl) {
            statusEl.className = 'status-indicator unknown';
            statusEl.title = 'No data available';
        }
        return;
    }
    
    // Update value with proper formatting
    const decimals = unit === ' GB' ? 2 : 1;
    valueEl.textContent = numValue.toFixed(decimals) + unit;
    
    // Update status indicator
    if (statusEl) {
        let statusClass = 'healthy';
        let statusTitle = 'Normal';
        
        if (numValue >= criticalThreshold) {
            statusClass = 'critical';
            statusTitle = `Critical (>${criticalThreshold}${unit})`;
        } else if (numValue >= warningThreshold) {
            statusClass = 'warning';
            statusTitle = `Warning (>${warningThreshold}${unit})`;
        }
        
        statusEl.className = `status-indicator ${statusClass}`;
        statusEl.title = statusTitle;
    }
    
    // Track min/max and update display
    trackMinMax(field, numValue);
    updateMinMaxDisplay(minmaxId, field, unit);
}

function trackMinMax(field, value) {
    if (valueTracking[field] && !isNaN(value)) {
        valueTracking[field].min = Math.min(valueTracking[field].min, value);
        valueTracking[field].max = Math.max(valueTracking[field].max, value);
    }
}

function updateMinMaxDisplay(elementId, field, unit = '') {
    const element = document.getElementById(elementId);
    if (!element || !valueTracking[field]) return;
    
    const tracking = valueTracking[field];
    if (tracking.min === Infinity || tracking.max === -Infinity) {
        element.innerHTML = '<small class="text-muted">No data</small>';
        return;
    }
    
    const decimals = unit === ' GB' ? 2 : 1;
    element.innerHTML = `
        <small class="text-muted">
            Min: ${tracking.min.toFixed(decimals)}${unit} | 
            Max: ${tracking.max.toFixed(decimals)}${unit}
        </small>
    `;
}

function resetMinMaxTracking() {
    Object.keys(valueTracking).forEach(field => {
        valueTracking[field] = { min: Infinity, max: -Infinity };
    });
    
    // Clear all minmax displays
    ['cpu-temp-minmax', 'cpu-usage-minmax', 'mem-usage-minmax', 'disk-usage-minmax'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = '<small class="text-muted">Tracking reset</small>';
    });
    
    showAlert('Min/Max tracking has been reset', 'info');
}

async function fetchData() {
    if (STATE.isPaused) return;
    
    showLoadingIndicator(true);
    STATE.refreshCountdown = 5; // Reset countdown
    
    try {
        const response = await fetch('/data');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Check for API errors in response
        if (data.error) {
            throw new Error(data.message || data.error);
        }
        
        // Update connection status
        updateConnectionStatus(true);
        
        // Update data cards and check alerts
        updateDataCards(data);
        checkAlerts(data);
        
        // Update charts
        updateCharts(data);
        
        showLoadingIndicator(false);
        
        // Show cache hit indicator if applicable
        if (data.cache_hit) {
            console.log('Data served from cache');
        }
        
    } catch (error) {
        console.error('Error fetching data:', error);
        handleFetchError(error);
    }
}

function handleFetchError(error) {
    STATE.retryCount++;
    updateConnectionStatus(false, error.message);
    showLoadingIndicator(false);
    
    if (STATE.retryCount <= CONFIG.maxRetries) {
        showAlert(
            `Connection error (attempt ${STATE.retryCount}/${CONFIG.maxRetries}). Retrying in ${CONFIG.retryDelay/1000}s...`,
            'warning'
        );
        
        setTimeout(() => {
            if (STATE.retryCount <= CONFIG.maxRetries) {
                fetchData();
            }
        }, CONFIG.retryDelay);
    } else {
        showAlert(
            `Failed to connect after ${CONFIG.maxRetries} attempts. Please check your connection.`,
            'error',
            null,
            false // Don't auto-hide
        );
    }
}

function updateCharts(data) {
    try {
        // Clear previous data
        Object.values(charts).forEach(chart => {
            if (chart) {
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
            }
        });

        // Get the data points (last 15)
        const feeds = data.feeds.slice(-15);
        
        feeds.forEach(feed => {
            const time = new Date(feed.created_at).toLocaleTimeString();
            
            if (charts.cpuTemp) {
                charts.cpuTemp.data.labels.push(time);
                charts.cpuTemp.data.datasets[0].data.push(parseFloat(feed.field1) || 0);
            }
            
            if (charts.cpuUsage) {
                charts.cpuUsage.data.labels.push(time);
                charts.cpuUsage.data.datasets[0].data.push(parseFloat(feed.field3) || 0);
            }
            
            if (charts.memUsage) {
                charts.memUsage.data.labels.push(time);
                charts.memUsage.data.datasets[0].data.push(parseFloat(feed.field4) || 0);
            }
            
            if (charts.diskUsage) {
                charts.diskUsage.data.labels.push(time);
                charts.diskUsage.data.datasets[0].data.push(parseFloat(feed.field5) || 0);
            }
        });

        // Update all charts
        Object.values(charts).forEach(chart => {
            if (chart) chart.update('none'); // No animation for real-time updates
        });
        
    } catch (error) {
        console.error('Error updating charts:', error);
        showAlert('Error updating charts', 'error');
    }
}

function extractISTTime(utcTimestamp) {
    try {
        const utcDate = new Date(utcTimestamp);
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(utcDate.getTime() + istOffset);

        const hours = String(istDate.getUTCHours()).padStart(2, '0');
        const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

        return `${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error('Error converting time:', error);
        return '--:--:--';
    }
}

async function fetchData_uptime() {
    try {
        const response = await fetch('/data');
        if (!response.ok) return;
        
        const data = await response.json();
        const feeds = data.feeds;
        
        if (feeds && feeds.length > 0) {
            const latestFeed = feeds[feeds.length - 1];
            const uptime = parseFloat(latestFeed.field8);
            if (!isNaN(uptime)) {
                updateUptime(uptime);
            }
        }
    } catch (error) {
        console.error('Error fetching uptime:', error);
    }
}

function updateUptime(uptimeHours) {
    try {
        const hours = Math.floor(uptimeHours);
        const minutes = Math.floor((uptimeHours - hours) * 60);
        const seconds = Math.floor(((uptimeHours - hours) * 60 - minutes) * 60);

        const formattedUptime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        const uptimeEl = document.getElementById('uptime');
        if (uptimeEl) {
            uptimeEl.textContent = formattedUptime;
            uptimeEl.title = `System uptime: ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
        }
    } catch (error) {
        console.error('Error updating uptime:', error);
    }
}

function showLoadingIndicator(show) {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.style.display = show ? 'flex' : 'none';
    }
}

function manualRefresh() {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Refreshing...';
    }
    
    // Reset retry count for manual refresh
    STATE.retryCount = 0;
    
    fetchData();
    fetchData_uptime();
    
    setTimeout(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
        }
    }, 1000);
}

function togglePause() {
    STATE.isPaused = !STATE.isPaused;
    const btn = document.getElementById('pause-btn');
    
    if (btn) {
        if (STATE.isPaused) {
            btn.innerHTML = '<i class="fas fa-play"></i> Resume';
            btn.className = 'btn btn-sm btn-success ml-2';
            showAlert('Auto-refresh paused', 'info');
        } else {
            btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            btn.className = 'btn btn-sm btn-warning ml-2';
            showAlert('Auto-refresh resumed', 'info');
            fetchData(); // Immediate refresh when resuming
        }
    }
}

function exportData(field) {
    const period = 'live'; // Default to live data for quick export
    const url = `/export/${field}/${period}`;
    
    showAlert('Preparing data export...', 'info');
    
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${field}_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showAlert('Export started - check your downloads', 'ok');
}

// Initialize tooltips
function initializeTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(element => {
        element.title = element.getAttribute('data-tooltip');
    });
}

function init_caller() {
    console.log('Initializing Raspberry Pi Monitor Dashboard v2.0');
    
    // Initialize tooltips
    initializeTooltips();
    
    // Initial fetch
    fetchData();
    fetchData_uptime();
    
    // Update refresh countdown every second
    setInterval(updateRefreshCountdown, 1000);
    
    // Set up auto-refresh
    setInterval(() => {
        if (!STATE.isPaused) {
            fetchData();
            fetchData_uptime();
        }
    }, CONFIG.refreshInterval);
    
    // Set up event listeners
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', manualRefresh);
    }
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'r':
                    e.preventDefault();
                    manualRefresh();
                    break;
                case ' ':
                    e.preventDefault();
                    togglePause();
                    break;
                case 'Escape':
                    // Clear all alerts
                    const alerts = document.querySelectorAll('.alert');
                    alerts.forEach(alert => alert.remove());
                    break;
            }
        }
    });
    
    // Add visibility change handler to pause when tab is not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Tab hidden - monitoring continues in background');
        } else {
            console.log('Tab visible - refreshing data');
            if (!STATE.isPaused) {
                fetchData();
                fetchData_uptime();
            }
        }
    });
    
    // Show initialization complete message
    setTimeout(() => {
        showAlert('Dashboard initialized successfully! Press Ctrl+R to refresh, Ctrl+Space to pause/resume.', 'ok');
    }, 1000);
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init_caller);
} else {
    init_caller();
}
