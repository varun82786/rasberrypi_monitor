/* ============================================================
   RPi Monitor — Graph Detail Script (graph.js)
   Handles: historical chart, segmented controls, stat cards,
            threshold annotations, export, keyboard shortcuts
   ============================================================ */

'use strict';

let chart = null;
let currentPeriod = 'live';
let isLoading = false;

const CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  chartAnimationDuration: 600,
};

const STATE = {
  retryCount: 0,
  lastSuccessfulUpdate: null,
};

// ── Anomaly detection state ─────────────────────────────────
let anomalyEnabled = true;
let lastValues = [];     // stored for re-render on toggle
let lastLabels = [];
let lastData = {};
let lastDatasets = null;

// Compute rolling stats and flag anomalies (>2σ from rolling mean)
function detectAnomalies(values, windowSize = 10) {
  const flags = new Array(values.length).fill(false);
  for (let i = windowSize; i < values.length; i++) {
    const win = values.slice(i - windowSize, i);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
    const std = Math.sqrt(variance);
    if (std > 0 && Math.abs(values[i] - mean) > 2 * std) {
      flags[i] = true;
    }
  }
  return flags;
}

function toggleAnomalyHighlight() {
  anomalyEnabled = !anomalyEnabled;
  const btn = document.getElementById('btn-toggle-anomaly');
  if (btn) {
    btn.style.background = anomalyEnabled ? 'hsla(38, 90%, 58%, 0.15)' : '';
    btn.style.color = anomalyEnabled ? 'hsl(38, 90%, 68%)' : '';
    btn.title = anomalyEnabled ? 'Anomaly detection ON' : 'Anomaly detection OFF';
  }
  // Re-render chart with current data
  if (lastLabels.length) {
    updateChart(lastLabels, lastValues, lastData, lastDatasets);
  }
}

function resetZoom() {
  if (chart) {
    chart.resetZoom();
    const btn = document.getElementById('btn-reset-zoom');
    if (btn) btn.style.display = 'none';
  }
}

// ── Chart.js global defaults ──────────────────────────────
Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = 'hsl(215, 20%, 64%)';

