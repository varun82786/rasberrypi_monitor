/* ============================================================
   System Info Page — Fetch & Render Logic
   ============================================================ */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────
  const loadingEl   = document.getElementById('system-loading');
  const errorEl     = document.getElementById('system-error');
  const errorMsgEl  = document.getElementById('system-error-msg');
  const contentEl   = document.getElementById('system-content');
  const lastFetchEl = document.getElementById('last-fetch');
  const refreshBtn  = document.getElementById('refresh-btn');
  const retryBtn    = document.getElementById('retry-btn');

  // ── Helpers ───────────────────────────────────────────────
  function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    var b = Number(bytes);
    if (b === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(b) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    return (b / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }

  function severityClass(pct) {
    if (pct >= 90) return 'severity-critical';
    if (pct >= 70) return 'severity-warning';
    return 'severity-ok';
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str != null ? str : '—');
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = (value != null ? value : '—');
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function showLoading() {
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    contentEl.style.display = 'none';
  }

  function showError(msg) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'flex';
    contentEl.style.display = 'none';
    if (errorMsgEl) errorMsgEl.textContent = msg || 'Failed to load system information';
  }

  function showContent() {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    contentEl.style.display = 'grid';
  }

  // ── Build a usage bar HTML ────────────────────────────────
  function usageBarHtml(pct) {
    var p = Number(pct) || 0;
    var cls = severityClass(p);
    return (
      '<div class="info-row usage-bar-row">' +
        '<span class="info-row-label">USAGE</span>' +
        '<span class="usage-percent ' + cls + '">' + p.toFixed(1) + '%</span>' +
      '</div>' +
      '<div class="usage-bar-track">' +
        '<div class="usage-bar-fill ' + cls + '" style="width:' + Math.min(p, 100) + '%"></div>' +
      '</div>'
    );
  }

  // ── Render functions ──────────────────────────────────────

  function renderPlatform(data) {
    setText('val-hostname',     data.hostname);
    setText('val-os',           data.os);
    setText('val-kernel',       data.kernel);
    setText('val-arch',         data.architecture);
    setText('val-python',       data.python_version);
  }

  function renderCPU(data) {
    var cpu = data.cpu || {};
    setText('val-cpu-model',  cpu.model || data.processor || '—');
    setText('val-cpu-cores',  cpu.count != null ? cpu.count : '—');
    setText('val-cpu-temp',   cpu.temperature != null ? cpu.temperature + ' °C' : '—');
    setText('val-cpu-usage',  cpu.usage_percent != null ? cpu.usage_percent + '%' : '—');
  }

  function renderMemory(data) {
    var mem = data.memory || {};
    setText('val-mem-total',     formatBytes(mem.total));
    setText('val-mem-available', formatBytes(mem.available));
    setText('val-mem-used',      formatBytes(mem.used));

    var pct = mem.percent != null ? mem.percent : 0;
    setHtml('mem-usage-bar', usageBarHtml(pct));
  }

  function renderDisk(data) {
    var disk = data.disk || {};
    setText('val-disk-total', formatBytes(disk.total));
    setText('val-disk-used',  formatBytes(disk.used));
    setText('val-disk-free',  formatBytes(disk.free));

    var pct = disk.percent != null ? disk.percent : 0;
    setHtml('disk-usage-bar', usageBarHtml(pct));
  }

  function renderNetwork(data) {
    var nets = data.network || {};
    var container = document.getElementById('network-list');
    if (!container) return;

    var keys = Object.keys(nets);
    if (keys.length === 0) {
      container.innerHTML = '<div class="info-row"><span class="info-row-label">STATUS</span><span class="info-row-value">No interfaces found</span></div>';
      return;
    }

    var html = '';
    keys.forEach(function (iface) {
      var addrs = nets[iface];
      var addrHtml = '';
      if (Array.isArray(addrs)) {
        addrs.forEach(function (a) {
          var addr = (typeof a === 'object') ? (a.address || a.addr || JSON.stringify(a)) : String(a);
          addrHtml += '<span class="net-iface-addr">' + escapeHtml(addr) + '</span>';
        });
      } else if (typeof addrs === 'string') {
        addrHtml = '<span class="net-iface-addr">' + escapeHtml(addrs) + '</span>';
      }

      html += (
        '<div class="net-iface">' +
          '<span class="net-iface-name">' + escapeHtml(iface) + '</span>' +
          '<div class="net-iface-addrs">' + addrHtml + '</div>' +
        '</div>'
      );
    });

    container.innerHTML = html;
  }

  function renderApp(data) {
    var app = data.application || {};
    setText('val-flask',   app.flask_version || '—');
    setText('val-uptime',  app.uptime || '—');
    setText('val-port',    app.port != null ? app.port : '—');

    var statusEl = document.getElementById('val-api-status');
    if (statusEl) {
      var ok = app.api_status === 'healthy' || app.api_status === 'ok';
      statusEl.innerHTML = (
        '<span class="status-pill ' + (ok ? 'status-ok' : 'status-error') + '">' +
          '<span class="status-pill-dot"></span>' +
          escapeHtml(app.api_status || 'unknown') +
        '</span>'
      );
    }
  }

  // ── Main fetch ────────────────────────────────────────────
  function fetchSystemInfo() {
    showLoading();

    // Spin the refresh icon
    if (refreshBtn) refreshBtn.classList.add('spinning');

    fetch('/api/system')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        renderPlatform(data);
        renderCPU(data);
        renderMemory(data);
        renderDisk(data);
        renderNetwork(data);
        renderApp(data);
        showContent();

        if (lastFetchEl) {
          lastFetchEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        }
      })
      .catch(function (err) {
        console.error('System info fetch error:', err);
        showError(err.message || 'Network error');
      })
      .finally(function () {
        if (refreshBtn) refreshBtn.classList.remove('spinning');
      });
  }

  // ── Wiring ────────────────────────────────────────────────
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchSystemInfo);
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', fetchSystemInfo);
  }

  // Initial fetch
  fetchSystemInfo();
})();
