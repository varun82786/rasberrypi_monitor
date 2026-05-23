// Enhanced graph functionality with better error handling
let chart;
let currentPeriod = 'live';
let isLoading = false;

const CONFIG = {
    maxRetries: 3,
    retryDelay: 2000,
    chartAnimationDuration: 750
};

const STATE = {
    retryCount: 0,
    lastSuccessfulUpdate: null
};

function fetchData_period(period) {
    if (isLoading) return;
    
    console.log('Fetching data for period:', period);
    currentPeriod = period;
    isLoading = true;
    showLoadingIndicator(true);
    
    // Update active button
    document.querySelectorAll('.time-range-container button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and activate the button for this period
    const activeButton = document.querySelector(`button[data-period="${period}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
        console.log('Activated button for period:', period);
    } else {
        console.warn('Could not find button for period:', period);
    }
    
    // Use the CURRENT_FIELD variable from the template
    const url = `/historic_data/${CURRENT_FIELD}/${period}`;
    console.log('Fetching from URL:', url);
    
    fetch(url)
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Received data:', data);
            if (data.error) {
                throw new Error(data.message || data.error);
            }
            
            const feeds = data.feeds || [];
            const labels = [];
            const values = [];

            feeds.forEach(feed => {
                const time = extractISTTime(feed.created_at);
                labels.push(time);
                const fieldValue = feed[CURRENT_FIELD];
                values.push(parseFloat(fieldValue) || 0);
            });

            console.log('Processed data - Labels:', labels.length, 'Values:', values.length);
            updateChart(labels, values, data);
            updateStatistics(values, data.statistics);
            showLoadingIndicator(false);
            isLoading = false;
            STATE.retryCount = 0;
            STATE.lastSuccessfulUpdate = new Date();
            
            // Show cache hit indicator
            if (data.cache_hit) {
                console.log('Data served from cache');
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            handleFetchError(error, period);
        });
}
                labels.push(time);
                const fieldValue = feed[CURRENT_FIELD];
                values.push(parseFloat(fieldValue) || 0);
            });

            updateChart(labels, values, data);
            updateStatistics(values, data.statistics);
            showLoadingIndicator(false);
            isLoading = false;
            STATE.retryCount = 0;
            STATE.lastSuccessfulUpdate = new Date();
            
            // Show cache hit indicator
            if (data.cache_hit) {
                console.log('Data served from cache');
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            handleFetchError(error, period);
        });
}
function handleFetchError(error, period) {
    STATE.retryCount++;
    isLoading = false;
    showLoadingIndicator(false);
    
    if (STATE.retryCount <= CONFIG.maxRetries) {
        console.log(`Retrying fetch (attempt ${STATE.retryCount}/${CONFIG.maxRetries})...`);
        setTimeout(() => {
            fetchData_period(period);
        }, CONFIG.retryDelay);
    } else {
        showError(`Failed to load data after ${CONFIG.maxRetries} attempts: ${error.message}`);
    }
}

function showError(message) {
    const canvas = document.getElementById('graphCanvas');
    const container = canvas.parentElement;
    
    // Create error message element
    let errorEl = container.querySelector('.error-message');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'error-message text-center p-4';
        errorEl.style.color = 'var(--danger-color)';
        container.appendChild(errorEl);
    }
    
    errorEl.innerHTML = `
        <i class="fas fa-exclamation-triangle mb-2"></i><br>
        <strong>Error Loading Data</strong><br>
        <small>${message}</small><br>
        <button class="btn btn-sm btn-outline-light mt-2" onclick="retryFetch()">
            <i class="fas fa-redo"></i> Retry
        </button>
    `;
    
    canvas.style.display = 'none';
}

function retryFetch() {
    STATE.retryCount = 0;
    const errorEl = document.querySelector('.error-message');
    if (errorEl) errorEl.remove();
    
    const canvas = document.getElementById('graphCanvas');
    canvas.style.display = 'block';
    
    fetchData_period(currentPeriod);
}

function updateChart(labels, values, data = {}) {
    console.log('Updating chart with:', { labels: labels.length, values: values.length, data });
    
    const canvas = document.getElementById('graphCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get canvas context');
        return;
    }
    
    if (chart) {
        console.log('Destroying existing chart');
        chart.destroy();  // Destroy previous chart instance if exists
    }

    canvas.style.display = 'block';
    
    // Hide any error messages
    const errorEl = document.querySelector('.error-message');
    if (errorEl) errorEl.style.display = 'none';
    
    // Get the label for the current field
    const fieldLabel = FIELD_LABELS[CURRENT_FIELD] || CURRENT_FIELD;
    console.log('Field label:', fieldLabel);
    
    // Determine chart color based on thresholds
    let borderColor = 'rgba(0, 212, 255, 1)';
    let backgroundColor = 'rgba(0, 212, 255, 0.1)';
    
    if (data.thresholds && values.length > 0) {
        const latestValue = values[values.length - 1];
        if (latestValue > data.thresholds.critical) {
            borderColor = 'rgba(255, 0, 110, 1)';
            backgroundColor = 'rgba(255, 0, 110, 0.1)';
        } else if (latestValue > data.thresholds.warning) {
            borderColor = 'rgba(255, 159, 28, 1)';
            backgroundColor = 'rgba(255, 159, 28, 0.1)';
        }
    }
    
    console.log('Creating new chart...');
    try {
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: fieldLabel,
                    data: values,
                    borderColor: borderColor,
                    backgroundColor: backgroundColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: borderColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 7
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
                        borderWidth: 1,
                        callbacks: {
                            afterBody: function(context) {
                                if (data.thresholds) {
                                    return [
                                        `Warning: ${data.thresholds.warning}`,
                                        `Critical: ${data.thresholds.critical}`
                                    ];
                                }
                                return [];
                            }
                        }
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
        console.log('Chart created successfully');
    } catch (error) {
        console.error('Error creating chart:', error);
        showError(`Failed to create chart: ${error.message}`);
    }
}
function updateStatistics(values, serverStats = null) {
    if (values.length === 0) {
        updateStatElement('current-value', 'No data');
        updateStatElement('average-value', 'No data');
        updateStatElement('data-points', '0');
        return;
    }
    
    // Use server-provided statistics if available, otherwise calculate locally
    let stats;
    if (serverStats && serverStats.average !== undefined) {
        stats = serverStats;
    } else {
        const currentValue = values[values.length - 1];
        const average = (values.reduce((a, b) => a + b, 0) / values.length);
        stats = {
            average: average,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length
        };
    }
    
    const currentValue = values[values.length - 1];
    
    updateStatElement('current-value', currentValue.toFixed(2));
    updateStatElement('average-value', stats.average.toFixed(2));
    updateStatElement('data-points', stats.count || values.length);
    
    // Add min/max if available
    const minMaxEl = document.getElementById('min-max-values');
    if (minMaxEl && stats.min !== undefined && stats.max !== undefined) {
        minMaxEl.innerHTML = `
            <small class="text-muted">
                Min: ${stats.min.toFixed(2)} | Max: ${stats.max.toFixed(2)}
            </small>
        `;
    }
}

function updateStatElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
        
        // Add animation class
        element.classList.add('stat-updated');
        setTimeout(() => element.classList.remove('stat-updated'), 300);
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

function showLoadingIndicator(show) {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.style.display = show ? 'flex' : 'none';
    }
    const canvas = document.getElementById('graphCanvas');
    if (canvas) {
        canvas.style.display = show ? 'none' : 'block';
    }
}

// Export functionality
function exportCurrentData() {
    const url = `/export/${CURRENT_FIELD}/${currentPeriod}`;
    
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${CURRENT_FIELD}_${currentPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Export started for', CURRENT_FIELD, currentPeriod);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'r':
                e.preventDefault();
                STATE.retryCount = 0;
                fetchData_period(currentPeriod);
                break;
            case 'e':
                e.preventDefault();
                exportCurrentData();
                break;
        }
    }
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGraphPage);
} else {
    initializeGraphPage();
}

// Debug functions
function toggleDebug() {
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo.style.display === 'none') {
        debugInfo.style.display = 'block';
        updateDebugInfo();
    } else {
        debugInfo.style.display = 'none';
    }
}

function updateDebugInfo() {
    const fieldLabel = document.getElementById('debug-field-label');
    const chartjsStatus = document.getElementById('debug-chartjs');
    const canvasStatus = document.getElementById('debug-canvas');
    
    if (fieldLabel) {
        fieldLabel.textContent = FIELD_LABELS[CURRENT_FIELD] || 'Unknown';
    }
    
    if (chartjsStatus) {
        chartjsStatus.textContent = typeof Chart !== 'undefined' ? 'Yes' : 'No';
        chartjsStatus.style.color = typeof Chart !== 'undefined' ? 'green' : 'red';
    }
    
    if (canvasStatus) {
        const canvas = document.getElementById('graphCanvas');
        canvasStatus.textContent = canvas ? 'Found' : 'Not Found';
        canvasStatus.style.color = canvas ? 'green' : 'red';
    }
}

function initializeGraphPage() {
    console.log('DOM loaded - Graph page initialized for field:', CURRENT_FIELD);
    
    // Update debug info
    updateDebugInfo();
    
    // Check if required elements exist
    const canvas = document.getElementById('graphCanvas');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    if (!canvas) {
        console.error('Canvas element not found!');
        showError('Canvas element not found. Please refresh the page.');
        return;
    }
    
    if (!loadingIndicator) {
        console.error('Loading indicator not found!');
    }
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded!');
        showError('Chart.js library failed to load. Please refresh the page.');
        return;
    }
    
    // Set up event listeners for time range buttons
    const timeRangeContainer = document.querySelector('.time-range-container');
    if (timeRangeContainer) {
        timeRangeContainer.addEventListener('click', function(e) {
            const button = e.target.closest('button[data-period]');
            if (button) {
                const period = button.getAttribute('data-period');
                console.log('Button clicked for period:', period);
                fetchData_period(period);
            }
        });
        console.log('Event listeners set up for time range buttons');
    } else {
        console.error('Time range container not found!');
    }
    
    console.log('All required elements found, starting initial fetch...');
    
    // Add a small delay to ensure everything is ready
    setTimeout(() => {
        fetchData_period('live');
    }, 100);
}