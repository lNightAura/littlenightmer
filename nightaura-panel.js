/* NIGHTAURA PANEL
 * Browser-side control layer for the worker-standalone core.
 * Keep moonglass-config-panel.html as the visual shell and load this file after it.
 */
(() => {
  'use strict';

  const PANEL_NAME = 'NIGHTAURA PANEL';
  const API = Object.freeze({
    health: '/api/health',
    nodeExport: '/api/node/export',
    nodeImport: '/api/node/import',
    dns: '/dns-json',
    updateCheck: '/panel/settings/update/check',
    updateApply: '/panel/settings/update/apply'
  });

  const state = { ready: false, updateReady: false, health: null };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function toast(message, kind = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message);
    let el = $('#nightaura-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nightaura-toast';
      Object.assign(el.style, { position: 'fixed', right: '22px', bottom: '22px', zIndex: 99999, maxWidth: 'min(420px, calc(100vw - 44px))', padding: '12px 16px', borderRadius: '12px', color: '#f2f5f8', background: 'rgba(17,21,28,.95)', border: '1px solid rgba(159,210,219,.35)', boxShadow: '0 16px 44px rgba(0,0,0,.35)', font: '500 13px/1.4 system-ui,sans-serif', transition: 'opacity .2s' });
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.kind = kind;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 3200);
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
    return data;
  }

  async function getHealth() {
    const data = await request(API.health, { cache: 'no-store' });
    state.health = data;
    document.documentElement.dataset.panelStatus = data.ok === false ? 'error' : 'online';
    $$('[data-nightra-health], #healthStatus, #systemStatus').forEach(el => {
      el.textContent = data.version ? `Online · v${data.version}` : 'Online';
    });
    return data;
  }

  function randomString(length, alphabet) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
  }

  function randomUuid() {
    const value = crypto.randomUUID ? crypto.randomUUID() : `${randomString(8, 'abcdef0123456789')}-${randomString(4, 'abcdef0123456789')}-4${randomString(3, 'abcdef0123456789')}-a${randomString(3, 'abcdef0123456789')}-${randomString(12, 'abcdef0123456789')}`;
    const el = $('#vlessUuid');
    if (el) el.value = value;
    toast('New UUID generated');
    return value;
  }

  function randomPassword() {
    const value = `wd_${randomString(16, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`;
    const el = $('#trojanPassword');
    if (el) el.value = value;
    toast('New Trojan password generated');
    return value;
  }

  function randomToken() {
    const value = randomString(24, 'abcdefghijklmnopqrstuvwxyz0123456789');
    const el = $('#subToken');
    if (el) el.value = value;
    toast('New subscription token generated');
    return value;
  }

  async function resolveDns(domain, type = 'A') {
    if (!domain) throw new Error('Enter a domain first');
    const started = performance.now();
    const data = await request(`${API.dns}?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`);
    return { ...data, rtt: Math.round(performance.now() - started), domain, type };
  }

  async function runDnsTest(domainInputId = 'dohTestDomain', typeInputId = 'dohTestType', resultBoxId = 'dohTestResult') {
    const domain = $(`#${domainInputId}`)?.value.trim();
    const type = $(`#${typeInputId}`)?.value || 'A';
    const box = $(`#${resultBoxId}`);
    if (box) box.innerHTML = '<span>Resolving...</span>';
    try {
      const data = await resolveDns(domain, type);
      const answers = Array.isArray(data.Answer) ? data.Answer : [];
      if (box) box.innerHTML = `<div><strong>${escapeHtml(data.domain)}</strong> · ${data.rtt} ms · ${data.Status === 0 ? 'NOERROR' : `status ${escapeHtml(data.Status)}`}</div>` + (answers.length ? `<pre>${escapeHtml(answers.map(a => `${a.name || ''}  ${a.data || ''}  TTL ${a.TTL || ''}`).join('\n'))}</pre>` : '<div>No records returned.</div>');
      return data;
    } catch (error) {
      if (box) box.textContent = `Resolution error: ${error.message}`;
      toast(error.message, 'error');
      throw error;
    }
  }

  async function exportNode(download = false) {
    const data = await request(API.nodeExport, { headers: { accept: 'application/json' } });
    const text = JSON.stringify(data, null, 2);
    if (download) {
      const blob = new Blob([text], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'nightaura-panel-config.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast('Configuration copied');
    }
    return data;
  }

  async function importNode(jsonOrElement) {
    const raw = typeof jsonOrElement === 'string' ? jsonOrElement : (jsonOrElement?.value || '');
    if (!raw.trim()) throw new Error('Paste a JSON configuration first');
    const data = await request(API.nodeImport, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
    toast(`Imported ${data.importedCount ?? 'configuration'} settings`);
    setTimeout(() => location.reload(), 900);
    return data;
  }

  async function checkForUpdate() {
    const status = $('#updateStatus');
    if (status) status.textContent = 'Checking for updates...';
    try {
      const data = await request(API.updateCheck, { method: 'POST' });
      state.updateReady = !!data.updateAvailable && !!data.supported;
      if ($('#updateLatest')) $('#updateLatest').textContent = `v${data.latest || 'unknown'}`;
      if (status) status.textContent = data.updateAvailable ? (data.reason || `v${data.latest} is available.`) : 'You are on the latest version.';
      return data;
    } catch (error) {
      if (status) status.textContent = `Update check failed: ${error.message}`;
      throw error;
    }
  }

  async function applyUpdate(body = {}) {
    const data = await request(API.updateApply, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    toast(data.message || 'Update deployed');
    return data;
  }

  function switchTab(tabName) {
    if (typeof window.switchTab === 'function' && window.switchTab !== switchTab) return window.switchTab(tabName);
    $$('.tab-pane').forEach(el => { el.hidden = el.id !== `tab-${tabName}`; el.classList.toggle('active', el.id === `tab-${tabName}`); });
    $$('.nav-btn').forEach(el => el.classList.toggle('active', el.id === `nav-${tabName}`));
    location.hash = tabName;
  }

  function brand() {
    document.title = PANEL_NAME;
    $$('title, [data-panel-name], .brand-name, .logo-text, .sidebar-brand, .app-title').forEach(el => { if (el.tagName === 'TITLE' || el.children.length === 0) el.textContent = PANEL_NAME; });
    $$('body *').forEach(el => { if (el.children.length === 0 && /MoonGlass|BlueKnight|Blue Knight/i.test(el.textContent)) el.textContent = el.textContent.replace(/MoonGlass|Blue\s*Knight/gi, PANEL_NAME); });
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const button = event.target.closest('button, a');
      if (!button) return;
      const id = button.id || '';
      const text = button.textContent.trim().toLowerCase();
      if (id === 'generateUuid' || /generate.*uuid/.test(text)) { event.preventDefault(); randomUuid(); }
      else if (id === 'generatePassword' || /generate.*(trojan|password)/.test(text)) { event.preventDefault(); randomPassword(); }
      else if (id === 'generateToken' || /generate.*token/.test(text)) { event.preventDefault(); randomToken(); }
      else if (id === 'dnsTestBtn' || /run.*dns|test.*dns/.test(text)) { event.preventDefault(); runDnsTest().catch(() => {}); }
      else if (id === 'exportNodeBtn' || /export.*config|export.*node/.test(text)) { event.preventDefault(); exportNode(true).catch(e => toast(e.message, 'error')); }
      else if (id === 'copyNodeBtn' || /copy.*config/.test(text)) { event.preventDefault(); exportNode(false).catch(e => toast(e.message, 'error')); }
    });
    document.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const action = form.getAttribute('action') || '';
      if (!action.includes('/api/node/import')) return;
      event.preventDefault();
      const input = form.querySelector('textarea, input[name="json"]');
      importNode(input).catch(e => toast(e.message, 'error'));
    });
  }

  function init() {
    if (state.ready) return;
    state.ready = true;
    brand();
    bindEvents();
    getHealth().catch(() => {});
    const observer = new MutationObserver(() => brand());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const hash = location.hash.slice(1);
    if (hash) setTimeout(() => switchTab(hash), 0);
  }

  Object.assign(window, {
    NIGHTAURA_PANEL: { PANEL_NAME, API, state, request, getHealth, randomUuid, randomPassword, randomToken, resolveDns, runDnsTest, exportNode, importNode, checkForUpdate, applyUpdate, switchTab, init }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
