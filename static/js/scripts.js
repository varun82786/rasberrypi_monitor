/* ============================================================
   RPi Monitor — Dashboard Script (scripts.js)
   Handles: data fetching, metric cards, sparklines,
            main charts, alerts, health score, countdown
   ============================================================ */

'use strict';

// ── Configuration ──────────────────────────────────────────
const CONFIG = {
  refreshInterval: 5000,
  maxRetries: 3,
  retryDelay: 2000,
  alertTimeout: 6000,
  chartAnimationDuration: 600,
  sparklinePoints: 15,
};

const STATE = {
  isOnline: true,
  retryCount: 0,
  lastSuccessfulUpdate: null,
  refreshCountdown: 5,
  isPaused: false,
};

// ── Sparkline history ──────────────────────────────────────
const sparkHistory = {
  field1: [], // CPU Temp
  field3: [], // CPU Usage
  field4: [], // Memory
  field5: [], // Disk
  field6: [], // Bytes Sent
  field8: [], // Uptime
};

// ── Min/Max tracking ───────────────────────────────────────
const valueTracking = {
  field1: { min: Infinity, max: -Infinity },
  field3: { min: Infinity, max: -Infinity },
  field4: { min: Infinity, max: -Infinity },
  field5: { min: Infinity, max: -Infinity },
};

let lastAlertCheck = {};

// ── Chart.js global defaults ───────────────────────────────
Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = 'hsl(215, 20%, 64%)';

