/* ============================================================
   RPi Monitor — compare.js
   Cross-resource correlation analysis page logic
   ============================================================ */

'use strict';

// ── Field catalogue ────────────────────────────────────────
const FIELD_CATALOG = [
  { id: 'field1', name: 'CPU Temp',       unit: '°C',   color: 'hsl(196, 80%, 48%)', icon: 'thermometer',  bytes: false },
  { id: 'field3', name: 'CPU Usage',      unit: '%',    color: 'hsl(152, 60%, 48%)', icon: 'gauge',         bytes: false },
  { id: 'field4', name: 'Memory',         unit: 'GB',   color: 'hsl(38,  90%, 58%)', icon: 'database',      bytes: false },
  { id: 'field5', name: 'Disk Used',      unit: 'GB',   color: 'hsl(215, 70%, 60%)', icon: 'hard-drive',    bytes: false },
  { id: 'field6', name: 'Bytes Sent',     unit: 'bytes',color: 'hsl(200, 70%, 55%)', icon: 'upload',        bytes: true  },
  { id: 'field7', name: 'Bytes Recv',     unit: 'bytes',color: 'hsl(220, 65%, 62%)', icon: 'download',      bytes: true  },
  { id: 'field2', name: 'GPU Temp',       unit: '°C',   color: 'hsl(270, 60%, 65%)', icon: 'wind',          bytes: false },
  { id: 'field8', name: 'System Uptime',  unit: 'hrs',  color: 'hsl(152, 55%, 42%)', icon: 'timer',         bytes: false },
];

// ── State ──────────────────────────────────────────────────
let selectedA = null;   // first field config object
let selectedB = null;   // second field config object
let currentPeriod = 'live';
let compareChart  = null;
let isLoading     = false;

// ── Helpers ────────────────────────────────────────────────
function extractISTTime(utcTs) {
  try {
    const d = new Date(new Date(utcTs).getTime() + 5.5 * 3600000);
    return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');
  } catch(e) { return '--:--'; }
}

function formatBytes(bytes) {
  if (isNaN(bytes) || bytes < 0) return '—';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0, val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(i < 2 ? 0 : 2) + '\u00a0' + units[i];
}

function fmtVal(cfg, v) {
  if (isNaN(v)) return '—';
  if (cfg.bytes) return formatBytes(v);
  const dp = cfg.unit === '%' || cfg.unit === '°C' ? 1 : 2;
  return v.toFixed(dp) + '\u00a0' + cfg.unit;
}

function calcStats(arr) {
  if (!arr.length) return { cur: 0, avg: 0, min: 0, max: 0, count: 0 };
  const cur = arr[arr.length - 1];
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { cur, avg, min: Math.min(...arr), max: Math.max(...arr), count: arr.length };
}

// ── Pearson correlation ────────────────────────────────────
function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const xs = x.slice(0, n), ys = y.slice(0, n);
  const mx = xs.reduce((a,b)=>a+b,0)/n;
  const my = ys.reduce((a,b)=>a+b,0)/n;
  let num = 0, d2x = 0, d2y = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]-mx, dy = ys[i]-my;
    num += dx*dy; d2x += dx*dx; d2y += dy*dy;
  }
  const denom = Math.sqrt(d2x * d2y);
  return denom === 0 ? 0 : num / denom;
}

function corrStrengthClass(r) {
  const abs = Math.abs(r);
  const sign = r >= 0 ? 'pos' : 'neg';
  if (abs >= 0.7) return `strong-${sign}`;
  if (abs >= 0.4) return `moderate-${sign}`;
  return 'weak';
}

function corrStrengthLabel(r) {
  const abs = Math.abs(r);
  const dir = r >= 0 ? 'positive' : 'negative';
  if (abs >= 0.7) return `Strong ${dir}`;
  if (abs >= 0.4) return `Moderate ${dir}`;
  if (abs >= 0.2) return 'Weak correlation';
  return 'No correlation';
}

function insightText(cfgA, cfgB, r, statsA, statsB) {
  const nameA = `<strong>${cfgA.name}</strong>`;
  const nameB = `<strong>${cfgB.name}</strong>`;
  const abs = Math.abs(r);
  const rFmt = r.toFixed(3);

  if (abs >= 0.7) {
    const dir = r > 0
      ? `When ${nameA} rises, ${nameB} tends to rise proportionally`
      : `When ${nameA} rises, ${nameB} tends to fall`;
    return `${dir} (r = ${rFmt}). This is a <strong>strong correlation</strong> — the two metrics are likely driven by the same workload pattern.`;
  }
  if (abs >= 0.4) {
    return `${nameA} and ${nameB} show a <strong>moderate correlation</strong> (r = ${rFmt}). There is a partial relationship, but other factors are also influencing these metrics independently.`;
  }
  if (abs >= 0.2) {
    return `A <strong>weak correlation</strong> (r = ${rFmt}) exists between ${nameA} and ${nameB}. They occasionally move together, but no consistent pattern is present in this time window.`;
  }
  return `${nameA} and ${nameB} appear <strong>uncorrelated</strong> (r = ${rFmt}) in this time range — they are behaving independently of each other.`;
}

