// Home-workout player: the plan AND its timer on one full-screen page (overlay #player).
// Time comes from timestamps (js/homeworkout.js), so the position is exact after the phone locks or the app
// is reopened. The overlay has its own 250 ms loop and is never touched by App.render().
(function (root) {
  'use strict';

  const HW = HomeWorkout, PLANS = HomePlans.PLANS;
  const SOUND_KEY = '75hard:sound';

  const ui = {
    planId: null, c: null, view: null,        // view: 'overview' | 'run' | 'done'
    prevElapsed: 0, timer: 0, lastIndex: -1, confirmStop: false,
    ctx: null, wake: null, sound: true, flashTimer: 0
  };
  const stats = { beeps: [], flashes: 0, wakeRequests: 0 };      // for tests / debugging
  try { ui.sound = root.localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { /* storage unavailable: keep the default */ }

  const planOf = (id) => PLANS.find((p) => p.id === id);
  const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  const host = () => document.getElementById('player');
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const catChip = (cat) => `<span class="catchip cat-${cat}">${Training.BY.get(cat).short}</span>`;

  // ---------- sound (Web Audio; created from a tap) ----------
  function audio() {
    if (!ui.sound) return null;
    if (!ui.ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ui.ctx = new AC(); } catch (e) { return null; }
    }
    if (ui.ctx.state === 'suspended') ui.ctx.resume();
    return ui.ctx;
  }
  function beep(freq, ms, vol, delayMs) {
    if (!ui.sound) return;
    stats.beeps.push(freq);
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + (delayMs || 0) / 1000, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.4, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + ms / 1000 + 0.03);
  }
  const playChange = (kind) => beep(kind === 'work' || kind === 'block' ? 880 : 520, 260, 0.45);
  const playTick = () => beep(700, 90, 0.3);
  const playDone = () => [660, 880, 1100].forEach((f, i) => beep(f, 220, 0.45, i * 240));

  // ---------- keep the screen awake (when the browser allows it) ----------
  async function lock() {
    try {
      if (root.navigator.wakeLock && !ui.wake) {
        stats.wakeRequests++;
        ui.wake = await root.navigator.wakeLock.request('screen');
        ui.wake.addEventListener('release', () => { ui.wake = null; });
      }
    } catch (e) { ui.wake = null; }
  }
  function unlock() { try { if (ui.wake) ui.wake.release(); } catch (e) { /* already released */ } ui.wake = null; }

  // ---------- rendering ----------
  const running = (app) => !!app.state.homeRun && ui.view === 'run';

  function sectionsHtml(app, c, cur) {
    const { esc } = app, plan = planOf(ui.planId);
    return plan.sections.map((sec, si) => {
      const s = c.sections[si];
      const mins = Math.round((s.endMs - s.startMs) / 60000 * 10) / 10;
      let body = '';
      if (sec.kind === 'block') body = '';
      else if (sec.kind === 'intervals') body = `<li>${sec.repeat} × ${sec.work.secs} שנ׳ עבודה / ${sec.rest.secs} שנ׳ מנוחה</li>`;
      else body = sec.items.map((it, ii) => {
        const parts = it.parts && it.parts.length ? it.parts.length * it.work : it.work;
        const rest = it.rest ? ` · ${it.rest} שנ׳ מנוחה` : '';
        const here = cur && cur.section === si && cur.exercise === ii;
        return `<li class="${here ? 'cur' : ''}"><b>${esc(it.name)}</b> <small>${parts} שנ׳${rest}</small>${it.note ? `<p>${esc(it.note)}</p>` : ''}</li>`;
      }).join('');
      const rounds = sec.kind === 'circuit' && sec.rounds > 1
        ? `<p class="pl-rounds">${sec.rounds} סבבים${sec.roundRest ? ` · מנוחה של ${sec.roundRest >= 60 ? (sec.roundRest / 60) + ' דק׳' : sec.roundRest + ' שנ׳'} בין סבבים` : ''}</p>` : '';
      const here = cur && cur.section === si && cur.exercise === undefined;
      return `<section class="pl-sec${here ? ' cur' : ''}"><h3>${esc(sec.name)} <small>${mins} דק׳</small></h3>
        ${sec.note ? `<p class="pl-rounds">${esc(sec.note)}</p>` : ''}${rounds}<ul>${body}</ul></section>`;
    }).join('');
  }

  function overviewHtml(app) {
    const { esc } = app, plan = planOf(ui.planId), c = ui.c;
    const tip = root.navigator.wakeLock
      ? 'המסך יישאר דלוק בזמן האימון.'
      : 'כדי שהמסך לא יכבה באמצע, כבו נעילה אוטומטית בהגדרות הטלפון (תצוגה ← נעילה אוטומטית).';
    return `<div class="pl-wrap">
      <div class="pl-top"><button class="pl-x" data-act="plClose" aria-label="סגירה">✕</button><h1>${esc(plan.name)}</h1></div>
      <p class="pl-note">${esc(plan.note || '')}</p>
      <div class="pl-meta"><b>${Math.round(c.totalMs / 60000)} דק׳</b> ${catChip(plan.cat)}</div>
      <div class="pl-sections">${sectionsHtml(app, c, null)}</div>
      <p class="pl-tip">${esc(tip)} הצלילים נשמעים כשהמסך דלוק והטלפון לא על שקט.</p>
      <button class="btn primary big" data-act="plStart">התחל</button></div>`;
  }

  function runHtml(app) {
    const { esc } = app, plan = planOf(ui.planId), c = ui.c, run = app.state.homeRun;
    const el = HW.elapsed(run, app.now()), pos = HW.positionAt(c, el), seg = pos.segment;
    const next = c.segments[pos.index + 1];
    const paused = HW.isPaused(run);
    const secName = c.sections[seg.section].name + (seg.rounds > 1 && seg.kind !== 'block' ? ` · סבב ${seg.round}/${seg.rounds}` : '');
    const confirm = ui.confirmStop ? `<div class="pl-confirm"><b>לעצור את האימון?</b><p>ההתקדמות לא תישמר.</p>
        <div class="btns"><button class="btn" data-act="plStopNo">המשך באימון</button><button class="btn danger" data-act="plStopYes">עצור</button></div></div>` : '';
    return `<div class="pl-wrap run kind-${seg.kind}${paused ? ' paused' : ''}">
      <div class="pl-top"><button class="pl-x" data-act="plStop" aria-label="עצירה">✕</button><b class="pl-name">${esc(plan.name)}</b>
        <button class="pl-snd" data-act="plSound" aria-label="צליל" aria-pressed="${ui.sound}">${ui.sound ? 'צליל פועל' : 'צליל כבוי'}</button></div>
      <div class="pl-clock"><span data-pl="elapsed">${mmss(el)}</span> / ${mmss(c.totalMs)}</div>
      <div class="pl-prog"><i data-pl="prog" style="width:${Math.min(100, (el / c.totalMs) * 100)}%"></i></div>
      <div class="pl-now" data-pl="now">
        <small class="pl-sec-name">${esc(secName)}</small>
        <h2 class="pl-label">${esc(seg.label)}</h2>
        <div class="pl-count" data-pl="count">${mmss(pos.remainingMs)}</div>
        ${paused ? '<div class="pl-paused">מושהה</div>' : ''}
        ${seg.note ? `<p class="pl-snote">${esc(seg.note)}</p>` : ''}
      </div>
      <div class="pl-next">${next ? `הבא: <b>${esc(next.label)}</b> · ${next.secs} שנ׳` : 'זה הקטע האחרון'}</div>
      <div class="pl-ctrls">
        <button class="btn" data-act="plBack">אחורה</button>
        <button class="btn primary big" data-act="plPause">${paused ? 'המשך' : 'השהה'}</button>
        <button class="btn" data-act="plSkip">דלג</button>
      </div>
      <div class="pl-list" id="plList">${sectionsHtml(app, c, { section: seg.section, exercise: seg.exercise })}</div>
      ${confirm}</div>`;
  }

  function doneHtml(app) {
    const { esc } = app, plan = planOf(ui.planId), c = ui.c, run = app.state.homeRun;
    const credited = HW.creditedMin(c, run), today = app.status().today, day = app.state.days[today] || {};
    const free = ['w1', 'w2'].filter((id) => !(day[id] && day[id].done) && !(app.state.timer && app.state.timer.id === id && app.state.timer.dayKey === today));
    const canLog = app.status().phase === 'active' && Day.canEdit(app.state, today, app.now());
    const buttons = canLog && free.length
      ? free.map((id) => `<button class="btn primary big" data-act="plLog" data-id="${id}">רשום כאימון ${id === 'w1' ? '1' : '2'}</button>`).join('')
      : `<p class="pl-tip">${canLog ? 'שני האימונים של היום כבר נרשמו.' : 'אי אפשר לרשום עכשיו (היום סגור או שהאתגר לא פעיל).'}</p>`;
    return `<div class="pl-wrap done">
      <div class="pl-top"><b class="pl-name">${esc(plan.name)}</b></div>
      <h1 class="pl-fin">סיימתם!</h1>
      <p class="pl-fin-sub">נרשמים ${credited} דקות מתוך ${Math.round(c.totalMs / 60000)}</p>
      ${credited < 45 ? '<p class="pl-warn">פחות מ-45 דקות: האימון לא יעמוד בכלל ה-45 דקות, והיום יסומן כחסר.</p>' : ''}
      <div class="pl-log">${buttons}</div>
      <button class="btn" data-act="plDiscard">סגירה בלי לרשום</button></div>`;
  }

  function render(app) {
    const h = host();
    if (!h) return;
    h.innerHTML = ui.view === 'run' ? runHtml(app) : ui.view === 'done' ? doneHtml(app) : overviewHtml(app);
    const cur = h.querySelector('.pl-list .cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  // ---------- the loop ----------
  function stopLoop() { if (ui.timer) { clearInterval(ui.timer); ui.timer = 0; } }
  function startLoop(app) { stopLoop(); ui.timer = setInterval(() => frame(app), 250); }

  function flash() {
    const n = host() && host().querySelector('[data-pl=now]');
    if (!n || reduced()) return;
    stats.flashes++;
    n.classList.add('flash');
    clearTimeout(ui.flashTimer);
    ui.flashTimer = setTimeout(() => n.classList.remove('flash'), 450);
  }

  function frame(app) {
    const run = app.state.homeRun;
    if (!run || !host() || host().hidden) { stopLoop(); return; }
    if (ui.view !== 'run') return;
    const el = HW.elapsed(run, app.now());
    if (!HW.isPaused(run)) {
      HW.cuesBetween(ui.c, ui.prevElapsed, el).forEach((q) => {
        if (q.type === 'tick') playTick();
        else if (q.type === 'change') { playChange(ui.c.segments[q.index].kind); }
        else if (q.type === 'done') playDone();
      });
    }
    ui.prevElapsed = el;
    const pos = HW.positionAt(ui.c, el);
    if (pos.done) { finish(app); return; }
    if (pos.index !== ui.lastIndex) { ui.lastIndex = pos.index; render(app); flash(); return; }     // new segment: redraw
    const h = host(), count = h.querySelector('[data-pl=count]');
    if (count) count.textContent = mmss(pos.remainingMs);
    const clock = h.querySelector('[data-pl=elapsed]'); if (clock) clock.textContent = mmss(el);
    const prog = h.querySelector('[data-pl=prog]'); if (prog) prog.style.width = Math.min(100, (el / ui.c.totalMs) * 100) + '%';
    const now = h.querySelector('[data-pl=now]'); if (now) now.classList.toggle('last3', !HW.isPaused(run) && pos.remainingMs <= 3000);
  }

  function finish(app) {
    stopLoop(); unlock();
    ui.view = 'done';
    render(app);
  }

  function show(app, planId) {
    const plan = planOf(planId);
    if (!plan) return;
    ui.planId = planId; ui.c = HW.compile(plan); ui.confirmStop = false; ui.lastIndex = -1;
    const run = app.state.homeRun;
    const h = host();
    h.hidden = false; document.body.classList.add('player-open');
    if (run && run.planId === planId) {
      const pos = HW.positionAt(ui.c, HW.elapsed(run, app.now()));
      ui.prevElapsed = pos.elapsedMs;
      ui.view = pos.done ? 'done' : 'run';
      if (ui.view === 'run') { ui.lastIndex = pos.index; startLoop(app); if (!HW.isPaused(run)) lock(); }
    } else ui.view = 'overview';
    render(app);
  }

  function close(app) {
    stopLoop(); unlock(); clearTimeout(ui.flashTimer);
    const h = host();
    if (h) { h.hidden = true; h.innerHTML = ''; }
    document.body.classList.remove('player-open');
    ui.view = null;
  }

  // ---------- entry points ----------
  // The list of plans, as a modal (used from Today) and as a card (Workouts tab).
  function planRows(app) {
    return PLANS.map((p) => `<button class="plan-row" data-act="plOpen" data-id="${p.id}">
      <span class="pr-name">${app.esc(p.name)}</span><span class="pr-meta">${catChip(p.cat)} ${Math.round(HW.compile(p).totalMs / 60000)} דק׳</span></button>`).join('');
  }
  function resumeBanner(app) {
    const run = app.state.homeRun, plan = run && planOf(run.planId);
    if (!plan) return '';
    return `<div class="banner warn"><b>אימון בהתקדמות: ${app.esc(plan.name)}</b>
      <div class="btns"><button class="btn primary mini" data-act="plOpen" data-id="${plan.id}">המשך</button></div></div>`;
  }
  function card(app) {
    return `<section class="group"><h2>אימון בבית: תוכנית וטיימר במקום אחד</h2>${resumeBanner(app)}<div class="plan-list">${planRows(app)}</div></section>`;
  }

  function wire(app) {
    app.act('plChoose', () => {
      app.modal(`<h2>אימון בבית</h2>${resumeBanner(app)}<div class="plan-list">${planRows(app)}</div>
        <div class="btns"><button class="btn" data-act="closeModal">ביטול</button></div>`);
    });
    app.act('plOpen', (el) => {
      const id = el.dataset.id, run = app.state.homeRun;
      app.closeModal();
      if (run && run.planId !== id) {       // another workout is in progress: don't silently drop it
        app.confirm({ title: 'יש אימון בהתקדמות', body: 'פתיחת תוכנית אחרת תבטל אותו. להמשיך?', ok: 'כן, תוכנית אחרת', danger: true,
          onOk: () => { app.state.homeRun = null; app.commit(); show(app, id); } });
        return;
      }
      show(app, id);
    });
    app.act('plClose', () => close(app));
    app.act('plStart', () => {                                         // a tap: the one place sound may start
      app.state.homeRun = HW.newRun(ui.planId, app.now(), app.status().today);
      app.commit();
      ui.view = 'run'; ui.prevElapsed = 0; ui.lastIndex = 0;
      audio(); lock(); startLoop(app); render(app);
      playChange(ui.c.segments[0].kind);
    });
    app.act('plPause', () => {
      const run = app.state.homeRun; if (!run) return;
      if (HW.isPaused(run)) { HW.resume(run, app.now()); ui.prevElapsed = HW.elapsed(run, app.now()); audio(); lock(); }
      else { HW.pause(run, app.now()); unlock(); }
      app.commit(); render(app);
    });
    const jump = (fn) => () => {
      const run = app.state.homeRun; if (!run) return;
      fn(ui.c, run, app.now());
      const el = HW.elapsed(run, app.now()), pos = HW.positionAt(ui.c, el);
      ui.prevElapsed = el; app.commit();
      if (pos.done) { finish(app); return; }
      ui.lastIndex = pos.index; render(app); playChange(pos.segment.kind); flash();
    };
    app.act('plSkip', jump(HW.skip));
    app.act('plBack', jump(HW.back));
    app.act('plStop', () => { ui.confirmStop = true; render(app); });
    app.act('plStopNo', () => { ui.confirmStop = false; render(app); });
    app.act('plStopYes', () => { app.state.homeRun = null; app.commit(); close(app); });
    app.act('plSound', () => {
      ui.sound = !ui.sound;
      try { root.localStorage.setItem(SOUND_KEY, ui.sound ? '1' : '0'); } catch (e) { /* not saved, still works now */ }
      if (ui.sound) { audio(); beep(660, 120, 0.3); }
      render(app);
    });
    app.act('plLog', (el) => {
      const run = app.state.homeRun, plan = planOf(ui.planId); if (!run || !plan) return;
      const ok = HW.logWorkout(app.state, app.status().today, app.now(), el.dataset.id, plan, ui.c, run);
      if (!ok) { app.toast('אי אפשר לרשום: המשבצת תפוסה או שהיום נסגר', 4000); return; }
      app.state.homeRun = null; app.commit(); close(app); app.render();
      app.toast(`נרשם כאימון ${el.dataset.id === 'w1' ? '1' : '2'}: ${plan.name}`, 4000);
    });
    app.act('plDiscard', () => { app.state.homeRun = null; app.commit(); close(app); app.render(); });

    // coming back to the app mid-workout: re-take the screen lock and catch the clock up at once
    document.addEventListener('visibilitychange', () => { if (!document.hidden && running(app) && !HW.isPaused(app.state.homeRun)) { lock(); frame(app); } });
  }

  root.Views = root.Views || {};
  root.Views.player = { wire, card, resumeBanner, show, close, stats, state: ui };
})(typeof globalThis !== 'undefined' ? globalThis : this);
