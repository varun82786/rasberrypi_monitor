const charts = {
    cpuTemp: createChart('cpuTempChart', 'CPU Temperature (°C)', 'line'),
    cpuUsage: createChart('cpuUsageChart', 'CPU Usage (%)', 'line'),
    memUsage: createChart('memUsageChart', 'Memory Usage (GB)', 'line'),
    diskUsage: createChart('diskUsageChart', 'Disk Usage (GB)', 'line')
};

function createChart(canvasId, label, type) {
    return new Chart(document.getElementById(canvasId).getContext('2d'), {
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
            plugins: {
                legend: {
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: { size: 12, weight: 'bold' }
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
}

function updateDataCards(data) {
    try {
        const latestFeed = data.feeds[data.feeds.length - 1];
        if (latestFeed) {
            // Update CPU Temperature Card
            const cpuTemp = parseFloat(latestFeed.field1);
            if (!isNaN(cpuTemp)) {
                document.getElementById('cpu-temp').textContent = cpuTemp.toFixed(1) + '°C';
                updateStatusIndicator('cpu-temp', cpuTemp, 50, 60);
            }
            
            // Update CPU Usage Card
            const cpuUsage = parseFloat(latestFeed.field3);
            if (!isNaN(cpuUsage)) {
                document.getElementById('cpu-usage').textContent = cpuUsage.toFixed(1) + '%';
                updateStatusIndicator('cpu-usage', cpuUsage, 70, 90);
            }
            
            // Update Memory Usage Card
            const memUsage = parseFloat(latestFeed.field4);
            if (!isNaN(memUsage)) {
                document.getElementById('mem-usage').textContent = memUsage.toFixed(2) + ' GB';
                updateStatusIndicator('mem-usage', memUsage, 4, 6);
            }
            
            // Update Disk Usage Card
            const diskUsage = parseFloat(latestFeed.field5);
            if (!isNaN(diskUsage)) {
                document.getElementById('disk-usage').textContent = diskUsage.toFixed(2) + ' GB';
                updateStatusIndicator('disk-usage', diskUsage, 100, 200);
            }
            
            // Update Last Update Time
            const updateTime = extractISTTime(latestFeed.created_at);
            document.getElementById('last-update').textContent = 'Last update: ' + updateTime;
        }
    } catch (error) {
        console.error('Error updating data cards:', error);
    }
}

function updateStatusIndicator(elementId, value, warningThreshold, criticalThreshold) {
    const element = document.getElementById(elementId);
    const parent = element.closest('.data-card');
    if (!parent) return;
    
    const indicator = parent.querySelector('.status-indicator');
    if (!indicator) return;
    
    indicator.classList.remove('healthy', 'warning', 'critical');
    
    if (value >= criticalThreshold) {
        indicator.classList.add('critical');
    } else if (value >= warningThreshold) {
        indicator.classList.add('warning');
    } else {
        indicator.classList.add('healthy');
    }
}

function fetchData() {
    showLoadingIndicator(true);
    
    fetch('/data')
        .then(response => response.json())
        .then(data => {
            // Update data cards
            updateDataCards(data);
            
            // Clear previous data
            Object.values(charts).forEach(chart => {
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
            });

            // Get the last 15 data points
            const feeds = data.feeds.slice(-15);
            feeds.forEach(feed => {
                const time = extractISTTime(feed.created_at);
                charts.cpuTemp.data.labels.push(time);
                charts.cpuTemp.data.datasets[0].data.push(parseFloat(feed.field1));
                charts.cpuUsage.data.labels.push(time);
                charts.cpuUsage.data.datasets[0].data.push(parseFloat(feed.field3));
                charts.memUsage.data.labels.push(time);
                charts.memUsage.data.datasets[0].data.push(parseFloat(feed.field4));
                charts.diskUsage.data.labels.push(time);
                charts.diskUsage.data.datasets[0].data.push(parseFloat(feed.field5));
            });

            // Update all charts
            for (const chart of Object.values(charts)) {
                chart.update();
            }
            
            showLoadingIndicator(false);
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            showLoadingIndicator(false);
        });
}

function extractISTTime(utcTimestamp) {
    const utcDate = new Date(utcTimestamp);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utcDate.getTime() + istOffset);

    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

function updateUptime(uptimeHours) {
    const hours = Math.floor(uptimeHours);
    const minutes = Math.floor((uptimeHours - hours) * 60);
    const seconds = Math.floor(((uptimeHours - hours) * 60 - minutes) * 60);

    const formattedUptime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.getElementById('uptime').innerHTML = formattedUptime;
}

function fetchData_uptime() {
    fetch('/data')
        .then(response => response.json())
        .then(data => {
            const latestFeed = data.feeds[data.feeds.length - 1];
            if (latestFeed) {
                const uptime = parseFloat(latestFeed.field8);
                if (!isNaN(uptime)) {
                    updateUptime(uptime);
                }
            }
        })
        .catch(error => console.error('Error fetching uptime:', error));
}

function showLoadingIndicator(show) {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.style.display = show ? 'flex' : 'none';
    }
}

function init_caller() {
    // Initial fetch
    fetchData();
    fetchData_uptime();
    
    // Set up auto-refresh every 5 seconds
    setInterval(fetchData, 5000);
    setInterval(fetchData_uptime, 5000);
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init_caller);
} else {
    init_caller();
}
