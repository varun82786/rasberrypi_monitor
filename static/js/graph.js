let chart;

function fetchData_period(period) {
    fetch(`/historic_data/field1/${period}`)
        .then(response => response.json())
        .then(data => {
            console.log(data)
            const feeds = data.feeds;
            const labels = [];
            const values = [];

            feeds.forEach(feed => {
                const time = extractISTTime(feed.created_at);
                labels.push(time);
                values.push(feed.field1); //[`field{{ field[-1] }}`]);  // Field1, Field2, etc.
            });

            updateChart(labels, values);
        });
}

function updateChart(labels, values) {
    console.log(labels)
    console.log(values)
    const ctx = document.getElementById('graphCanvas').getContext('2d');
    
    if (chart) {
        chart.destroy();  // Destroy previous chart instance if exists
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '{{ field | title }}',
                data: values,
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                fill: false,
                tension: 0.4  // Curved lines
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

function extractISTTime(utcTimestamp) {
    const utcDate = new Date(utcTimestamp);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utcDate.getTime() + istOffset);

    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

fetchData_period('live');  // Fetch live data on page load
