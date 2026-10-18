// Today view: start-date screens, the live checklist (meals, workouts, water, reading,
// photo), a collapsible rules reminder, End-my-day and the warn-then-confirm restart dialogs.
// Negative rules are honor-system reminders, not checkmarks.
(function (root) {
  'use strict';

  const D = Day;
  const R = 40, C = 2 * Math.PI * R;
  const MIN = 60000;

  const LABEL = {
    meal1: 'ארוחה 1', meal2: 'ארוחה 2', meal3: 'ארוחה 3',
    water: 'מים: 3.8 ליטר', read: 'קריאה: 10 עמודים', photo: 'תמונת התקדמות',
    w1: 'אימון 1', w2: 'אימון 2', w1min: 'אימון 1 קצר מ-45 דקות', w2min: 'אימון 2 קצר מ-45 דקות',
    outdoor: 'לפחות אימון אחד בחוץ'
  };
  const MEAL_SUB = { meal1: 'בוקר', meal2: 'צהריים', meal3: 'ערב' };

  function labelOf(app, id) {
    const s = app.state.settings;
    if (id === 'gap') return `מרווח של ${s.gapHours} שעות לפחות בין האימונים`;
    return LABEL[id] || id;
  }
  const listHtml = (app, ids) => `<ul class="miss">${ids.map((i) => `<li>${app.esc(labelOf(app, i))}</li>`).join('')}</ul>`;

  function fmtDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const fmtClock = (ms) => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const mmss = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000)), p = (n) => String(n).padStart(2, '0');
    return t >= 3600 ? `${Math.floor(t / 3600)}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`
      : `${p(Math.floor(t / 60))}:${p(t % 60)}`;
  };

  const viewKey = (app, st) => (app.fix && app.state.pending ? app.state.pending.dayKey : st.today);

  // ===== screens other than the live checklist =====
  function startScreen(app, st) {
    const unset = st.phase === 'unset';
    const val = unset ? st.today : app.state.run.startDate;
    return `<div class="panel">
      <h1 class="big-h">${unset ? '75 הארד' : 'האתגר עוד לא התחיל'}</h1>
      ${unset
        ? '<p>בחרו את יום ההתחלה. שום דבר לא נספר לפני התאריך הזה.</p>'
        : `<p>יום 1 הוא <b>${app.esc(fmtDate(app.state.run.startDate))}</b> — בעוד ${st.daysUntilStart} ימים.</p>`}
      <label class="field"><span>תאריך התחלה</span>
        <input type="date" id="startDate" value="${val}" min="${st.today}"></label>
      <div class="btns">
        <button class="btn primary" data-act="saveStart">${unset ? 'אישור — מתחילים' : 'עדכון תאריך'}</button>
      </div>
      <p class="hint">היום מסתיים כשאתם לוחצים "סיים את היום", או אוטומטית ב-${String(app.state.settings.cutoffHour).padStart(2, '0')}:00.</p>
    </div>`;
  }

  function completeScreen(app) {
    return `<div class="panel center"><h1 class="big-h">75 / 75</h1>
      <p>סיימתם את האתגר. ${app.state.history.length ? `ניסיון מספר ${app.state.history.length + 1}.` : 'בניסיון הראשון.'}</p></div>`;
  }

  // ===== checklist pieces =====
  function taskHtml(app, id, title, sub, key, locked) {
    const done = !!(app.state.days[key] && app.state.days[key].tasks[id]);
    return `<button class="task${done ? ' done' : ''}" data-act="toggleTask" data-id="${id}" role="checkbox"
      aria-checked="${done}" ${locked ? 'disabled' : ''}>
      <span class="box">✓</span>
      <span class="txt"><b>${app.esc(title)}</b>${sub ? `<small>${app.esc(sub)}</small>` : ''}</span></button>`;
  }

  function waterHtml(app, day, locked) {
    const goal = D.WATER_GOAL_ML, ml = day.waterMl, st = app.state.settings;
    const pct = Math.min(ml / goal * 100, 100);
    return `<div class="water"><div class="row"><b>${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} / 3.8 ליטר</b>
      <span>מים בלבד · קפה ושייק לא נספרים</span></div>
      <div class="bar${ml >= goal ? ' full' : ''}"><i style="width:${pct}%"></i></div>
      <div class="btns">
        <button class="btn" data-act="water" data-ml="-${st.bottleMl}" ${locked ? 'disabled' : ''}>−</button>
        <button class="btn primary" data-act="water" data-ml="${st.bottleMl}" ${locked ? 'disabled' : ''}>+ בקבוק (${st.bottleMl})</button>
        <button class="btn" data-act="water" data-ml="${st.glassMl}" ${locked ? 'disabled' : ''}>+ כוס</button>
      </div>
      <div class="water-custom">
        <input type="number" id="waterCustom" inputmode="numeric" min="1" max="5000" step="1" placeholder="כמה שתיתם (מ״ל)"
          aria-label="כמות מים במיליליטר" ${locked ? 'disabled' : ''}>
        <button class="btn primary mini" data-act="waterCustom" ${locked ? 'disabled' : ''}>הוסף</button>
      </div></div>`;
  }

  function readHtml(app, day, locked) {
    return `<button class="task${day.read ? ' done' : ''}" data-act="toggleRead" role="checkbox"
      aria-checked="${!!day.read}" ${locked ? 'disabled' : ''}>
      <span class="box">✓</span>
      <span class="txt"><b>קריאה: 10 עמודים</b><small>ספר עיון פיזי בלבד</small></span></button>`;
  }

  function photoHtml(app, day, key, locked) {
    return `<div class="task photo-card${day.photo ? ' done' : ''}">
      <span class="box">✓</span>
      <span class="txt"><b>תמונת התקדמות</b><small>${day.photo ? 'נשמרה במכשיר' : 'רצוי מיד אחרי ההתעוררות'}</small></span>
      ${day.photo ? `<img class="thumb" alt="תמונת היום" data-photo-key="${key}">` : ''}
      <label class="btn mini${locked ? ' disabled' : ''}"><input class="vh" type="file" accept="image/*" data-change="photoPicked" ${locked ? 'disabled' : ''}>${day.photo ? 'החלפה' : 'צילום / בחירה'}</label>
      ${day.photo && !locked ? '<button class="btn mini" data-act="delPhoto" aria-label="מחיקת תמונה">✕</button>' : ''}
    </div>`;
  }

  // Honor-system reminders (not tracked): collapsed by default so Today stays short.
  function rulesCard(app) {
    const { esc } = app, names = app.state.settings.ruleNames;
    const digital = Rules.SECTIONS.find((x) => x.id === 'digital');
    const li = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join('');
    return `<details class="card rules-card"><summary>כללים לזכור</summary>
      <p class="note-l">אלה לא סימונים — פשוט לזכור.</p>
      <b>אוכל</b><ul class="plain ban">${li(Meals.RULES.banned)}<li>${esc('רק 3 ארוחות + פרי אחד 30–60 דקות לפני אימון')}</li></ul>
      <b>משמעת</b><ul class="plain">${li(digital ? digital.items : [])}<li>${esc(names.r2)}</li><li>${esc(names.r3)}</li></ul></details>`;
  }

  // ===== workouts =====
  // little coloured label for a quota category (null = a custom session outside the quota)
  const catChip = (cat) => `<span class="catchip cat-${cat || 'other'}">${cat ? Training.BY.get(cat).short : 'אחר'}</span> `;

  function workoutHtml(app, id, key, day, locked) {
    const s = app.state, now = app.now(), w = day[id], other = day[id === 'w1' ? 'w2' : 'w1'];
    const ef = Training.effective(s, key, id), title = id === 'w1' ? 'אימון 1 · 45 דק׳' : 'אימון 2 · 45 דק׳';
    const planned = ef.text, chip = catChip(ef.cat);
    const timer = s.timer;
    const running = timer && timer.id === id && timer.dayKey === key;

    if (w.done) {
      const bits = [typeof w.min === 'number' ? `${w.min} דק׳` : 'סומן ידנית', w.outdoor ? 'בחוץ' : 'בפנים'];
      if (w.startedAt) bits.push(`${fmtClock(w.startedAt)}–${fmtClock(w.endedAt)}`);
      return `<div class="task done wk"><span class="box">✓</span>
        <span class="txt"><b>${title}</b><small>${chip}${app.esc(planned)}</small><small>${bits.join(' · ')}</small></span>
        ${locked ? '' : `<button class="btn mini" data-act="wkReset" data-id="${id}">ביטול</button>`}</div>`;
    }
    if (running) {
      const el = now - timer.startedAt, ready = el >= 45 * MIN;
      return `<div class="task wk running"><span class="txt"><b>${title}</b><small>${chip}${app.esc(planned)} · ${timer.outdoor ? 'בחוץ' : 'בפנים'}</small>
        <span class="clock" data-timer="${id}">${mmss(el)}</span>
        <span class="bar"><i data-timer-bar style="width:${Math.min(el / (45 * MIN) * 100, 100)}%"></i></span></span>
        <span class="btns col">
          <button class="btn primary mini" data-act="wkFinish" data-id="${id}" ${ready ? '' : 'disabled'}>סיימתי</button>
          <button class="btn mini" data-act="wkCancel" data-id="${id}">ביטול</button></span></div>`;
    }
    // idle: decide whether starting is allowed right now
    let block = null, until = 0;
    if (timer) block = 'אימון אחר מתבצע כעת';
    else if (other.done && other.endedAt) {
      const t = other.endedAt + s.settings.gapHours * 3600000;
      if (t > now) { until = t; block = `אפשר להתחיל בעוד <span data-until="${t}">${mmss(t - now)}</span> (מרווח ${s.settings.gapHours} שעות)`; }
    }
    const dis = locked || block;
    return `<div class="task wk"><span class="txt"><b>${title}</b><small>${chip}${app.esc(planned)}${ef.source === 'suggested' ? ' <span class="sg">הצעה</span>' : ''}</small>
      ${ef.source === 'suggested' && ef.reason ? `<small class="note">${app.esc(ef.reason)}</small>` : ''}
      ${ef.cat === 'sport' ? '<small class="note">אפשר להמשיך ל-90+ דק׳ — ספורט ארוך נחשב אימון 2</small>' : ''}
      ${block && !locked ? `<small class="note">${block}</small>` : ''}
      <span class="btns wkbtns">
        <button class="btn primary mini" data-act="wkStart" data-id="${id}" data-out="1" ${dis ? 'disabled' : ''}>התחל בחוץ</button>
        <button class="btn mini" data-act="wkStart" data-id="${id}" data-out="0" ${dis ? 'disabled' : ''}>התחל בפנים</button>
        <button class="btn mini" data-act="wkManual" data-id="${id}" ${locked ? 'disabled' : ''}>סימון ידני</button>
        <button class="btn mini" data-act="wkSwap" data-id="${id}" ${dis ? 'disabled' : ''}>החלף אימון</button></span>
      </span></div>`;
  }

  // ===== main render =====
  function render(app, st) {
    if (st.phase === 'unset' || st.phase === 'ready') return startScreen(app, st);
    if (st.phase === 'complete') return completeScreen(app);

    const s = app.state, now = app.now(), key = viewKey(app, st);
    const day = s.days[key] || D.newDay();
    const locked = !D.canEdit(s, key, now);
    const p = D.progress(s, key), n = D.dayNumber(s, key);
    const off = C * (1 - p.pct / 100);

    const fixBanner = app.fix && s.pending ? `<div class="banner warn">
        <b>מתקנים את יום ${n} (${app.esc(fmtDate(key))})</b>
        <span>חסר: ${s.pending.missing.map((i) => app.esc(labelOf(app, i))).join(' · ')}</span>
        <div class="btns"><button class="btn primary" data-act="fixDone">בדוק שוב וסגור את היום</button>
        <button class="btn danger" data-act="fixGiveUp">ויתור — התחל מחדש</button></div></div>` : '';

    const closedBanner = st.closedToday && !app.fix
      ? `<div class="banner ok"><b>יום ${n} הושלם. כל הכבוד.</b><span>היום הבא מתחיל ב-${String(s.settings.cutoffHour).padStart(2, '0')}:00.</span></div>` : '';

    const due = !locked && !app.fix ? Reminders.due(s, day, now) : null;
    const last = s.lastBackupAt;
    const needBackup = !locked && !app.fix && ((!last && st.doneDays >= 3) || (last && now - last > 7 * 86400000));
    const nudge = due
      ? `<div class="banner warn"><b>הגיע הזמן: ${app.esc(due.label)}</b>${due.id === 'lunch' || due.id === 'dinner' ? '<div class="btns"><button class="btn mini" data-act="gotoMeals">לרשימת הארוחות</button></div>' : ''}</div>`
      : needBackup
        ? '<div class="banner"><b>הגיע זמן לגבות את הנתונים</b><span>הנתונים והתמונות נמצאים רק במכשיר הזה.</span><div class="btns"><button class="btn mini" data-act="goBackup">לגיבוי</button></div></div>'
        : '';

    // weekly quota: one line + up to 2 soft hints (the full card lives in the Workouts tab)
    const prog = Training.weekProgress(s, key);
    const weekLine = `<div class="wk-week"><span>השבוע: <b>${prog.total.done}${prog.partial ? '' : '/' + Training.TOTAL}</b> אימונים${prog.partial ? ' (שבוע חלקי)' : ''}</span>
      <button class="btn mini" data-act="gotoWorkouts">יעד שבועי</button></div>`;
    const hintsHtml = locked || app.fix ? '' : Training.hints(s, key).slice(0, 2).map((h) => `<p class="hint-soft">${app.esc(h.text)}</p>`).join('');

    const meals = ['meal1', 'meal2', 'meal3'].map((id) => taskHtml(app, id, LABEL[id],
      (day.tasks[id] && day.meals && day.meals[id]) || MEAL_SUB[id], key, locked)).join('');

    return `
      <div class="hero">
        <div class="ring${p.pct === 100 ? ' done' : ''}">
          <svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="${R}" fill="none" stroke-width="10"/>
          <circle class="fg" cx="50" cy="50" r="${R}" fill="none" stroke-width="10" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg>
          <div class="pct">${p.pct}%</div></div>
        <div><h1>יום ${n} <small>מתוך ${D.TOTAL_DAYS}</small></h1>
          <p>${app.esc(fmtDate(key))}<br>${p.done} מתוך ${p.total} משימות · עוד ${Math.max(0, D.TOTAL_DAYS - n)} ימים</p></div>
      </div>
      <div class="streak-bar">
        <div class="chip"><b>${st.doneDays}</b><span>ימים שהושלמו</span></div>
        <div class="chip"><b>${s.best}</b><span>רצף שיא</span></div>
        <div class="chip"><b>${st.attempt}</b><span>ניסיון</span></div>
      </div>
      ${fixBanner}${closedBanner}${nudge}
      <section class="group"><h2>אוכל</h2>${meals}</section>
      <section class="group"><h2>אימונים</h2>${weekLine}${workoutHtml(app, 'w1', key, day, locked)}${workoutHtml(app, 'w2', key, day, locked)}${hintsHtml}</section>
      <section class="group"><h2>מים, קריאה ותמונה</h2>${waterHtml(app, day, locked)}${readHtml(app, day, locked)}${photoHtml(app, day, key, locked)}</section>
      ${rulesCard(app)}
      ${app.fix || st.closedToday ? '' : '<button class="btn primary big" data-act="endDay">סיים את היום</button><p class="hint">לפני השינה. אם משהו חסר — תקבלו אזהרה לפני כל איפוס.</p>'}`;
  }

  // ===== after-render: load photo thumbnails =====
  function after() {
    document.querySelectorAll('[data-photo-key]').forEach((img) => {
      Photos.url(img.dataset.photoKey).then((u) => { if (u) img.src = u; }).catch(() => {});
    });
  }

  // ===== 1s tick: timers and gap countdowns without a full re-render =====
  function tick(app) {
    const s = app.state, now = app.now();
    document.querySelectorAll('[data-timer]').forEach((el) => {
      if (!s.timer) return;
      const el_ms = now - s.timer.startedAt;
      el.textContent = mmss(el_ms);
      const bar = document.querySelector('[data-timer-bar]');
      if (bar) bar.style.width = Math.min(el_ms / (45 * MIN) * 100, 100) + '%';
      const fin = document.querySelector('[data-act="wkFinish"]');
      if (fin && fin.disabled && el_ms >= 45 * MIN) fin.disabled = false;
    });
    document.querySelectorAll('[data-until]').forEach((el) => {
      const left = Number(el.dataset.until) - now;
      if (left <= 0) app.render(); else el.textContent = mmss(left);
    });
  }

  // ===== dialogs =====
  function openPending(app) {
    const p = app.state.pending, n = D.dayNumber(app.state, p.dayKey);
    app.modal(`<h2>יום ${n} לא הושלם</h2>
      <p>${app.esc(fmtDate(p.dayKey))} נסגר ולא הושלם. לפי הכללים, זה מחזיר אתכם ליום 1.</p>
      <p><b>חסר:</b></p>${listHtml(app, p.missing)}
      <p class="hint-l">סימנתם משהו בטעות? אפשר לתקן את אותו יום לפני שמאשרים.</p>
      <div class="btns col"><button class="btn primary" data-act="pendingFix">תקן את אותו יום</button>
      <button class="btn danger" data-act="pendingReset">אישור — התחל מחדש מיום 1</button></div>`, 'pending');
  }

  function doReset(app) {
    const r = D.confirmReset(app.state, app.now());
    app.fix = false; app.commit(); app.closeModal(); app.render();
    if (r.ok) app.toast(`ניסיון ${r.attempt}: יום 1 ב-${fmtDate(r.startDate)}`, 4500);
  }

  // ===== handlers =====
  function wire(app) {
    const s = () => app.state, now = () => app.now();
    const key = () => viewKey(app, app.status());
    const done = (ok) => { if (ok) app.commit(); app.render(); return ok; };

    app.act('saveStart', () => {
      const v = document.getElementById('startDate').value;
      const st = app.status();
      const r = st.phase === 'unset' ? D.startRun(s(), v, now()) : D.changeStartDate(s(), v, now());
      if (!r.ok) { app.toast(r.error === 'past' ? 'אי אפשר לבחור תאריך שעבר' : 'תאריך לא תקין'); return; }
      app.commit(); app.render();
      app.toast(`יום 1: ${fmtDate(v)}`);
    });

    app.act('gotoMeals', () => app.go('meals'));
    app.act('gotoWorkouts', () => app.go('workouts'));

    app.act('toggleTask', (el) => {
      const cur = !!(s().days[key()] && s().days[key()].tasks[el.dataset.id]);
      done(D.setTask(s(), key(), now(), el.dataset.id, !cur));
    });
    app.act('water', (el) => done(D.addWater(s(), key(), now(), Number(el.dataset.ml))));
    // any amount, in whole ml (1-5000); only the button adds, so nothing is added by accident
    app.act('waterCustom', () => {
      const raw = String(document.getElementById('waterCustom').value).trim();
      const ml = /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
      if (ml < 1 || ml > 5000) { app.toast('הזינו כמות במ״ל בין 1 ל-5000'); return; }
      done(D.addWater(s(), key(), now(), ml));
    });

    // reading: just a checkmark
    app.act('toggleRead', () => {
      const cur = !!(s().days[key()] && s().days[key()].read);
      done(D.setRead(s(), key(), now(), !cur));
    });

    // photo
    app.act('photoPicked', async (el) => {
      const file = el.files && el.files[0], k = key();
      el.value = '';
      if (!file || !D.canEdit(s(), k, now())) return;
      try {
        await Photos.savePhoto(k, file);
        Photos.dropUrl(k);
        D.setPhoto(s(), k, now(), true);
        app.commit(); app.render();
      } catch (e) { app.toast('שמירת התמונה נכשלה. נסו שוב.', 4000); }
    });
    app.act('delPhoto', () => app.confirm({
      title: 'למחוק את התמונה של היום?', body: 'התמונה תימחק מהמכשיר, והמשימה תסומן כלא בוצעה.',
      ok: 'מחיקה', danger: true,
      onOk: () => { const k = key(); Photos.remove(k).catch(() => {}); Photos.dropUrl(k); done(D.setPhoto(s(), k, now(), false)); }
    }));

    // workouts
    app.act('wkStart', (el) => {
      const k = key(), st = s();
      if (st.timer) return;
      const id = el.dataset.id, other = (D.ensureDay(st, k))[id === 'w1' ? 'w2' : 'w1'];
      if (other.done && other.endedAt && other.endedAt + st.settings.gapHours * 3600000 > now()) return;
      if (!D.canEdit(st, k, now())) return;
      const ef = Training.effective(st, k, id);                   // pin the category/session this workout counts as
      st.timer = { id, dayKey: k, startedAt: now(), outdoor: el.dataset.out === '1', cat: ef.cat, plan: ef.text };
      done(true);
    });
    app.act('wkCancel', () => app.confirm({
      title: 'לבטל את האימון?', body: 'הזמן שעבר לא יישמר.', ok: 'ביטול האימון', cancel: 'המשך', danger: true,
      onOk: () => { s().timer = null; done(true); }
    }));
    app.act('wkFinish', () => {
      const t = s().timer; if (!t) return;
      const t1 = now(), min = Math.floor((t1 - t.startedAt) / MIN);
      if (min < 45) return;
      const ok = D.setWorkout(s(), t.dayKey, t1, t.id, Object.assign({ done: true, outdoor: t.outdoor, startedAt: t.startedAt, endedAt: t1, min, plan: t.plan }, t.cat ? { cat: t.cat } : {}));
      s().timer = null;
      if (!ok) app.toast('היום כבר נסגר — האימון לא נשמר', 4000);
      done(true);
    });
    app.act('wkReset', (el) => done(D.setWorkout(s(), key(), now(), el.dataset.id,
      { done: false, outdoor: false, startedAt: null, endedAt: null, min: undefined })));
    app.act('wkManual', (el) => {
      const id = el.dataset.id, ef = Training.effective(s(), key(), id);
      app.modal(`<h2>סימון ידני — אימון ${id === 'w1' ? '1' : '2'}</h2>
        <p class="hint-l">${catChip(ef.cat)}${app.esc(ef.text)}</p>
        <label class="field"><span>משך בדקות</span>
          <input type="number" id="mnMin" inputmode="numeric" min="1" max="300" value="45" autofocus></label>
        <label class="check"><input type="checkbox" id="mnOut" ${id === 'w1' ? 'checked' : ''}> האימון היה בחוץ (לגמרי)</label>
        <p class="hint-l">פחות מ-45 דקות לא עומד בכללים — היום ייחשב חסר.</p>
        <div class="btns"><button class="btn" data-act="closeModal">ביטול</button>
        <button class="btn primary" data-act="mnSave" data-id="${id}">שמירה</button></div>`);
    });
    app.act('mnSave', (el) => {
      const min = parseInt(document.getElementById('mnMin').value, 10) || 0;
      if (min < 1) { app.toast('הזינו משך בדקות'); return; }
      const ef = Training.effective(s(), key(), el.dataset.id);
      const ok = D.setWorkout(s(), key(), now(), el.dataset.id, Object.assign({ done: true, outdoor: document.getElementById('mnOut').checked, min, plan: ef.text }, ef.cat ? { cat: ef.cat } : {}));
      app.closeModal(); done(ok);
    });

    // choose what a slot is today: step 1 = quota category, step 2 = a session of it (or your own text)
    const slotName = (id) => (id === 'w1' ? 'אימון 1' : 'אימון 2');
    const openCats = (id) => {
      const ef = Training.effective(s(), key(), id), prog = Training.weekProgress(s(), key());
      const sug = Training.suggest(s(), key(), id, 2).map((x) => x.cat);
      const rec = (s().days[key()] || {})[id] || {};
      app.modal(`<h2>${slotName(id)}: מה עושים?</h2>
        <p class="hint-l">${prog.partial ? 'שבוע חלקי — המספרים הם מה שכבר בוצע.' : 'בסוגריים: כמה בוצעו מתוך המכסה השבועית.'}</p>
        <div class="opts">${prog.cats.map((c) => `<button class="opt-btn${c.id === ef.cat ? ' on' : ''}" data-act="wkCat" data-id="${id}" data-cat="${c.id}">
          <b>${app.esc(c.name)}</b> <span class="meta">(${c.done}${prog.partial ? '' : '/' + c.target})</span>${sug.includes(c.id) ? ' <span class="sg">הצעה</span>' : ''}</button>`).join('')}</div>
        <div class="btns col">${rec.cat || rec.plan ? `<button class="btn" data-act="wkClear" data-id="${id}">חזרה להצעה</button>` : ''}
          <button class="btn" data-act="closeModal">ביטול</button></div>`);
    };
    app.act('wkSwap', (el) => openCats(el.dataset.id));
    app.act('wkCat', (el) => {
      const id = el.dataset.id, cat = el.dataset.cat, ef = Training.effective(s(), key(), id);
      app.modal(`<h2>${app.esc(Training.BY.get(cat).name)}</h2>
        <div class="opts">${Training.sessionsFor(cat).map((t, i) => `<button class="opt-btn${t === ef.text ? ' on' : ''}" data-act="wkPick" data-id="${id}" data-cat="${cat}" data-i="${i}">${app.esc(t)}</button>`).join('')}</div>
        <label class="field"><span>או כתבו אימון משלכם (נספר ב${app.esc(Training.BY.get(cat).short)})</span>
          <input type="text" id="wkCustom" maxlength="120" placeholder="למשל: שחייה, אופניים..."></label>
        <div class="btns col"><button class="btn primary" data-act="wkCustomSave" data-id="${id}" data-cat="${cat}">שמירת אימון משלי</button>
          <button class="btn" data-act="wkSwap" data-id="${id}">חזרה לקטגוריות</button></div>`);
    });
    const choose = (id, cat, plan) => { app.closeModal(); done(D.setWorkoutChoice(s(), key(), now(), id, { cat, plan })); };
    app.act('wkPick', (el) => choose(el.dataset.id, el.dataset.cat, Training.sessionsFor(el.dataset.cat)[Number(el.dataset.i)]));
    app.act('wkCustomSave', (el) => {
      const t = document.getElementById('wkCustom').value.trim();
      if (!t) { app.toast('כתבו שם לאימון'); return; }
      choose(el.dataset.id, el.dataset.cat, t);
    });
    app.act('wkClear', (el) => choose(el.dataset.id, '', ''));

    // end of day + failed-day flows
    app.act('endDay', () => {
      const r = D.endDay(s(), now());
      if (r.error === 'missing') {
        app.modal(`<h2>עדיין חסר משהו</h2>
          <p>לא ניתן לסגור את היום כשחסר:</p>${listHtml(app, r.missing)}
          <p class="hint-l">אם תאשרו בכל זאת, האתגר יחזור ליום 1.</p>
          <div class="btns col"><button class="btn primary" data-act="closeModal">חזרה לתיקון</button>
          <button class="btn danger" data-act="endAnyway">אישור — סגור והתחל מחדש</button></div>`, 'missing');
        return;
      }
      if (r.ok) {
        app.commit(); app.render();
        app.toast(r.completed ? '75 ימים. סיימתם.' : `יום ${r.dayNumber} הושלם. לילה טוב.`, 4000);
      }
    });
    app.act('endAnyway', () => {
      D.endDay(s(), now(), { confirmFail: true });
      app.closeModal(); app.commit(); app.render();
      app.toast('האתגר התחיל מחדש', 4000);
    });
    app.act('pendingFix', () => { app.fix = true; app.closeModal(); app.render(); window.scrollTo(0, 0); });
    app.act('pendingReset', () => doReset(app));
    app.act('fixGiveUp', () => app.confirm({
      title: 'להתחיל מחדש מיום 1?', body: 'היום לא הושלם. אישור יאפס את הספירה.', ok: 'אישור — התחל מחדש', danger: true,
      onOk: () => doReset(app)
    }));
    app.act('fixDone', () => {
      const r = D.reevaluatePending(s(), now());
      if (r.resolved) { app.fix = false; app.commit(); app.render(); app.toast('היום נסגר בהצלחה'); }
      else { app.commit(); app.render(); app.toast('עדיין חסר: ' + r.missing.map((i) => labelOf(app, i)).join(' · '), 5000); }
    });
  }

  root.Views = root.Views || {};
  root.Views.today = { render, after, tick, openPending, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
