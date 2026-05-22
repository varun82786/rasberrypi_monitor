let chart;
let currentPeriod = 'live';

function fetchData_period(period) {
    currentPeriod = period;
    showLoadingIndicator(true);
    
    // Update active button
    document.querySelectorAll('.time-range-container button').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    fetch(`/historic_data/field1/${period}`)
        .then(response => response.json())
        .then(data => {
            const feeds = data.feeds;
            const labels = [];
            const values = [];

            feeds.forEach(feed => {
                const time = extractISTTime(feed.created_at);
                labels.push(time);
                values.push(parseFloat(feed.field1));
            });

            updateChart(labels, values);
            updateStatistics(values);
            showLoadingIndicator(false);
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            showLoadingIndicator(false);
        });
}

function updateChart(labels, values) {
    const ctx = document.getElementById('graphCanvas').getContext('2d');
    
    if (chart) {
        chart.destroy();  // Destroy previous chart instance if exists
    }

    const canvas = document.getElementById('graphCanvas');
    canvas.style.display = 'block';
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '{{ field | title }}',
                data: values,
                borderColor: 'rgba(0, 212, 255, 1)',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: 'rgba(0, 212, 255, 1)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverRadius: 7
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

function updateStatistics(values) {
    if (values.length === 0) return;
    
    const currentValue = values[values.length - 1];
    const average = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    const dataPoints = values.length;
    
    const currentEl = document.getElementById('current-value');
    const avgEl = document.getElementById('average-value');
    const pointsEl = document.getElementById('data-points');
    
    if (currentEl) currentEl.textContent = currentValue.toFixed(2);
    if (avgEl) avgEl.textContent = average;
    if (pointsEl) pointsEl.textContent = dataPoints;
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

// Fetch initial data on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => fetchData_period('live'));
} else {
    fetchData_period('live');
}