// ── Build chart gradient ───────────────────────────────────
function makeGradient(ctx, height, color) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  const hsla = color.replace('hsl(', 'hsla(').replace(')', ', ');
  g.addColorStop(0,   hsla + '0.22)');
  g.addColorStop(0.6, hsla + '0.06)');
  g.addColorStop(1,   hsla + '0)');
  return g;
}

// ── Render chart ───────────────────────────────────────────
function renderCompareChart(labels, valsA, valsB, cfgA, cfgB) {
  const canvas = document.getElementById('compareCanvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const height = canvas.clientHeight || 340;

  if (compareChart) { compareChart.destroy(); compareChart = null; }

  const gradA = makeGradient(ctx, height, cfgA.color);
  const gradB = makeGradient(ctx, height, cfgB.color);
  const pts   = labels.length > 100 ? 0 : 3;

  const isA_bytes = cfgA.bytes;
  const isB_bytes = cfgB.bytes;

  compareChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: cfgA.name,
          data: valsA,
          borderColor: cfgA.color,
          backgroundColor: gradA,
          borderWidth: 2,
          fill: true,
          tension: 0.42,
          pointRadius: pts,
          pointHoverRadius: 6,
          pointBackgroundColor: cfgA.color,
          pointBorderColor: 'hsl(222,47%,4%)',
          pointBorderWidth: 1.5,
          yAxisID: 'yA',
        },
        {
          label: cfgB.name,
          data: valsB,
          borderColor: cfgB.color,
          backgroundColor: gradB,
          borderWidth: 2,
          fill: true,
          tension: 0.42,
          pointRadius: pts,
          pointHoverRadius: 6,
          pointBackgroundColor: cfgB.color,
          pointBorderColor: 'hsl(222,47%,4%)',
          pointBorderWidth: 1.5,
          yAxisID: 'yB',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsl(222,40%,9%)',
          titleColor: 'hsl(210,36%,96%)',
          bodyColor: 'hsl(215,20%,64%)',
          borderColor: 'hsl(222,28%,18%)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { weight: '600', size: 12 },
          bodyFont: { size: 11 },
          callbacks: {
            label: (ctx) => {
              const v   = ctx.parsed.y;
              const cfg = ctx.datasetIndex === 0 ? cfgA : cfgB;
              return '  ' + cfg.name + ':  ' + fmtVal(cfg, v);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'hsla(222,28%,15%,0.5)', drawBorder: false },
          ticks: { maxRotation: 0, maxTicksLimit: 8, font: { size: 10 } },
          border: { display: false },
        },
        yA: {
          type: 'linear',
          position: 'left',
          beginAtZero: false,
          grid: { color: 'hsla(222,28%,15%,0.5)', drawBorder: false },
          ticks: {
            maxTicksLimit: 6,
            font: { size: 10 },
            color: cfgA.color,
            callback: (v) => isA_bytes ? formatBytes(v) : v.toFixed(1),
          },
          border: { display: false, color: cfgA.color + '44' },
        },
        yB: {
          type: 'linear',
          position: 'right',
          beginAtZero: false,
          grid: { drawOnChartArea: false, drawBorder: false },
          ticks: {
            maxTicksLimit: 6,
            font: { size: 10 },
            color: cfgB.color,
            callback: (v) => isB_bytes ? formatBytes(v) : v.toFixed(1),
          },
          border: { display: false, color: cfgB.color + '44' },
        },
      },
    },
  });
}

