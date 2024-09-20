const charts = {
    cpuTemp: createChart('cpuTempChart', 'CPU Temperature', 'line'),
    cpuUsage: createChart('cpuUsageChart', 'CPU Usage', 'line'),
    memUsage: createChart('memUsageChart', 'Memory Usage', 'line'),
    diskUsage: createChart('diskUsageChart', 'Disk Usage', 'line')
};

function createChart(canvasId, label, type) {
    return new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: type,
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4  // Curved lines
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // Ensure charts are responsive
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function fetchData() {
    fetch('/data')
        .then(response => response.json())
        .then(data => {
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
                charts.cpuTemp.data.datasets[0].data.push(feed.field1); // CPU Temp
                charts.cpuUsage.data.labels.push(time);
                charts.cpuUsage.data.datasets[0].data.push(feed.field3); // CPU Usage
                charts.memUsage.data.labels.push(time);
                charts.memUsage.data.datasets[0].data.push(feed.field4); // Memory Usage
                charts.diskUsage.data.labels.push(time);
                charts.diskUsage.data.datasets[0].data.push(feed.field5); // Disk Usage
            });

            // Update all charts
            for (const chart of Object.values(charts)) {
                chart.update();
            }
        });
}

function fetchHistoricalData(days) {
    fetch(`/historical_data/${days}`)
        .then(response => response.json())
        .then(data => {
            const historicalDiv = document.getElementById('historicalData');
            historicalDiv.innerHTML = '<h2>Historical Data</h2><pre>' + JSON.stringify(data, null, 2) + '</pre>';
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
    document.getElementById('uptime').innerHTML = `${formattedUptime}`;
}

function fetchData_uptime() {
    
    fetch('/data')  // Fetch data from server endpoint
        .then(response => response.json())
        .then(data => {
            const latestFeed = data.feeds[data.feeds.length - 1];
            const uptime = latestFeed.field8;  // Assuming field8 contains the uptime in hours
            updateUptime(uptime);
        });
}

// Fetch data initially
fetchData_uptime()
fetchData();

// Fetch new data every 15 seconds
setInterval(fetchData_uptime,1)
setInterval(fetchData, 1);

