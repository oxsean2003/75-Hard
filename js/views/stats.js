// "סטטיסטיקות" section (inside the Progress tab): workouts and meals of the CURRENT attempt.
(function (root) {
  'use strict';

  const D = Day, S = Stats;
  const ui = { tab: 'workouts' };
  const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  function fmtShort(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const chip = (value, label) => `<div class="chip"><b>${value}</b><span>${label}</span></div>`;
  // a labelled horizontal bar; `cls` optionally colours it (a category id)
  const barRow = (esc, name, count, max, cls) => `<div class="st-row"><span class="st-name">${esc(name)}</span>
    <span class="st-bar"><i class="${cls ? 'bg-' + cls : ''}" style="width:${max ? Math.round((count / max) * 100) : 0}%"></i></span><span class="st-cnt">${count}</span></div>`;

  function workoutsHtml(app, st) {
    const { esc } = app;
    if (!app.state.run) return '<p class="note-l">עוד אין נתונים — מתחילים את האתגר.</p>';
    const w = S.workouts(app.state, st.today);
    if (!w.sessions) return '<p class="note-l">עוד לא בוצעו אימונים בניסיון הנוכחי. ברגע שתסיימו אחד, הנתונים יופיעו כאן.</p>';
    const pctOut = Math.round((w.outdoor / w.sessions) * 100);
    const maxCat = Math.max(1, ...w.cats.map((c) => c.count)), maxDay = Math.max(1, ...w.weekdays);

    const weeks = w.weeks.map((wk) => {
      const total = Math.max(Training.TOTAL, wk.cats.reduce((a, c) => a + c.done, 0) + wk.extra);
      const segs = wk.cats.filter((c) => c.done).map((c) => `<i class="bg-${c.id}" style="width:${(c.done / total) * 100}%"></i>`).join('');
      const label = wk.partial ? `${wk.done} · שבוע חלקי` : `${wk.done}/${Training.TOTAL}`;
      return `<div class="st-week"><div class="st-wk-h"><b>${esc(fmtShort(wk.start))} – ${esc(fmtShort(wk.end))}${wk.current ? ' · השבוע' : ''}</b><span>${label}</span></div>
        <div class="wkbar">${segs}</div></div>`;
    }).join('');

    return `<div class="streak-bar">${chip(w.sessions, 'אימונים')}${chip(hm(w.minutes), 'שעות:דקות')}${chip(w.avgMin || '—', 'דק׳ בממוצע')}${chip(pctOut + '%', 'בחוץ')}</div>
      <div class="card"><h3 class="st-h">לפי קטגוריה</h3>${w.cats.map((c) => barRow(esc, c.name, c.count, maxCat, c.id)).join('')}
        ${w.other ? `<p class="note-l">+ ${w.other} אימונים מחוץ לקטגוריות</p>` : ''}</div>
      <div class="card"><h3 class="st-h">באילו ימים מתאמנים</h3>
        <div class="st-wd">${w.weekdays.map((n, i) => `<div><span class="st-wdbar"><i style="height:${Math.round((n / maxDay) * 100)}%"></i></span><b>${n}</b><small>${DAY_LETTERS[i]}</small></div>`).join('')}</div></div>
      <div class="card"><h3 class="st-h">שבוע אחר שבוע</h3>${weeks}
        <p class="note-l">הצבעים הם הקטגוריות. שבוע מלא = ${Training.TOTAL} אימונים.</p></div>`;
  }

  function mealsHtml(app) {
    const { esc } = app;
    if (!app.state.run) return '<p class="note-l">עוד אין נתונים — מתחילים את האתגר.</p>';
    const m = S.meals(app.state);
    if (!m.days) return '<p class="note-l">עוד אין יום שהסתיים. הסטטיסטיקה תופיע אחרי היום הראשון.</p>';
    const maxSlot = Math.max(1, m.days);
    const maxProt = Math.max(1, ...m.protein.map((p) => p.count));
    const proteinBlock = m.protein.length
      ? `<div class="card"><h3 class="st-h">מקורות חלבון (בונה הצלחת)</h3>${m.protein.map((p) => barRow(esc, p.name, p.count, maxProt)).join('')}</div>` : '';
    const topBlock = m.topByPart.length
      ? `<div class="card"><h3 class="st-h">הכי הרבה</h3>${m.topByPart.map((p) => `<p class="st-top"><b>${esc(p.name)}:</b> ${p.items.map((i) => `${esc(i.name)} (${i.count})`).join(' · ')}</p>`).join('')}</div>` : '';
    const untracked = m.src.untracked ? ` · ללא פירוט ${m.src.untracked}` : '';
    return `<div class="streak-bar">${chip(`${m.logged}/${m.possible}`, 'ארוחות שנרשמו')}${chip(m.rate + '%', 'מתוך 3 ביום')}
        ${m.plate.total ? chip(`${m.plate.complete}/${m.plate.total}`, 'צלחות מלאות') : ''}</div>
      <div class="card"><h3 class="st-h">לפי ארוחה (${m.days} ימים)</h3>${m.slots.map((s) => barRow(esc, s.name, s.logged, maxSlot)).join('')}
        <p class="note-l">נרשמו דרך: בונה הצלחת ${m.src.plate} · הצעות מוכנות ${m.src.quick}${untracked}</p></div>
      ${proteinBlock}${topBlock}
      <p class="note-l">צלחת מלאה = חלבון + פחמימה + ירקות או שומן. פירוט המרכיבים נאסף מרגע העדכון; ארוחות קודמות נספרות כ"נרשמו" בלבד.</p>`;
  }

  function html(app, st) {
    const pills = [['workouts', 'אימונים'], ['meals', 'ארוחות']].map(([id, t]) =>
      `<button class="pill${ui.tab === id ? ' on' : ''}" data-act="statsTab" data-id="${id}">${t}</button>`).join('');
    return `<section class="group"><h2>סטטיסטיקות</h2><div class="pills">${pills}</div>
      ${ui.tab === 'meals' ? mealsHtml(app) : workoutsHtml(app, st)}</section>`;
  }

  function wire(app) {
    app.act('statsTab', (el) => { ui.tab = el.dataset.id; app.render(); });
  }

  root.Views = root.Views || {};
  root.Views.stats = { html, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