// ── Update UI after data loads ─────────────────────────────
function renderResults(labels, valsA, valsB, srvA, srvB) {
  renderCompareChart(labels, valsA, valsB, selectedA, selectedB);

  // Stats
  const stA = srvA && srvA.average !== undefined ? { cur: valsA[valsA.length-1], avg: srvA.average, min: srvA.min, max: srvA.max } : calcStats(valsA);
  const stB = srvB && srvB.average !== undefined ? { cur: valsB[valsB.length-1], avg: srvB.average, min: srvB.min, max: srvB.max } : calcStats(valsB);

  document.getElementById('cur-a').textContent = fmtVal(selectedA, stA.cur);
  document.getElementById('avg-a').textContent = fmtVal(selectedA, stA.avg);
  document.getElementById('min-a').textContent = fmtVal(selectedA, stA.min);
  document.getElementById('max-a').textContent = fmtVal(selectedA, stA.max);

  document.getElementById('cur-b').textContent = fmtVal(selectedB, stB.cur);
  document.getElementById('avg-b').textContent = fmtVal(selectedB, stB.avg);
  document.getElementById('min-b').textContent = fmtVal(selectedB, stB.min);
  document.getElementById('max-b').textContent = fmtVal(selectedB, stB.max);

  // Correlation
  const r = pearson(valsA, valsB);
  const badge = document.getElementById('corr-badge');
  if (r !== null) {
    document.getElementById('corr-value').textContent = r.toFixed(3);
    const strength = document.getElementById('corr-strength');
    strength.textContent  = corrStrengthLabel(r);
    strength.className    = 'corr-strength ' + corrStrengthClass(r);
    badge.className = 'corr-badge corr-visible';

    // Insight
    const panel = document.getElementById('insight-panel');
    const text  = document.getElementById('insight-text');
    text.innerHTML = insightText(selectedA, selectedB, r, stA, stB);
    panel.style.display = 'flex';
    lucide.createIcons({ nodes: [panel] });
  } else {
    badge.className = 'corr-badge corr-hidden';
  }

  // Data point count
  document.getElementById('compare-data-points').textContent =
    labels.length + ' data points · ' + currentPeriod;

  // Legend
  const leg = document.getElementById('compare-legend');
  leg.innerHTML = [selectedA, selectedB].map(cfg => `
    <div class="legend-item">
      <div class="legend-line" style="background:${cfg.color}"></div>
      <span>${cfg.name}</span>
    </div>`).join('');

  // Timestamp
  const ts = document.getElementById('last-update-compare');
  if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();

  // Show chart UI
  document.getElementById('compare-empty').style.display      = 'none';
  document.getElementById('compare-loading').style.display    = 'none';
  document.getElementById('compare-chart-header').style.display = 'flex';
  document.getElementById('chart-body-wrapper').style.display = 'block';
  showStats(true);

  // Debug
  document.getElementById('debug-points').textContent = labels.length;
}

// ── Fetch and plot ─────────────────────────────────────────
async function fetchAndPlot() {
  if (!selectedA || !selectedB || isLoading) return;
  isLoading = true;

  // Show loading
  document.getElementById('compare-empty').style.display      = 'none';
  document.getElementById('compare-chart-header').style.display = 'none';
  document.getElementById('chart-body-wrapper').style.display = 'none';
  document.getElementById('compare-loading').style.display    = 'flex';

  try {
    const [rA, rB] = await Promise.all([
      fetch('/historic_data/' + selectedA.id + '/' + currentPeriod),
      fetch('/historic_data/' + selectedB.id + '/' + currentPeriod),
    ]);

    if (!rA.ok) throw new Error('HTTP ' + rA.status + ' for ' + selectedA.id);
    if (!rB.ok) throw new Error('HTTP ' + rB.status + ' for ' + selectedB.id);

    const [dA, dB] = await Promise.all([rA.json(), rB.json()]);

    if (dA.error) throw new Error(dA.message || dA.error);
    if (dB.error) throw new Error(dB.message || dB.error);

    const feedsA = dA.feeds || [];
    const feedsB = dB.feeds || [];

    // Align on A's timestamps (both from same ThingSpeak channel → same length)
    const labels = feedsA.map(f => extractISTTime(f.created_at));
    const valsA  = feedsA.map(f => parseFloat(f[selectedA.id]) || 0);
    const valsB  = feedsB.map(f => parseFloat(f[selectedB.id]) || 0);

    renderResults(labels, valsA, valsB, dA.statistics, dB.statistics);

  } catch (err) {
    console.error('Compare fetch error:', err);
    document.getElementById('compare-loading').style.display = 'none';
    document.getElementById('compare-empty').style.display   = 'flex';
    document.getElementById('compare-empty').innerHTML = `
      <i data-lucide="alert-triangle" aria-hidden="true"></i>
      <strong>Failed to load data</strong>
      <span>${err.message}</span>
    `;
    lucide.createIcons({ nodes: [document.getElementById('compare-empty')] });
  } finally {
    isLoading = false;
  }
}

// ── Show/hide stats panel ──────────────────────────────────
function showStats(show) {
  const panel = document.getElementById('compare-stats');
  panel.className = 'compare-stats ' + (show ? 'compare-stats-visible' : 'compare-stats-hidden');
}

