// Home-workout player: the plan AND its timer on one full-screen page (overlay #player).
// Time comes from timestamps (js/homeworkout.js), so the position is exact after the phone locks or the app
// is reopened. The overlay has its own 250 ms loop and is never touched by App.render().
(function (root) {
  'use strict';

  const HW = HomeWorkout, PLANS = HomePlans.PLANS, TARGET_MIN = 45;
  const SOUND_KEY = '75hard:sound';

  const ui = {
    planId: null, c: null, view: null,        // view: 'overview' | 'run' | 'done'
    prevElapsed: 0, timer: 0, lastIndex: -1, confirmStop: false,
    ctx: null, wake: null, sound: true, flashTimer: 0
  };
  const stats = { beeps: [], flashes: 0, wakeRequests: 0 };      // for tests / debugging
  const LOUD_KEY = '75hard:soundLoud', ALT_KEY = '75hard:soundAlt', MUSIC_KEY = '75hard:musicMode';
  ui.music = 'duck';                                            // what the beeps do to the user's music: duck | pause | mix
  ui.alt = false;                                               // opt-in: the <audio> fallback (it takes the audio away from Spotify)
  ui.loud = false;                                              // "sound even when the phone is on silent" (opt-in)
  try { ui.sound = root.localStorage.getItem(SOUND_KEY) !== '0'; ui.loud = root.localStorage.getItem(LOUD_KEY) === '1'; ui.alt = root.localStorage.getItem(ALT_KEY) === '1'; const mm = root.localStorage.getItem(MUSIC_KEY); if (mm === 'duck' || mm === 'pause' || mm === 'mix') ui.music = mm; } catch (e) { /* storage unavailable: keep the defaults */ }

  const HB = HomeBlocks;
  const draftOf = (app) => app.state.homeCustom || (app.state.homeCustom = { blocks: [] });
  // 'custom' = the user's own block workout, built from the draft stored in state.homeCustom
  const planOf = (id) => id === HB.CUSTOM_ID ? HB.buildPlan(root.App && root.App.state.homeCustom) : PLANS.find((p) => p.id === id);
  const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  const host = () => document.getElementById('player');
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const catChip = (cat) => `<span class="catchip cat-${cat}">${Training.BY.get(cat).short}</span>`;

  // ---------- sound (Web Audio; created from a tap) ----------
  // iPhone: the silent switch mutes Web Audio, and when another app (Spotify...) takes the audio Safari puts the
  // context in 'interrupted'. So: create it from a tap, start a source in that tap, and WAKE it whenever it is not
  // 'running' - before every cue and on every tap inside the player.
  function applySession() {                                     // Safari's Audio Session API, where it exists
    try {
      // 'transient' = a short sound that DUCKS other audio and lets it come back; 'transient-solo' = pauses the other audio
      // for the beep and lets it resume; 'ambient' = just mix; 'playback' = also ignore the silent switch (may pause music)
      if (root.navigator.audioSession) root.navigator.audioSession.type = ui.loud ? 'playback' : ui.music === 'duck' ? 'transient' : ui.music === 'pause' ? 'transient-solo' : 'ambient';
    } catch (e) { /* not supported */ }
  }
  function unlockBuffer(c) {                                    // some iOS versions only unlock once a source has started in the tap
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) { /* not supported */ }
  }
  function audio() {
    if (!ui.sound) return null;
    if (!ui.ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      applySession();
      try { ui.ctx = new AC(); } catch (e) { return null; }
      unlockBuffer(ui.ctx);
      if (ui.alt) unlockElement();
    }
    if (ui.ctx.state !== 'running') {                           // 'suspended' OR iOS 'interrupted'
      try { const p = ui.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* needs a tap */ }
    }
    return ui.ctx;
  }
  const setTestMsg = (text) => { const m = document.getElementById('plTestMsg'); if (m) m.textContent = text; };
  // LOUD on purpose: phone speakers are weak below ~700 Hz, so the tones sit at 900-1800 Hz, a square wave carries
  // far more energy than a sine, the gain is near full and a compressor + make-up gain evens the peaks out.
  function master(c) {
    if (ui.masterFor !== c) {
      ui.masterFor = c; ui.master = c.destination;
      try {
        const comp = c.createDynamicsCompressor(), g = c.createGain();
        comp.threshold.value = -30; comp.knee.value = 12; comp.ratio.value = 14; comp.attack.value = 0.002; comp.release.value = 0.12;
        g.gain.value = 1.6;
        comp.connect(g); g.connect(c.destination); ui.master = comp;
      } catch (e) { ui.master = c.destination; }
    }
    return ui.master;
  }
  function beepNow(c, freq, ms, vol, delayMs) {
    const t0 = c.currentTime + (delayMs || 0) / 1000, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.9, t0 + 0.005);
    g.gain.setValueAtTime(vol || 0.9, t0 + Math.max(0.006, ms / 1000 - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g); g.connect(master(c));
    o.start(t0); o.stop(t0 + ms / 1000 + 0.03);
  }
  // Every cue is a list of [freq, ms, delayMs]. A new exercise = double beep (high), a rest = one lower, longer beep.
  const CUES = {
    work: [[1320, 140, 0], [1320, 140, 190]],
    rest: [[990, 340, 0]],
    tick: [[1100, 110, 0]],
    done: [[880, 260, 0], [1100, 260, 230], [1320, 260, 460], [1760, 260, 690]],
    test: [[880, 220, 0], [1320, 220, 280], [1760, 220, 560]]
  };

  // SPOTIFY FIX. When another app takes the audio, iOS puts the Web Audio context in 'interrupted' and only a TAP can
  // restart it - but nobody taps during a workout. So when the context is not running at cue time, the cue is played
  // through an ordinary <audio> element instead: one element is created and "unlocked" in the Start tap, and iOS lets
  // an unlocked element play later from a timer. The cue is rendered to a tiny WAV (same tones). With the Audio
  // Session API the session is set to 'transient' for it (a short sound over the music) when available.
  function wavUrl(name) {
    ui.wavs = ui.wavs || {};
    if (ui.wavs[name]) return ui.wavs[name];
    const RATE = 22050, notes = CUES[name] || [];
    const total = notes.reduce((m, n) => Math.max(m, n[2] + n[1]), 0) + 60;
    const data = new Int16Array(Math.ceil(RATE * total / 1000));
    notes.forEach(([f, ms, delay]) => {
      const start = Math.floor(RATE * delay / 1000), len = Math.floor(RATE * ms / 1000);
      for (let i = 0; i < len; i++) {
        const env = Math.min(1, i / (RATE * 0.005), (len - i) / (RATE * 0.04));          // short fade in / out: no clicks
        data[start + i] += (Math.sin(2 * Math.PI * f * i / RATE) >= 0 ? 1 : -1) * 0.8 * Math.max(0, env) * 32767;
      }
    });
    const buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, data.length * 2, true);
    data.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
    return (ui.wavs[name] = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  }
  function unlockElement() {                                    // inside a tap; only when the user switched the fallback on
    try {
      if (ui.el || !root.Audio) return;
      ui.el = new root.Audio();
      ui.el.setAttribute('playsinline', '');
      ui.el.src = wavUrl('tick'); ui.el.volume = 0;
      const p = ui.el.play(); if (p && p.catch) p.catch(() => {});
      setTimeout(() => { if (ui.el) ui.el.volume = 1; }, 400);
    } catch (e) { ui.el = null; }
  }
  function fallbackCue(name) {
    stats.fallbacks = (stats.fallbacks || 0) + 1;
    try {
      if (!ui.el) return;
      if (root.navigator.audioSession && !ui.loud) root.navigator.audioSession.type = 'transient';
      ui.el.src = wavUrl(name); ui.el.volume = 1;
      const p = ui.el.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) { /* nothing more to try */ }
  }
  function play(name) {
    if (!ui.sound) return;
    const notes = CUES[name]; if (!notes) return;
    applySession();                                              // set the music behaviour right before the beep
    notes.forEach((n) => stats.beeps.push(n[0]));
    const c = audio();
    const justTapped = Date.now() - (ui.tapAt || 0) < 1500;      // a tap is waking the engine right now: it will be running in a moment
    const go = () => {
      notes.forEach((n) => beepNow(c, n[0], n[1], 0.95, n[2]));
      // RELEASE the audio hardware shortly after the cue: an idle-but-running context keeps the iPhone's audio session
      // active, so the music app never gets the audio back. (Not in 'mix' mode: nothing to give back there.)
      clearTimeout(ui.releaseT);
      if (ui.music !== 'mix') {
        const end = notes.reduce((m, n) => Math.max(m, n[2] + n[1]), 0);
        ui.releaseT = setTimeout(() => { try { if (ui.ctx === c && c.state === 'running') { ui.released = true; c.suspend(); } } catch (e) { /* ignore */ } }, end + 300);
      }
    };
    if (!c) fallbackCue(name);
    else if (c.state === 'running') go();
    else if (c.state === 'suspended' && (justTapped || ui.released)) {     // woken by a tap, or released by us after the last cue
      ui.released = false;
      Promise.resolve(c.resume()).then(() => { if (c.state === 'running') go(); else fallbackCue(name); }).catch(() => fallbackCue(name));
    } else fallbackCue(name);
  }
  const playChange = (kind) => play(kind === 'work' || kind === 'block' ? 'work' : 'rest');
  const playTick = () => play('tick');
  const playDone = () => play('done');

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
      <p class="pl-tip">${esc(tip)}</p>
      <div class="pl-sound">
        <button class="btn mini" data-act="plTest">בדיקת צליל</button>
        <button class="btn mini" data-act="plSound">${ui.sound ? 'צליל: פועל' : 'צליל: כבוי'}</button>
        ${root.navigator.audioSession ? `<button class="btn mini" data-act="plMusic">${ui.music === 'duck' ? 'מוזיקה: מונמכת בצפצוף' : ui.music === 'pause' ? 'מוזיקה: נעצרת בצפצוף' : 'מוזיקה: ללא שינוי'}</button>` : ''}
        <button class="btn mini" data-act="plAlt">${ui.alt ? 'ספוטיפיי: נגן חלופי פועל' : 'ספוטיפיי: נגן חלופי כבוי'}</button>
        ${root.navigator.audioSession ? `<button class="btn mini" data-act="plLoud">${ui.loud ? 'גם במצב שקט: פועל' : 'גם במצב שקט: כבוי'}</button>` : ''}
      </div>
      <p class="pl-tip" id="plTestMsg">לא שומעים? ודאו שמתג הצלצול בצד האייפון לא על שקט (בלי פס כתום) והעלו עוצמה.</p>
      ${plan.id === HB.CUSTOM_ID ? '<button class="btn big" data-act="blEdit">ערוך בלוקים</button>' : ''}
      <button class="btn primary big" data-act="plStart">התחל</button></div>`;
  }

  // ---------- the builder (custom workout) ----------
  function buildHtml(app) {
    const { esc } = app, d = draftOf(app), total = HB.totalMin(d);
    const gap = TARGET_MIN - total;
    const status = !d.blocks.length ? 'הוסיפו בלוקים של 10 או 15 דקות. לדוגמה 15+15+15 או 15+10+10+10 = 45.'
      : gap === 0 ? 'בול 45 דקות ✓' : gap > 0 ? `חסרות ${gap} דקות ל-45` : `${-gap} דקות מעל 45`;
    const blocks = d.blocks.map((b, bi) => {
      const th = HB.theme(b.theme);
      const rows = HB.slotsFor(b).map((s, si) => {
        const opt = s.options[b.picks[si]], locked = b.locks[si];
        return `<li class="bl-slot${locked ? ' locked' : ''}"><small>${esc(s.name)}</small>
          <select data-change="blPick" data-b="${bi}" data-s="${si}" ${locked ? 'disabled' : ''} aria-label="${esc(s.name)}">${s.options.map((x, xi) => `<option value="${xi}"${xi === b.picks[si] ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          ${opt.note ? `<p>${esc(opt.note)}</p>` : ''}
          <div class="bl-btns"><button class="btn mini" data-act="blRoll" data-b="${bi}" data-s="${si}" ${locked ? 'disabled' : ''}>החלף</button>
          <button class="btn mini${locked ? ' primary' : ''}" data-act="blLock" data-b="${bi}" data-s="${si}">${locked ? 'נעול · שחרר' : 'נעל'}</button></div></li>`;
      }).join('');
      return `<section class="pl-sec bl-block"><h3>בלוק ${bi + 1}: ${esc(th.name)} <small>${b.mins} דק׳</small></h3>
        <div class="bl-btns"><button class="btn mini" data-act="blShuffle" data-b="${bi}">ערבב את הלא-נעולים</button><button class="btn mini" data-act="blRemove" data-b="${bi}">הסר בלוק</button></div>
        <ul class="bl-slots">${rows}</ul></section>`;
    }).join('');
    const full = d.blocks.length >= HB.MAX_BLOCKS;
    return `<div class="pl-wrap">
      <div class="pl-top"><button class="pl-x" data-act="plClose" aria-label="סגירה">✕</button><h1>אימון מותאם</h1></div>
      <p class="pl-note">בחרו בלוקים של 10 או 15 דקות, החליפו תרגילים, ונעלו את מה שמוצא חן בעיניכם. אחר כך זה אימון רגיל עם טיימר.</p>
      <div class="pl-meta"><b>${total} דק׳</b> <span class="bl-status${gap === 0 && total ? ' ok' : ''}">${esc(status)}</span></div>
      ${blocks}
      <div class="bl-add"><select id="blTheme" aria-label="נושא הבלוק">${HB.THEMES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        <div class="bl-btns"><button class="btn" data-act="blAdd" data-mins="10" ${full ? 'disabled' : ''}>+ בלוק 10 דק׳</button>
        <button class="btn" data-act="blAdd" data-mins="15" ${full ? 'disabled' : ''}>+ בלוק 15 דק׳</button></div></div>
      ${d.blocks.length ? '<button class="btn" data-act="blShuffleAll">ערבב הכל (חוץ מהנעולים)</button>' : ''}
      <button class="btn primary big" data-act="blDone" ${d.blocks.length ? '' : 'disabled'}>הכן אימון (${total} דק׳)</button></div>`;
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
    const top = h.scrollTop;
    h.innerHTML = ui.view === 'run' ? runHtml(app) : ui.view === 'done' ? doneHtml(app) : ui.view === 'build' ? buildHtml(app) : overviewHtml(app);
    h.scrollTop = top;      // keep the page exactly where it was: no auto-scroll to the plan list, the timer stays in view
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
    } else ui.view = planId === HB.CUSTOM_ID ? 'build' : 'overview';
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
    const d = app.state.homeCustom, built = d && d.blocks.length;
    return PLANS.map((p) => `<button class="plan-row" data-act="plOpen" data-id="${p.id}">
      <span class="pr-name">${app.esc(p.name)}</span><span class="pr-meta">${catChip(p.cat)} ${Math.round(HW.compile(p).totalMs / 60000)} דק׳</span></button>`).join('')
      + `<button class="plan-row" data-act="plOpen" data-id="${HB.CUSTOM_ID}"><span class="pr-name">אימון מותאם: בלוקים של 10/15 דק׳</span>
      <span class="pr-meta">${built ? `${HB.totalMin(d)} דק׳ · ` : ''}בנו והחליפו</span></button>`;
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
      if (ui.sound) play('tick');
      render(app);
    });
    app.act('plTest', () => {
      if (!ui.sound) { setTestMsg('הצליל כבוי. הפעילו אותו בכפתור "צליל" ונסו שוב.'); return; }
      const c = audio();
      if (!c) { setTestMsg('הדפדפן הזה לא תומך בצליל.'); return; }
      // give a suspended engine a moment to wake from this tap, then play (engine if running, else the <audio> fallback)
      setTimeout(() => {
        const running = c.state === 'running';
        play('test');
        setTestMsg(running
          ? 'מנוע הצליל פעיל. לא שמעתם? ודאו שמתג הצלצול בצד האייפון לא על שקט (בלי פס כתום) והעלו עוצמה.'
          : (ui.alt ? `אפליקציה אחרת (ספוטיפיי?) תפסה את הצליל (מצב המנוע: ${c.state}). הצליל מנוגן דרך נגן חלופי.` : `אפליקציה אחרת (ספוטיפיי?) תפסה את הצליל (מצב המנוע: ${c.state}). הפעילו את הכפתור נגן חלופי כדי שהצפצופים ינוגנו בכל זאת (עלול לעצור את המוזיקה).`));
      }, 250);
    });
    app.act('plMusic', () => {
      ui.music = ui.music === 'duck' ? 'pause' : ui.music === 'pause' ? 'mix' : 'duck';
      try { root.localStorage.setItem(MUSIC_KEY, ui.music); } catch (e) { /* not saved, still works now */ }
      applySession(); render(app);
      setTestMsg(ui.music === 'duck' ? 'המוזיקה תונמך בזמן הצפצוף ותחזור אחריו. לחצו בדיקת צליל כדי לשמוע.'
        : ui.music === 'pause' ? 'המוזיקה תיעצר בזמן הצפצוף ותמשיך אחריו (אם האפליקציה שלה מחדשת לבד).' : 'הצפצופים מתערבבים עם המוזיקה בלי לשנות אותה.');
    });
    app.act('plAlt', () => {                                       // a tap: the one place the element can be unlocked
      ui.alt = !ui.alt;
      try { root.localStorage.setItem(ALT_KEY, ui.alt ? '1' : '0'); } catch (e) { /* not saved, still works now */ }
      if (ui.alt) unlockElement();
      render(app);
      setTestMsg(ui.alt
        ? 'נגן חלופי פועל: אם ספוטיפיי תופס את הצליל, הצפצופים יתנגנו דרך נגן רגיל. שימו לב: זה עלול לעצור את המוזיקה. הפעילו אותה שוב אחרי שלחצתם התחל.'
        : 'נגן חלופי כבוי: הצפצופים מתערבבים עם המוזיקה ולא עוצרים אותה, אבל ייתכן שיושתקו כשספוטיפיי תופס את הצליל.');
    });
    app.act('plLoud', () => {
      ui.loud = !ui.loud;
      try { root.localStorage.setItem(LOUD_KEY, ui.loud ? '1' : '0'); } catch (e) { /* not saved, still works now */ }
      applySession();
      render(app);
      setTestMsg(ui.loud ? 'גם במצב שקט: הצלילים יישמעו גם כשהטלפון על שקט, אבל ייתכן שהמוזיקה תושתק לרגע בכל צליל.' : 'הצלילים יתערבבו עם המוזיקה ויושתקו כשהטלפון על שקט.');
    });
    // ---- builder ----
    const rng = () => Math.random();
    const edit = (fn) => { fn(draftOf(app)); app.commit(); render(app); };
    const blk = (d, el) => d.blocks[Number(el.dataset.b)];
    app.act('blAdd', (el) => edit((d) => {
      const sel = document.getElementById('blTheme');
      if (d.blocks.length >= HB.MAX_BLOCKS) return;
      const b = HB.newBlock(sel && sel.value, Number(el.dataset.mins), rng);
      if (b) d.blocks.push(b);
    }));
    app.act('blRemove', (el) => edit((d) => { d.blocks.splice(Number(el.dataset.b), 1); }));
    app.act('blRoll', (el) => edit((d) => { const b = blk(d, el); if (b) HB.reroll(b, Number(el.dataset.s), rng); }));
    app.act('blLock', (el) => edit((d) => { const b = blk(d, el); if (b) HB.toggleLock(b, Number(el.dataset.s)); }));
    app.act('blShuffle', (el) => edit((d) => { const b = blk(d, el); if (b) HB.shuffleBlock(b, rng); }));
    app.act('blShuffleAll', () => edit((d) => HB.shuffleAll(d, rng)));
    app.act('blPick', (el) => edit((d) => { const b = blk(d, el); if (b) HB.setPick(b, Number(el.dataset.s), Number(el.value)); }));
    app.act('blEdit', () => { ui.view = 'build'; render(app); });
    app.act('blDone', () => {
      const d = draftOf(app); if (!d.blocks.length) return;
      ui.planId = HB.CUSTOM_ID; ui.c = HW.compile(planOf(HB.CUSTOM_ID)); ui.view = 'overview'; render(app);
      host().scrollTop = 0;
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
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ui.view && !ui.released) audio();                                  // wake the sound after another app had it
      if (!document.hidden && running(app) && !HW.isPaused(app.state.homeRun)) { lock(); frame(app); }
    });
    // any tap inside the player re-wakes the sound (a tap is the only time iOS lets it restart)
    document.addEventListener('pointerdown', (e) => { if (ui.view && e.target.closest && e.target.closest('#player')) { ui.tapAt = Date.now(); if (!ui.released) audio(); } }, true);      // a released engine stays released: waking it would grab the audio from the music app
  }

  root.Views = root.Views || {};
  root.Views.player = { wire, card, resumeBanner, show, close, stats, state: ui };
})(typeof globalThis !== 'undefined' ? globalThis : this);
