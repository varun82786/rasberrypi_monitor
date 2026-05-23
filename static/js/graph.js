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
function updateChart(labels, values, data = {}) {
  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;

  const ctx    = canvas.getContext('2d');
  const color  = getFieldColor();
  const height = canvas.clientHeight || 380;
  const grad   = buildGradient(ctx, height, color);

  if (chart) { chart.destroy(); chart = null; }

  canvas.style.display = 'block';
  const errorEl = document.querySelector('.error-state');
  if (errorEl) errorEl.remove();

  const fieldLabel = FIELD_LABELS[CURRENT_FIELD] || CURRENT_FIELD;

  try {
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: fieldLabel,
          data: values,
          borderColor: color,
          backgroundColor: grad,
          borderWidth: 2,
          fill: true,
          tension: 0.45,
          pointRadius: labels.length > 100 ? 0 : 3,
          pointHoverRadius: 6,
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
            padding: 12,
            cornerRadius: 8,
            titleFont: { weight: '600', size: 12 },
            bodyFont: { size: 11 },
            callbacks: {
              label: (ctx) => {
                let txt = `  ${ctx.parsed.y.toFixed(2)}`;
                if (data.thresholds) {
                  const v = ctx.parsed.y;
                  if (v > data.thresholds.critical) txt += '  🔴';
                  else if (v > data.thresholds.warning) txt += '  🟡';
                }
                return txt;
              },
              afterLabel: (ctx) => {
                if (!data.thresholds) return [];
                const v = ctx.parsed.y;
                const lines = [];
                if (v > data.thresholds.critical)
                  lines.push(`  ⚠ Above critical (${data.thresholds.critical})`);
                else if (v > data.thresholds.warning)
                  lines.push(`  ▲ Above warning (${data.thresholds.warning})`);
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
            ticks: { maxTicksLimit: 6, font: { size: 10 } },
            border: { display: false },
          },
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

  const dp = 2;
  updateStatElement('current-value', values[values.length - 1].toFixed(dp));
  updateStatElement('average-value', stats.average.toFixed(dp));
  updateStatElement('min-value',     stats.min.toFixed(dp));
  updateStatElement('max-value',     stats.max.toFixed(dp));
  updateStatElement('data-points',   String(stats.count || values.length));

  // Also update legacy min-max div for compat
  const mmEl = document.getElementById('min-max-values');
  if (mmEl) mmEl.textContent = `Min: ${stats.min.toFixed(dp)} · Max: ${stats.max.toFixed(dp)}`;
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
    field6: { icon: 'arrow-left-right', chart: 'disk'      },
    field7: { icon: 'arrow-left-right', chart: 'disk'      },
    field8: { icon: 'timer',            chart: 'cpu-usage' },
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

  const url = `/historic_data/${CURRENT_FIELD}/${period}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    })
    .then(data => {
      if (data.error) throw new Error(data.message || data.error);

      const feeds  = data.feeds || [];
      const labels = feeds.map(f => extractISTTime(f.created_at));
      const values = feeds.map(f => parseFloat(f[CURRENT_FIELD]) || 0);

      updateChart(labels, values, data);
      updateStatistics(values, data.statistics);

      // Update timestamp
      const tsEl = document.getElementById('last-update-graph');
      if (tsEl) tsEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;

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
  const link = document.createElement('a');
  link.href     = `/export/${CURRENT_FIELD}/${currentPeriod}`;
  link.download = `${CURRENT_FIELD}_${currentPeriod}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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