// App shell: loads state, keeps the day lifecycle in sync with the clock,
// routes tabs, and provides modals/toasts/click delegation to the views.
(function () {
  'use strict';

  const D = Day;
  const view = document.getElementById('view');
  const modalEl = document.getElementById('modal');
  const toastEl = document.getElementById('toast');
  const tabs = document.querySelectorAll('.tab');

  const loaded = Store.load();
  const App = {
    state: loaded.state,
    loadError: loaded.error,
    version: '2026-10-17 · d',   // bump on every release (shown in עוד) together with CACHE in sw.js
    tab: 'today',
    fix: false,            // fixing the pending (failed) day before confirming a restart
    offset: 0,             // test hook: shifts the clock (ms)
    now() { return Date.now() + App.offset; },
    status() { return D.status(App.state, App.now()); }
  };
  window.App = App;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.esc = esc;

  // ---- persistence ----
  let warnedSave = false;
  App.commit = function () {
    if (!Store.save(App.state) && !warnedSave) {
      warnedSave = true;
      App.toast('השמירה נכשלה — הנתונים לא יישמרו. גבו מיד דרך "עוד".', 6000);
    }
  };

  // ---- click / change delegation: views register handlers by name ----
  const handlers = {};
  App.act = (name, fn) => { handlers[name] = fn; };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && handlers[el.dataset.change]) handlers[el.dataset.change](el, e);
  });

  // ---- toast / modal ----
  let toastTimer = null;
  App.toast = function (msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2600);
  };

  App.modalKind = null;
  App.modal = function (html, kind, cls) {
    modalEl.className = 'modal' + (cls ? ' ' + cls : '');   // cls: e.g. 'note-bg' for the full-screen wall
    modalEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    modalEl.hidden = false;
    document.body.classList.add('modal-open');
    App.modalKind = kind || 'generic';
    const f = modalEl.querySelector('[autofocus]');
    if (f) f.focus();
  };
  App.closeModal = function () {
    modalEl.className = 'modal';
    modalEl.hidden = true;
    modalEl.innerHTML = '';
    document.body.classList.remove('modal-open');
    App.modalKind = null;
  };
  App.act('closeModal', () => App.closeModal());

  // Generic confirm: onOk runs when the user accepts.
  App.confirm = function (o) {
    App.modal(`<h2>${esc(o.title)}</h2><p>${o.body}</p>
      <div class="btns"><button class="btn" data-act="closeModal">${esc(o.cancel || 'ביטול')}</button>
      <button class="btn ${o.danger ? 'danger' : 'primary'}" data-act="confirmOk">${esc(o.ok || 'אישור')}</button></div>`, 'confirm');
    App.act('confirmOk', () => { App.closeModal(); o.onOk(); });
  };

  // ---- render ----
  const placeholders = {};

  let lastSig = '';
  App.render = function () {
    const st = App.status();
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === App.tab));
    if (Views[App.tab]) {
      view.innerHTML = Views[App.tab].render(App, st);
      if (Views[App.tab].after) Views[App.tab].after(App, st);
    } else {
      view.innerHTML = '';
    }
    // A failed day waits for the user's decision: show the warning (not while fixing).
    if (st.phase === 'pending' && !App.fix) {
      if (App.modalKind !== 'pending') Views.today.openPending(App);
    } else if (App.modalKind === 'pending') {
      App.closeModal();
    }
    // A day just closed OK: show its sticky note once (newest only); the milestone dialog follows.
    if (!App.modalKind && st.phase !== 'pending') {
      const note = D.pendingNote(App.state);
      if (note) Views.note.openToday(App, note);
      else {
        const m = D.pendingMilestone(App.state);
        if (m) Views.progress.openMilestone(App, m);
      }
    }
    lastSig = signature(st);
  };

  // Reminder cue only matters on the Today tab (avoids redrawing a form you're typing in).
  const cue = (st) => {
    if (App.tab !== 'today' || st.phase !== 'active' || App.fix) return '';
    const r = Reminders.due(App.state, App.state.days[st.today] || D.newDay(), App.now());
    return r ? r.id : '';
  };
  const signature = (st) => [st.phase, st.today, st.closedToday, App.fix, cue(st)].join('|');

  // Re-check the day lifecycle (cutoff passed? day auto-closed?) and redraw if it changed.
  App.refresh = function () {
    const r = D.sync(App.state, App.now());
    if (r.changed) App.commit();
    if (r.changed || signature(App.status()) !== lastSig) App.render();
  };

  App.go = function (tab) { App.tab = tab; App.render(); window.scrollTo(0, 0); };
  tabs.forEach((b) => b.addEventListener('click', () => App.go(b.dataset.tab)));

  // ---- boot ----
  if (App.loadError === 'corrupt') {
    App.toast('הנתונים השמורים לא נקראו — נשמר עותק גולמי לשחזור.', 8000);
  }
  Object.values(Views).forEach((v) => { if (v.wire) v.wire(App); });
  // A day that was waiting for a decision may only have failed on rules that are no longer tracked.
  if (App.state.pending) D.reevaluatePending(App.state, App.now());
  D.sync(App.state, App.now());
  App.commit();
  App.render();
  Store.requestPersistence();

  setInterval(() => { App.refresh(); Views.today.tick(App); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) App.refresh(); });
  window.addEventListener('pageshow', App.refresh);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // updateViaCache:'none' => the browser never serves sw.js itself from its HTTP cache.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
})();
