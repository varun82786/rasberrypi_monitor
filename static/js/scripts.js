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
                tension: 0.4  // Set tension for curved lines
            }]
        },
        options: {
            responsive: true,
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
    // Convert the UTC timestamp to a Date object
    const utcDate = new Date(utcTimestamp);

    // IST offset in milliseconds (UTC + 5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    
    // Create a new Date object for IST
    const istDate = new Date(utcDate.getTime() + istOffset);

    // Extract the time components (hours, minutes, seconds)
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

    // Return the formatted IST time in HH:MM:SS
    return `${hours}:${minutes}:${seconds}`;
}

setInterval(fetchData, 15000); // Fetch new data every 15 seconds