// ── Shared Chart.js config factory ─────────────────────────
function getChartDefaults(ctx, label, color) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, color.replace(')', ', 0.25)').replace('hsl', 'hsla'));
  gradient.addColorStop(1, color.replace(')', ', 0)').replace('hsl', 'hsla'));

  return {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 1.5,
        fill: true,
        tension: 0.45,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointBorderColor: 'hsl(222, 47%, 4%)',
        pointBorderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: CONFIG.chartAnimationDuration, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222, 40%, 9%)',
          titleColor: 'hsl(210, 36%, 96%)',
          bodyColor: 'hsl(215, 20%, 64%)',
          borderColor: 'hsl(222, 28%, 18%)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: { weight: '600', size: 12 },
          bodyFont: { size: 11 },
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (ctx) => `  ${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'hsla(222, 28%, 15%, 0.6)', drawBorder: false },
          ticks: { maxRotation: 0, maxTicksLimit: 6, font: { size: 10 } },
          border: { display: false },
        },
        y: {
          beginAtZero: false,
          grid: { color: 'hsla(222, 28%, 15%, 0.6)', drawBorder: false },
          ticks: { maxTicksLimit: 5, font: { size: 10 } },
          border: { display: false },
        },
      },
    },
  };
}

// ── Initialize main charts ─────────────────────────────────
function initChart(canvasId, label, color) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const ctx = el.getContext('2d');
  return new Chart(ctx, getChartDefaults(ctx, label, color));
}

const charts = {
  cpuTemp:  initChart('cpuTempChart',  'CPU Temperature (°C)', 'hsl(196, 80%, 48%)'),
  cpuUsage: initChart('cpuUsageChart', 'CPU Usage (%)',          'hsl(152, 60%, 48%)'),
  memUsage: initChart('memUsageChart', 'Memory Usage (GB)',      'hsl(38, 90%, 58%)'),
  diskUsage:initChart('diskUsageChart','Disk Usage (GB)',         'hsl(196, 70%, 62%)'),
};

// ── Sparkline chart factory ────────────────────────────────
const sparkCharts = {};

function initSparkline(canvasId, color) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, color.replace(')', ', 0.3)').replace('hsl', 'hsla'));
  grad.addColorStop(1, color.replace(')', ', 0)').replace('hsl', 'hsla'));

  sparkCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: color,
        backgroundColor: grad,
        borderWidth: 1,
        fill: true,
        tension: 0.45,
        pointRadius: 0,
        pointHoverRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: false },
      },
    },
  });
}

initSparkline('spark-cpu-temp',  'hsl(196, 80%, 48%)');
initSparkline('spark-cpu-usage', 'hsl(152, 60%, 48%)');
initSparkline('spark-mem-usage', 'hsl(38, 90%, 58%)');
initSparkline('spark-disk-usage','hsl(196, 70%, 62%)');
initSparkline('spark-network',   'hsl(270, 60%, 65%)');
initSparkline('spark-uptime',    'hsl(152, 60%, 48%)');

function updateSparkline(canvasId, data) {
  const chart = sparkCharts[canvasId];
  if (!chart) return;
  chart.data.labels = data.map((_, i) => i);
  chart.data.datasets[0].data = data;
  chart.update('none');
}

// ── Countdown ──────────────────────────────────────────────
function updateRefreshCountdown() {
  if (STATE.isPaused) return;
  STATE.refreshCountdown = Math.max(0, STATE.refreshCountdown - 1);
  const el = document.getElementById('refresh-countdown');
  if (!el) return;
  if (STATE.refreshCountdown > 0) {
    el.textContent = `${STATE.refreshCountdown}s`;
  } else {
    el.textContent = '…';
    STATE.refreshCountdown = 5;
  }
}

// ── Connection status ──────────────────────────────────────
function updateConnectionStatus(isConnected, message = '') {
  STATE.isOnline = isConnected;
  const dot  = document.getElementById('connection-status');
  const text = document.getElementById('connection-status-text');

  if (dot) {
    dot.className = `status-dot ${isConnected ? 'healthy' : 'critical'}`;
    dot.title = isConnected ? 'Connected to ThingSpeak API' : `Error: ${message}`;
  }
  if (text) {
    text.textContent = isConnected ? 'Connected' : 'Offline';
  }

  if (isConnected) {
    STATE.retryCount = 0;
    STATE.lastSuccessfulUpdate = new Date();
  }
}

// ── Health score ───────────────────────────────────────────
function computeHealthScore(latestFeed) {
  const checks = [
    { value: parseFloat(latestFeed.field1), warn: 50, crit: 60 },  // CPU Temp
    { value: parseFloat(latestFeed.field3), warn: 70, crit: 90 },  // CPU Usage
    { value: parseFloat(latestFeed.field4), warn: 4,  crit: 6  },  // Memory
    { value: parseFloat(latestFeed.field5), warn: 100,crit: 200},  // Disk
  ];

  let penalty = 0;
  for (const c of checks) {
    if (isNaN(c.value)) continue;
    if (c.value >= c.crit) penalty += 30;
    else if (c.value >= c.warn) penalty += 12;
  }

  return Math.max(0, 100 - penalty);
}

function updateHealthBadge(score) {
  const badge = document.getElementById('health-badge');
  const text  = document.getElementById('health-score-text');
  if (!badge || !text) return;

  badge.className = 'health-badge';
  if (score >= 80) {
    badge.classList.add('score-high');
    text.textContent = `Healthy ${score}`;
  } else if (score >= 50) {
    badge.classList.add('score-medium');
    text.textContent = `Degraded ${score}`;
  } else {
    badge.classList.add('score-low');
    text.textContent = `Critical ${score}`;
  }
}

// ── Alert system ───────────────────────────────────────────
const ALERT_ICONS = {
  critical: 'fa-triangle-exclamation',
  warning:  'fa-circle-exclamation',
  ok:       'fa-circle-check',
  info:     'fa-circle-info',
  error:    'fa-circle-xmark',
};

function showAlert(message, type = 'info', fieldId = null, autoHide = true) {
  const container = document.getElementById('alert-container');
  if (!container) return;

  if (fieldId) {
    const existing = container.querySelector(`[data-field="${fieldId}"]`);
    if (existing) existing.remove();
  }

  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  if (fieldId) el.setAttribute('data-field', fieldId);
  el.innerHTML = `
    <i class="fas ${ALERT_ICONS[type] || ALERT_ICONS.info}" aria-hidden="true"></i>
    <span>${message}</span>
    <button class="alert-close" aria-label="Dismiss">&times;</button>
  `;

  el.querySelector('.alert-close').addEventListener('click', () => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(24px)';
    el.style.transition = 'all 150ms ease';
    setTimeout(() => el.remove(), 160);
  });

  container.appendChild(el);

  if (autoHide) {
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(24px)';
      el.style.transition = 'all 150ms ease';
      setTimeout(() => el.remove(), 160);
    }, CONFIG.alertTimeout);
  }
}

// ── Threshold alert checks ─────────────────────────────────
function checkAlerts(data) {
  try {
    const feeds = data.feeds;
    if (!feeds?.length) return;
    const latest = feeds[feeds.length - 1];
    if (!latest) return;

    const thresholds = {
      field1: { warning: 50, critical: 60, label: 'CPU Temp',   unit: '°C' },
      field3: { warning: 70, critical: 90, label: 'CPU Usage',  unit: '%'  },
      field4: { warning: 4,  critical: 6,  label: 'Memory',     unit: ' GB'},
      field5: { warning: 100,critical: 200,label: 'Disk',       unit: ' GB'},
    };

    for (const [field, cfg] of Object.entries(thresholds)) {
      const val = parseFloat(latest[field]);
      if (isNaN(val)) continue;

      const prev = lastAlertCheck[field];
      if (val > cfg.critical) {
        if (prev !== 'critical')
          showAlert(`🔴 Critical: ${cfg.label} is ${val.toFixed(1)}${cfg.unit} (limit: ${cfg.critical})`, 'critical', field);
        lastAlertCheck[field] = 'critical';
      } else if (val > cfg.warning) {
        if (prev !== 'warning' && prev !== 'critical')
          showAlert(`🟡 Warning: ${cfg.label} is ${val.toFixed(1)}${cfg.unit} (limit: ${cfg.warning})`, 'warning', field);
        lastAlertCheck[field] = 'warning';
      } else {
        if (prev === 'critical' || prev === 'warning')
          showAlert(`🟢 Resolved: ${cfg.label} returned to normal (${val.toFixed(1)}${cfg.unit})`, 'ok', field);
        lastAlertCheck[field] = null;
      }
    }
  } catch (err) {
    console.error('Alert check error:', err);
  }
}

// ── Min/max tracking ───────────────────────────────────────
function trackMinMax(field, value) {
  if (valueTracking[field] && !isNaN(value)) {
    valueTracking[field].min = Math.min(valueTracking[field].min, value);
    valueTracking[field].max = Math.max(valueTracking[field].max, value);
  }
}

// ── Smooth animated counter ────────────────────────────────
function animateValue(element, targetText) {
  if (!element) return;
  element.textContent = targetText;
  element.classList.remove('stat-updated');
  void element.offsetWidth; // reflow
  element.classList.add('stat-updated');
  setTimeout(() => element.classList.remove('stat-updated'), 300);
}

// ── Update metric cards ────────────────────────────────────
function updateCard(valueId, statusId, minmaxId, rawValue, unit, field, warnAt, critAt, sparkId) {
  const valueEl  = document.getElementById(valueId);
  const statusEl = document.getElementById(statusId);
  const mmEl     = document.getElementById(minmaxId);

  const num = parseFloat(rawValue);
  if (isNaN(num)) {
    if (valueEl) valueEl.textContent = '—';
    if (statusEl) { statusEl.className = 'metric-status unknown'; statusEl.title = 'No data'; }
    return;
  }

  // Format
  const decimals = unit.includes('GB') ? 2 : 1;
  const formatted = num.toFixed(decimals) + unit;
  if (valueEl) {
    animateValue(valueEl, formatted);
    valueEl.className = 'metric-value' +
      (num >= critAt ? ' val-critical' : num >= warnAt ? ' val-warning' : '');
  }

  // Status dot
  if (statusEl) {
    const cls = num >= critAt ? 'critical' : num >= warnAt ? 'warning' : 'healthy';
    statusEl.className = `metric-status ${cls}`;
    statusEl.title = cls.charAt(0).toUpperCase() + cls.slice(1);
  }

  // Min/max label
  trackMinMax(field, num);
  if (mmEl) {
    const t = valueTracking[field];
    if (t && t.min !== Infinity) {
      mmEl.textContent = `↓ ${t.min.toFixed(decimals)}${unit}  ↑ ${t.max.toFixed(decimals)}${unit}`;
    }
  }

  // Sparkline
  if (sparkId && sparkHistory[field] !== undefined) {
    sparkHistory[field].push(num);
    if (sparkHistory[field].length > CONFIG.sparklinePoints) sparkHistory[field].shift();
    updateSparkline(sparkId, sparkHistory[field]);
  }
}

function updateDataCards(data) {
  const feeds = data.feeds;
  if (!feeds?.length) {
    showAlert('No sensor data available', 'warning');
    return;
  }

  const f = feeds[feeds.length - 1];

  updateCard('cpu-temp',   'cpu-temp-status',  'cpu-temp-minmax',  f.field1, '°C',  'field1', 50,  60,  'spark-cpu-temp');
  updateCard('cpu-usage',  'cpu-usage-status', 'cpu-usage-minmax', f.field3, '%',   'field3', 70,  90,  'spark-cpu-usage');
  updateCard('mem-usage',  'mem-usage-status', 'mem-usage-minmax', f.field4, ' GB', 'field4', 4,   6,   'spark-mem-usage');
  updateCard('disk-usage', 'disk-usage-status','disk-usage-minmax',f.field5, ' GB', 'field5', 100, 200, 'spark-disk-usage');

  // Network
  const sent = parseFloat(f.field6);
  const recv = parseFloat(f.field7);
  const sentEl = document.getElementById('net-sent');
  const recvEl = document.getElementById('net-recv');
  if (sentEl && !isNaN(sent)) animateValue(sentEl, `↑ ${sent.toFixed(2)} GB`);
  if (recvEl && !isNaN(recv)) animateValue(recvEl, `↓ ${recv.toFixed(2)} GB`);

  // Network sparkline — use sent values
  if (!isNaN(sent)) {
    sparkHistory.field6.push(sent);
    if (sparkHistory.field6.length > CONFIG.sparklinePoints) sparkHistory.field6.shift();
    updateSparkline('spark-network', sparkHistory.field6);
  }

  // Uptime
  const uptime = parseFloat(f.field8);
  if (!isNaN(uptime)) {
    updateUptime(uptime);
    sparkHistory.field8.push(uptime);
    if (sparkHistory.field8.length > CONFIG.sparklinePoints) sparkHistory.field8.shift();
    updateSparkline('spark-uptime', sparkHistory.field8);
  }

  // Timestamp
  const ts = new Date(f.created_at);
  const el = document.getElementById('last-update');
  if (el) el.textContent = ts.toLocaleTimeString();

  // Health score
  const score = computeHealthScore(f);
  updateHealthBadge(score);
}

// ── Uptime formatter ───────────────────────────────────────
function updateUptime(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);
  const el = document.getElementById('uptime');
  if (el) {
    const fmt = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    animateValue(el, fmt);
    el.title = `${h}h ${m}m ${s}s`;
  }
}

// ── IST time helper ────────────────────────────────────────
function extractISTTime(utcTs) {
  try {
    const d = new Date(new Date(utcTs).getTime() + 5.5 * 3600000);
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  } catch { return '--:--'; }
}

// ── Update charts ──────────────────────────────────────────
function updateCharts(data) {
  const feeds = data.feeds.slice(-15);
  const labels = feeds.map(f => extractISTTime(f.created_at));

  const fieldMap = [
    { chart: charts.cpuTemp,  field: 'field1' },
    { chart: charts.cpuUsage, field: 'field3' },
    { chart: charts.memUsage, field: 'field4' },
    { chart: charts.diskUsage,field: 'field5' },
  ];

  fieldMap.forEach(({ chart, field }) => {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = feeds.map(f => parseFloat(f[field]) || null);
    chart.update('none');
  });
}

// ── Loading state ──────────────────────────────────────────
function showLoadingIndicator(show) {
  const el = document.getElementById('loading-indicator');
  if (el) el.classList.toggle('visible', show);
}

// ── Fetch data ─────────────────────────────────────────────
async function fetchData() {
  if (STATE.isPaused) return;
  showLoadingIndicator(true);
  STATE.refreshCountdown = 5;

  try {
    const res = await fetch('/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.message || data.error);

    updateConnectionStatus(true);
    updateDataCards(data);
    checkAlerts(data);
    updateCharts(data);
    showLoadingIndicator(false);

  } catch (err) {
    console.error('Fetch error:', err);
    handleFetchError(err);
  }
}

function handleFetchError(err) {
  STATE.retryCount++;
  updateConnectionStatus(false, err.message);
  showLoadingIndicator(false);

  if (STATE.retryCount <= CONFIG.maxRetries) {
    showAlert(`Connection error — retrying (${STATE.retryCount}/${CONFIG.maxRetries})`, 'warning');
    setTimeout(() => { if (STATE.retryCount <= CONFIG.maxRetries) fetchData(); }, CONFIG.retryDelay);
  } else {
    showAlert('Unable to reach the API. Check your connection.', 'error', null, false);
  }
}

// ── Manual refresh ─────────────────────────────────────────
function manualRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.classList.add('spinning');
    btn.disabled = true;
    setTimeout(() => { btn.classList.remove('spinning'); btn.disabled = false; }, 1200);
  }
  STATE.retryCount = 0;
  fetchData();
}

// ── Export ─────────────────────────────────────────────────
function exportData(field) {
  const link = document.createElement('a');
  link.href = `/export/${field}/live`;
  link.download = `${field}_live_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showAlert('Export started — check your downloads', 'ok');
}

// ── Hamburger nav ──────────────────────────────────────────
function initHamburger() {
  const btn = document.getElementById('hamburger-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.navbar')) {
      document.body.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Init ───────────────────────────────────────────────────
function init() {
  console.log('[RPi Monitor] Dashboard v3.0 initialising');

  initHamburger();

  // Attach refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', manualRefresh);

  // Initial fetch
  fetchData();

  // Auto-refresh every 5s
  setInterval(() => { if (!STATE.isPaused) fetchData(); }, CONFIG.refreshInterval);

  // Countdown ticker
  setInterval(updateRefreshCountdown, 1000);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'r': e.preventDefault(); manualRefresh(); break;
        case ' ': e.preventDefault(); togglePause();   break;
      }
    }
  });

  // Tab visibility
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !STATE.isPaused) fetchData();
  });

  // Welcome
  setTimeout(() => showAlert('Dashboard live — Ctrl+R to refresh, Ctrl+Space to pause', 'info'), 800);
}

function togglePause() {
  STATE.isPaused = !STATE.isPaused;
  if (!STATE.isPaused) fetchData();
  showAlert(STATE.isPaused ? 'Auto-refresh paused' : 'Auto-refresh resumed', 'info');
}

// ── Boot ───────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