// ── Field card selection ───────────────────────────────────
function selectField(cfg) {
  // If already selected — deselect
  if (selectedA && selectedA.id === cfg.id) {
    selectedA = null;
  } else if (selectedB && selectedB.id === cfg.id) {
    selectedB = null;
  } else if (!selectedA) {
    selectedA = cfg;
  } else if (!selectedB) {
    selectedB = cfg;
  } else {
    // Both slots full: replace B (oldest selection stays as A)
    selectedB = cfg;
  }

  updatePickerUI();

  const hint = document.getElementById('selection-hint');
  const count = (selectedA ? 1 : 0) + (selectedB ? 1 : 0);
  if (count === 0) hint.textContent = '— select 2 metrics';
  else if (count === 1) hint.textContent = '— select 1 more';
  else hint.textContent = '';

  // Update stat headers
  document.getElementById('dot-a').style.background  = selectedA ? selectedA.color : 'var(--text-3)';
  document.getElementById('name-a').textContent = selectedA ? selectedA.name : '—';
  document.getElementById('dot-b').style.background  = selectedB ? selectedB.color : 'var(--text-3)';
  document.getElementById('name-b').textContent = selectedB ? selectedB.name : '—';

  // Debug
  document.getElementById('debug-selection').textContent =
    (selectedA ? selectedA.id : '—') + ' vs ' + (selectedB ? selectedB.id : '—');

  if (selectedA && selectedB) {
    fetchAndPlot();
  } else {
    // Reset chart area
    if (compareChart) { compareChart.destroy(); compareChart = null; }
    document.getElementById('compare-empty').style.display      = 'flex';
    document.getElementById('compare-empty').innerHTML = `
      <i data-lucide="git-compare" aria-hidden="true"></i>
      <strong>No metrics selected</strong>
      <span>Pick two metrics above to see their correlation chart</span>`;
    lucide.createIcons({ nodes: [document.getElementById('compare-empty')] });
    document.getElementById('compare-loading').style.display    = 'none';
    document.getElementById('compare-chart-header').style.display = 'none';
    document.getElementById('chart-body-wrapper').style.display = 'none';
    document.getElementById('corr-badge').className = 'corr-badge corr-hidden';
    document.getElementById('insight-panel').style.display = 'none';
    showStats(false);
  }
}

function updatePickerUI() {
  document.querySelectorAll('.field-card').forEach(card => {
    const id = card.getAttribute('data-field-id');
    card.classList.remove('selected-a', 'selected-b', 'disabled');
    const badge = card.querySelector('.field-card-badge');

    if (selectedA && selectedA.id === id) {
      card.classList.add('selected-a');
      badge.textContent = 'A';
    } else if (selectedB && selectedB.id === id) {
      card.classList.add('selected-b');
      badge.textContent = 'B';
    } else {
      badge.textContent = '';
    }
  });
}

// ── Build field picker cards ───────────────────────────────
function buildFieldPicker() {
  const picker = document.getElementById('field-picker');
  FIELD_CATALOG.forEach(cfg => {
    const card = document.createElement('div');
    card.className = 'field-card';
    card.setAttribute('data-field-id', cfg.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Select ' + cfg.name);
    card.innerHTML = `
      <span class="field-card-badge"></span>
      <div class="field-card-icon">
        <i data-lucide="${cfg.icon}" aria-hidden="true"></i>
      </div>
      <div>
        <div class="field-card-name">${cfg.name}</div>
        <div class="field-card-unit">${cfg.unit}</div>
      </div>`;

    card.addEventListener('click', () => selectField(cfg));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectField(cfg); }
    });

    picker.appendChild(card);
  });
}

// ── Period selector ────────────────────────────────────────
function setActivePeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.segment-btn').forEach(btn => {
    const active = btn.getAttribute('data-period') === period;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.getElementById('debug-period').textContent = period;
}

// ── Export ─────────────────────────────────────────────────
function exportComparison() {
  if (!selectedA || !selectedB) return;
  const date = new Date().toISOString().slice(0, 10);
  [selectedA, selectedB].forEach(cfg => {
    const link = document.createElement('a');
    link.href     = '/export/' + cfg.id + '/' + currentPeriod;
    link.download = cfg.id + '_' + currentPeriod + '_' + date + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// ── Hamburger ──────────────────────────────────────────────
function initHamburger() {
  const btn = document.getElementById('hamburger-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.navbar')) {
      document.body.classList.remove('nav-open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Init ───────────────────────────────────────────────────
function initComparePage() {
  console.log('[RPi Monitor] Correlation analysis page loaded');

  initHamburger();
  buildFieldPicker();

  // Re-render Lucide icons inside cards
  lucide.createIcons();

  // Period control
  document.getElementById('segment-group').addEventListener('click', e => {
    const btn = e.target.closest('[data-period]');
    if (!btn) return;
    const period = btn.getAttribute('data-period');
    setActivePeriod(period);
    if (selectedA && selectedB) fetchAndPlot();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault(); exportComparison();
    }
    if (e.key === 'F9') toggleDebug();
  });
}

function toggleDebug() {
  const el = document.getElementById('debug-info');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