// ── IST time helper ───────────────────────────────────────
function extractISTTime(utcTs) {
  try {
    const d = new Date(new Date(utcTs).getTime() + 5.5 * 3600000);
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}`;
  } catch {
    return '--:--:--';
  }
}

// ── Field color mapping ───────────────────────────────────
const FIELD_COLORS = {
  field1: 'hsl(196, 80%, 48%)',  // cyan   — CPU Temp
  field2: 'hsl(270, 60%, 65%)',  // purple — GPU Temp
  field3: 'hsl(152, 60%, 48%)',  // green  — CPU Usage
  field4: 'hsl(38, 90%, 58%)',   // amber  — Memory
  field5: 'hsl(196, 70%, 62%)',  // light  — Disk
  field6: 'hsl(200, 70%, 55%)',  // teal   — Bytes Sent
  field7: 'hsl(220, 65%, 62%)',  // blue   — Bytes Recv
  field8: 'hsl(152, 60%, 48%)',  // green  — Uptime
};

function getFieldColor() {
  return FIELD_COLORS[CURRENT_FIELD] || 'hsl(196, 80%, 48%)';
}

// ── Build gradient for a canvas context ──────────────────
function buildGradient(ctx, height, color) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  // convert hsl() → hsla() manually
  const hsla = color.replace('hsl(', 'hsla(').replace(')', ', ');
  grad.addColorStop(0, hsla + '0.28)');
  grad.addColorStop(0.6, hsla + '0.08)');
  grad.addColorStop(1, hsla + '0)');
  return grad;
}

// ── Create / update chart ─────────────────────────────────
// updateChart supports:
//   single field  -> updateChart(labels, values, data)
//   dual datasets -> updateChart(labels, null, data, [{label,values,color}, ...])
function updateChart(labels, values, data = {}, datasets = null) {
  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;

  const ctx    = canvas.getContext('2d');
  const height = canvas.clientHeight || 380;

  if (chart) { chart.destroy(); chart = null; }
  canvas.style.display = 'block';
  const errorEl = document.querySelector('.error-state');
  if (errorEl) errorEl.remove();

  const isNetworkChart = (datasets !== null);
  const isBytes = isNetworkChart || BYTES_FIELDS[CURRENT_FIELD];
  const ptRadius = labels.length > 100 ? 0 : 3;

  // Build Chart.js datasets array
  let chartDatasets;
  if (isNetworkChart) {
    chartDatasets = datasets.map(ds => {
      const grad = buildGradient(ctx, height, ds.color);
      return {
        label: ds.label,
        data: ds.values,
        borderColor: ds.color,
        backgroundColor: grad,
        borderWidth: 2,
        fill: true,
        tension: 0.45,
        pointRadius: ptRadius,
        pointHoverRadius: 6,
        pointBackgroundColor: ds.color,
        pointBorderColor: 'hsl(222, 47%, 4%)',
        pointBorderWidth: 1.5,
      };
    });
  } else {
    const color = getFieldColor();
    const grad  = buildGradient(ctx, height, color);
    const label = (window.FIELD_LABELS || {})[CURRENT_FIELD] || CURRENT_FIELD;
    // Anomaly detection: flag outliers with different point styling
    const anomalyFlags = (anomalyEnabled && values) ? detectAnomalies(values) : [];
    const anomalyCount = anomalyFlags.filter(Boolean).length;

    // Update anomaly counter in header (if element exists)
    const anomalyBadge = document.getElementById('anomaly-count');
    if (!anomalyBadge) {
      // Create badge in chart actions if not present
      const actionsEl = document.querySelector('.chart-actions');
      if (actionsEl && anomalyCount > 0) {
        const badge = document.createElement('span');
        badge.id = 'anomaly-count';
        badge.className = 'anomaly-badge';
        badge.textContent = anomalyCount + ' anomal' + (anomalyCount === 1 ? 'y' : 'ies');
        actionsEl.prepend(badge);
      }
    } else {
      anomalyBadge.textContent = anomalyCount > 0
        ? anomalyCount + ' anomal' + (anomalyCount === 1 ? 'y' : 'ies')
        : '';
      anomalyBadge.style.display = anomalyCount > 0 ? 'inline-flex' : 'none';
    }

    const ptBgColors = values
      ? values.map((_, i) => anomalyFlags[i] ? 'hsl(0, 70%, 55%)' : color)
      : color;
    const ptRadii = values
      ? values.map((_, i) => anomalyFlags[i] ? 6 : ptRadius)
      : ptRadius;

    chartDatasets = [{
      label,
      data: values,
      borderColor: color,
      backgroundColor: grad,
      borderWidth: 2,
      fill: true,
      tension: 0.45,
      pointRadius: ptRadii,
      pointHoverRadius: 6,
      pointBackgroundColor: ptBgColors,
      pointBorderColor: values
        ? values.map((_, i) => anomalyFlags[i] ? 'hsl(0, 90%, 70%)' : 'hsl(222, 47%, 4%)')
        : 'hsl(222, 47%, 4%)',
      pointBorderWidth: 1.5,
    }];
  }

  try {
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: CONFIG.chartAnimationDuration, easing: 'easeInOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          // Show legend only for dual-line (network) chart
          legend: {
            display: isNetworkChart,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              boxHeight: 2,
              usePointStyle: true,
              pointStyle: 'line',
              font: { size: 11 },
              color: 'hsl(215, 20%, 70%)',
              padding: 16,
            },
          },
          tooltip: {
            backgroundColor: 'hsl(222, 40%, 9%)',
            titleColor: 'hsl(210, 36%, 96%)',
            bodyColor: 'hsl(215, 20%, 64%)',
            borderColor: 'hsl(222, 28%, 18%)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleFont: { weight: '600', size: 12 },
            bodyFont: { size: 11 },
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                const formatted = isBytes ? formatBytes(v) : v.toFixed(2);
                let txt = '  ' + ctx.dataset.label + ':  ' + formatted;
                if (data.thresholds) {
                  if (v > data.thresholds.critical) txt += '  ● crit';
                  else if (v > data.thresholds.warning) txt += '  ▲ warn';
                }
                return txt;
              },
              afterLabel: (ctx) => {
                if (!data.thresholds) return [];
                const v = ctx.parsed.y;
                const lines = [];
                if (v > data.thresholds.critical)
                  lines.push('  ⚠ Above critical (' + data.thresholds.critical + ')');
                else if (v > data.thresholds.warning)
                  lines.push('  ▲ Above warning (' + data.thresholds.warning + ')');
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'hsla(222, 28%, 15%, 0.5)', drawBorder: false },
            ticks: { maxRotation: 0, maxTicksLimit: 8, font: { size: 10 } },
            border: { display: false },
          },
          y: {
            beginAtZero: false,
            grid: { color: 'hsla(222, 28%, 15%, 0.5)', drawBorder: false },
            ticks: {
              maxTicksLimit: 6,
              font: { size: 10 },
              callback: (val) => isBytes ? formatBytes(val) : val.toFixed(1),
            },
            border: { display: false },
          },
        },
        // Zoom & Pan plugin
        zoom: {
          zoom: {
            drag: { enabled: true, backgroundColor: 'hsla(196, 80%, 48%, 0.08)', borderColor: 'hsl(196, 80%, 48%)', borderWidth: 1 },
            mode: 'x',
            onZoomComplete: () => {
              const btn = document.getElementById('btn-reset-zoom');
              if (btn) btn.style.display = 'inline-flex';
            },
          },
          pan: { enabled: true, mode: 'x' },
          limits: { x: { minRange: 3 } },
        },
      },
    });
  } catch (err) {
    console.error('Chart creation error:', err);
    showChartError(err.message);
  }
}

// ── Show chart-level error ────────────────────────────────
function showChartError(message) {
  const canvas = document.getElementById('graphCanvas');
  if (canvas) canvas.style.display = 'none';

  const wrapper = document.getElementById('chart-body-wrapper');
  if (!wrapper) return;

  let el = wrapper.querySelector('.error-state');
  if (!el) {
    el = document.createElement('div');
    el.className = 'error-state';
    wrapper.appendChild(el);
  }

  // Build error UI using DOM (no FA classes)
  el.innerHTML = '';

  const iconWrap = document.createElement('div');
  iconWrap.innerHTML = '<i data-lucide="triangle-alert" aria-hidden="true"></i>';
  el.appendChild(iconWrap);

  const strong = document.createElement('strong');
  strong.textContent = 'Failed to load chart';
  el.appendChild(strong);

  const detail = document.createElement('span');
  detail.style.cssText = 'font-size:11px; color: var(--text-3);';
  detail.textContent = message;
  el.appendChild(detail);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-sm';
  retryBtn.style.marginTop = '8px';
  retryBtn.onclick = retryFetch;
  retryBtn.innerHTML = '<i data-lucide="rotate-cw" aria-hidden="true"></i> Retry';
  el.appendChild(retryBtn);

  // Render the new Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Update stats cards ────────────────────────────────────
function updateStatElement(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.remove('stat-updated');
  void el.offsetWidth;
  el.classList.add('stat-updated');
  setTimeout(() => el.classList.remove('stat-updated'), 300);
}


// ── Bytes formatter (shared with dashboard) ───────────────────
function formatBytes(bytes) {
  if (isNaN(bytes) || bytes < 0) return '\u2014';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(i < 2 ? 0 : 2) + '\u00a0' + units[i];
}

// Fields that store raw bytes and need formatBytes() instead of toFixed()
const BYTES_FIELDS = { field6: true, field7: true };

function updateStatistics(values, serverStats = null) {
  if (!values.length) {
    ['current-value','average-value','min-value','max-value','data-points'].forEach(id => updateStatElement(id, '—'));
    return;
  }

  const stats = (serverStats?.average !== undefined) ? serverStats : {
    average: values.reduce((a,b) => a+b, 0) / values.length,
    min:     Math.min(...values),
    max:     Math.max(...values),
    count:   values.length,
  };

  const isBytes = BYTES_FIELDS[CURRENT_FIELD];
  const fmt = (v) => isBytes ? formatBytes(v) : v.toFixed(2);

  updateStatElement('current-value', fmt(values[values.length - 1]));
  updateStatElement('average-value', fmt(stats.average));
  updateStatElement('min-value',     fmt(stats.min));
  updateStatElement('max-value',     fmt(stats.max));
  updateStatElement('data-points',   String(stats.count || values.length));

  // Also update legacy min-max div for compat
  const mmEl = document.getElementById('min-max-values');
  if (mmEl) mmEl.textContent = 'Min: ' + fmt(stats.min) + ' · Max: ' + fmt(stats.max);
}

// ── Set page title based on field ────────────────────────
function setPageTitle() {
  const name  = (window.FIELD_NAMES  || {})[CURRENT_FIELD] || CURRENT_FIELD;
  const label = (window.FIELD_LABELS || {})[CURRENT_FIELD] || CURRENT_FIELD;

  // Browser tab only — h1 is server-rendered by Jinja2, do NOT overwrite
  document.title = name + ' Analysis — RPi Monitor';

  // Chart card label
  const chartTitle = document.getElementById('chart-title-text');
  if (chartTitle) chartTitle.textContent = label;

  // Per-field icon chip (Lucide icon names)
  const iconMap = {
    field1: { icon: 'thermometer',      chart: 'cpu-temp'  },
    field2: { icon: 'wind',             chart: 'memory'    },
    field3: { icon: 'gauge',            chart: 'cpu-usage' },
    field4: { icon: 'database',         chart: 'memory'    },
    field5: { icon: 'hard-drive',       chart: 'disk'      },
    field6: { icon: 'upload',           chart: 'network'   },
    field7: { icon: 'download',         chart: 'network'   },
    field8: { icon: 'timer',            chart: 'cpu-usage' },
    network: { icon: 'activity',         chart: 'network'   },
  };
  const chip = document.getElementById('chart-icon-chip');
  if (chip) {
    const cfg = iconMap[CURRENT_FIELD] || { icon: 'trending-up', chart: 'disk' };
    chip.setAttribute('data-chart', cfg.chart);
    chip.innerHTML = '<i data-lucide="' + cfg.icon + '"></i>';
    // Re-render the new icon
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ── Loading state ─────────────────────────────────────────
function showLoadingIndicator(show) {
  const ind    = document.getElementById('loading-indicator');
  const canvas = document.getElementById('graphCanvas');
  if (ind)    ind.style.display    = show ? 'flex' : 'none';
  if (canvas) canvas.style.display = show ? 'none' : 'block';
}

// ── Segmented control state ───────────────────────────────
function setActiveSegment(period) {
  document.querySelectorAll('.segment-btn').forEach(btn => {
    const active = btn.getAttribute('data-period') === period;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

// ── Fetch data for a period ───────────────────────────────
function fetchData_period(period) {
  if (isLoading) return;

  currentPeriod = period;
  isLoading = true;
  setActiveSegment(period);
  showLoadingIndicator(true);

  // Network mode: fetch field6 (Sent) + field7 (Recv) in parallel
  if (CURRENT_FIELD === 'network') {
    Promise.all([
      fetch('/historic_data/field6/' + period).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch('/historic_data/field7/' + period).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
    ])
    .then(([d6, d7]) => {
      if (d6.error) throw new Error(d6.message || d6.error);
      if (d7.error) throw new Error(d7.message || d7.error);

      const feeds6 = d6.feeds || [];
      const feeds7 = d7.feeds || [];

      // Align labels on field6 timestamps (both feeds are from same channel, same times)
      const labels = feeds6.map(f => extractISTTime(f.created_at));
      const sent   = feeds6.map(f => parseFloat(f.field6) || 0);
      const recv   = feeds7.map(f => parseFloat(f.field7) || 0);

      const TEAL = 'hsl(200, 70%, 55%)';
      const BLUE = 'hsl(220, 65%, 62%)';

      lastDatasets = [
        { label: '↑ Bytes Sent',     values: sent, color: TEAL },
        { label: '↓ Bytes Received', values: recv, color: BLUE },
      ];
      lastLabels = labels;
      lastValues = null;
      lastData = {};
      updateChart(labels, null, {}, lastDatasets);

      // Stats: show Sent current + Recv current side-by-side
      updateNetworkStats(sent, recv, d6.statistics, d7.statistics);

      const tsEl = document.getElementById('last-update-graph');
      if (tsEl) tsEl.textContent = 'Updated ' + new Date().toLocaleTimeString();

      showLoadingIndicator(false);
      isLoading = false;
      STATE.retryCount = 0;
      STATE.lastSuccessfulUpdate = new Date();
    })
    .catch(err => {
      console.error('Network fetch error:', err);
      handleFetchError(err, period);
    });
    return;
  }

  // Standard single-field fetch
  const url = '/historic_data/' + CURRENT_FIELD + '/' + period;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
      return res.json();
    })
    .then(data => {
      if (data.error) throw new Error(data.message || data.error);

      const feeds  = data.feeds || [];
      const labels = feeds.map(f => extractISTTime(f.created_at));
      const values = feeds.map(f => parseFloat(f[CURRENT_FIELD]) || 0);

      // Store for anomaly toggle re-render
      lastLabels = labels;
      lastValues = values;
      lastData = data;
      lastDatasets = null;

      updateChart(labels, values, data);
      updateStatistics(values, data.statistics);

      const tsEl = document.getElementById('last-update-graph');
      if (tsEl) tsEl.textContent = 'Updated ' + new Date().toLocaleTimeString();

      showLoadingIndicator(false);
      isLoading = false;
      STATE.retryCount = 0;
      STATE.lastSuccessfulUpdate = new Date();
    })
    .catch(err => {
      console.error('Fetch error:', err);
      handleFetchError(err, period);
    });
}

// ── Network dual-stats update ──────────────────────────────
// Shows Sent stats in the standard stat cards; appends Recv
// in a second row (reuses the same elements with two passes)
function updateNetworkStats(sent, recv, stats6, stats7) {
  const fmtS = (v) => formatBytes(v);

  // Current: last value of each
  const curSent = sent.length ? sent[sent.length - 1] : 0;
  const curRecv = recv.length ? recv[recv.length - 1] : 0;

  // Compute stats if server didn't provide them
  const calcStats = (arr) => arr.length ? {
    average: arr.reduce((a,b)=>a+b,0) / arr.length,
    min: Math.min(...arr),
    max: Math.max(...arr),
    count: arr.length,
  } : { average:0, min:0, max:0, count:0 };

  const s6 = (stats6 && stats6.average !== undefined) ? stats6 : calcStats(sent);
  const s7 = (stats7 && stats7.average !== undefined) ? stats7 : calcStats(recv);

  // Stat cards: show Sent values with Recv appended in parens
  updateStatElement('current-value', fmtS(curSent)  + '  /  ' + fmtS(curRecv));
  updateStatElement('average-value', fmtS(s6.average) + '  /  ' + fmtS(s7.average));
  updateStatElement('min-value',     fmtS(s6.min)     + '  /  ' + fmtS(s7.min));
  updateStatElement('max-value',     fmtS(s6.max)     + '  /  ' + fmtS(s7.max));
  updateStatElement('data-points',   String(s6.count || sent.length));

  const mmEl = document.getElementById('min-max-values');
  if (mmEl) mmEl.textContent = 'Sent: ' + fmtS(s6.min) + ' – ' + fmtS(s6.max) + '   Recv: ' + fmtS(s7.min) + ' – ' + fmtS(s7.max);
}

// ── Error handling ────────────────────────────────────────
function handleFetchError(err, period) {
  STATE.retryCount++;
  isLoading = false;
  showLoadingIndicator(false);

  if (STATE.retryCount <= CONFIG.maxRetries) {
    setTimeout(() => fetchData_period(period), CONFIG.retryDelay);
  } else {
    showChartError(`Failed after ${CONFIG.maxRetries} attempts: ${err.message}`);
  }
}

function retryFetch() {
  STATE.retryCount = 0;
  fetchData_period(currentPeriod);
}

// ── Export ────────────────────────────────────────────────
function exportCurrentData() {
  const fields = CURRENT_FIELD === 'network' ? ['field6', 'field7'] : [CURRENT_FIELD];
  const date   = new Date().toISOString().slice(0, 10);
  fields.forEach(fld => {
    const link = document.createElement('a');
    link.href     = '/export/' + fld + '/' + currentPeriod;
    link.download = fld + '_' + currentPeriod + '_' + date + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// ── Debug helpers (kept for compat) ──────────────────────
function toggleDebug() {
  const el = document.getElementById('debug-info');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') {
    document.getElementById('debug-field-label').textContent = FIELD_LABELS[CURRENT_FIELD] || '?';
    document.getElementById('debug-chartjs').textContent = typeof Chart !== 'undefined' ? 'Loaded' : 'Missing';
    document.getElementById('debug-canvas').textContent = document.getElementById('graphCanvas') ? 'Found' : 'Missing';
  }
}

// ── Hamburger nav ─────────────────────────────────────────
function initHamburger() {
  const btn = document.getElementById('hamburger-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.navbar')) {
      document.body.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Init ──────────────────────────────────────────────────
function initializeGraphPage() {
  console.log('[RPi Monitor] Graph page — field:', CURRENT_FIELD);

  if (typeof Chart === 'undefined') {
    showChartError('Chart.js failed to load. Please refresh.');
    return;
  }

  initHamburger();
  setPageTitle();

  // Segmented control events
  const segmentGroup = document.querySelector('.segment-group');
  if (segmentGroup) {
    segmentGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (btn) fetchData_period(btn.getAttribute('data-period'));
    });
  }

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'r') { e.preventDefault(); STATE.retryCount = 0; fetchData_period(currentPeriod); }
      if (e.key === 'e') { e.preventDefault(); exportCurrentData(); }
    }
  });

  // Initial load
  setTimeout(() => fetchData_period('live'), 80);
}

// ── Boot ──────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGraphPage);
} else {
  initializeGraphPage();
}