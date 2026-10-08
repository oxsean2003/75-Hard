// Progress tab: photos (grid, compare, slideshow), weekly measurements with charts,
// reading log, milestones and the history of attempts. Also the milestone dialog.
(function (root) {
  'use strict';

  const D = Day;
  const ui = { all: false, a: null, b: null };

  const MILESTONE_TEXT = {
    7: ['שבוע שלם', 'שבעה ימים בלי לפספס. ההרגל מתחיל להיבנות.'],
    25: ['25 ימים', 'שליש מהאתגר מאחוריכם. עכשיו זה כבר חלק מהזהות שלכם.'],
    50: ['50 ימים', 'שני שלישים מאחוריכם. נשארו עוד 25 ימים בלבד.'],
    75: ['75 ימים. סיימתם.', 'עשיתם את זה: 75 ימים מלאים, בלי לדלג על שום דבר.']
  };

  function fmtShort(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  function labelFor(app, key) {
    const run = app.state.run;
    if (run && D.diffDays(run.startDate, key) >= 0) return `יום ${D.dayNumber(app.state, key)} · ${fmtShort(key)}`;
    return fmtShort(key);
  }

  // ---- SVG line chart (kept LTR: oldest on the left, numbers read naturally) ----
  function chart(points, color, unit) {
    if (points.length < 2) return '';
    const W = 300, H = 110, P = 14;
    const vals = points.map((p) => p.v), min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
    const y = (v) => H - P - ((v - min) / span) * (H - 2 * P);
    const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="גרף">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <text x="${P}" y="11" class="ct">${max}${unit}</text><text x="${P}" y="${H - 2}" class="ct">${min}${unit}</text>
      <text x="${W - P}" y="${H - 2}" class="ct" text-anchor="end">${fmtShort(points[points.length - 1].d)}</text>
      <text x="${P + 34}" y="${H - 2}" class="ct">${fmtShort(points[0].d)}</text></svg>`;
  }

  function measureHtml(app, st) {
    const { esc } = app, ms = app.state.measurements;
    const last = ms.length ? ms[ms.length - 1].date : null;
    const stale = st.phase === 'active' && (!last || D.diffDays(last, st.today) >= 7);
    const wPts = ms.filter((m) => m.weight != null).map((m) => ({ d: m.date, v: m.weight }));
    const cPts = ms.filter((m) => m.waist != null).map((m) => ({ d: m.date, v: m.waist }));
    return `<section class="group"><h2>מדידות שבועיות</h2>
      ${stale ? '<div class="banner warn"><b>הגיע זמן למדידה שבועית</b><span>משקל והיקף מותן, באותו תנאים כל פעם (בבוקר, לפני אוכל).</span></div>' : ''}
      <div class="card">
        <div class="two"><label class="field"><span>משקל (ק״ג)</span><input type="number" id="msWeight" inputmode="decimal" step="0.1" min="20" max="400"></label>
        <label class="field"><span>היקף מותן (ס״מ)</span><input type="number" id="msWaist" inputmode="decimal" step="0.1" min="30" max="300"></label></div>
        <label class="field"><span>תאריך</span><input type="date" id="msDate" value="${st.today}"></label>
        <button class="btn primary" data-act="saveMeasure">שמירת מדידה</button></div>
      ${wPts.length ? `<div class="card"><b>משקל</b>${chart(wPts, 'var(--accent)', '')}${wPts.length < 2 ? '<p class="note-l">מדידה שנייה תציג גרף.</p>' : ''}</div>` : ''}
      ${cPts.length ? `<div class="card"><b>היקף מותן</b>${chart(cPts, '#4aa8ff', '')}${cPts.length < 2 ? '<p class="note-l">מדידה שנייה תציג גרף.</p>' : ''}</div>` : ''}
      ${ms.length ? `<div class="card"><table class="tbl"><tr><th>תאריך</th><th>משקל</th><th>מותן</th><th></th></tr>
        ${ms.slice().reverse().slice(0, 12).map((m) => `<tr><td>${esc(fmtShort(m.date))}</td><td>${m.weight != null ? m.weight : '—'}</td><td>${m.waist != null ? m.waist : '—'}</td>
        <td><button class="btn mini" data-act="delMeasure" data-date="${m.date}" aria-label="מחיקה">✕</button></td></tr>`).join('')}</table></div>` : ''}
    </section>`;
  }

  function readingHtml(app) {
    const { esc } = app, s = app.state;
    const days = Object.keys(s.days).filter((k) => s.days[k].pages > 0).sort().reverse();
    const total = days.reduce((a, k) => a + s.days[k].pages, 0);
    if (!days.length) return '';
    return `<section class="group"><h2>יומן קריאה · ${total} עמודים</h2>
      ${days.slice(0, 20).map((k) => { const d = s.days[k]; return `<div class="card rd"><b>${esc(fmtShort(k))} · ${d.pages} עמ׳</b>
        ${d.book ? `<span>${esc(d.book)}</span>` : ''}${d.takeaway ? `<p>${esc(d.takeaway)}</p>` : ''}</div>`; }).join('')}</section>`;
  }

  function historyHtml(app, st) {
    const { esc } = app, h = app.state.history;
    if (!h.length) return '';
    return `<section class="group"><h2>ניסיונות קודמים</h2>${h.slice().reverse().map((e) => `<div class="card rd">
      <b>ניסיון ${e.attempt}: הגעתם ליום ${e.dayNumber}</b><span>נפל ב-${esc(fmtShort(e.failedDay))} · חסרו ${e.missing.length} פריטים</span></div>`).join('')}</section>`;
  }

  function milestonesHtml(app) {
    const s = app.state;
    const done = D.MILESTONES.map((n) => {
      if (!s.run) return [n, false];
      const d = s.days[D.addDays(s.run.startDate, n - 1)];
      return [n, !!(d && d.closed && d.closed.ok)];
    });
    return `<div class="streak-bar">${done.map(([n, ok]) => `<div class="chip${ok ? ' earned' : ''}"><b>${n}</b><span>${ok ? 'הושג' : 'ימים'}</span></div>`).join('')}</div>`;
  }

  function render(app, st) {
    const s = app.state;
    return `<h1 class="page-h">התקדמות</h1>
      <div class="streak-bar">
        <div class="chip"><b>${st.doneDays}</b><span>ימים שהושלמו</span></div>
        <div class="chip"><b>${s.best}</b><span>רצף שיא</span></div>
        <div class="chip"><b>${st.attempt || '—'}</b><span>ניסיון</span></div></div>
      ${milestonesHtml(app)}
      <section class="group"><h2>תמונות</h2><div id="photoArea"><p class="note-l">טוען…</p></div></section>
      ${measureHtml(app, st)}${readingHtml(app)}${historyHtml(app, st)}`;
  }

  // ---- photos (async: IndexedDB) ----
  async function drawPhotos(app) {
    const host = document.getElementById('photoArea');
    if (!host) return;
    let keys;
    try { keys = (await Photos.keys()).sort(); } catch (e) { host.innerHTML = '<p class="note-l">אי אפשר לקרוא את התמונות במכשיר הזה.</p>'; return; }
    const run = app.state.run;
    const list = keys.filter((k) => ui.all || (run && D.diffDays(run.startDate, k) >= 0));
    if (!document.getElementById('photoArea')) return;
    if (!list.length) {
      host.innerHTML = `<p class="note-l">עוד אין תמונות${ui.all ? '' : ' בניסיון הנוכחי'}. מצלמים אחת בכל יום במסך "היום".</p>${keys.length && !ui.all ? '<button class="pill" data-act="photoAll">הצג תמונות מניסיונות קודמים</button>' : ''}`;
      return;
    }
    if (!list.includes(ui.a)) ui.a = list[0];
    if (!list.includes(ui.b)) ui.b = list[list.length - 1];
    const opt = (sel) => list.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${app.esc(labelFor(app, k))}</option>`).join('');
    host.innerHTML = `
      ${list.length > 1 ? `<div class="card"><b>השוואה</b>
        <div class="cmp"><div><select data-change="cmpA" aria-label="תמונה ראשונה">${opt(ui.a)}</select><img class="cmpimg" data-url-key="${ui.a}" alt=""></div>
        <div><select data-change="cmpB" aria-label="תמונה שנייה">${opt(ui.b)}</select><img class="cmpimg" data-url-key="${ui.b}" alt=""></div></div>
        <button class="btn" data-act="slideshow">הפעלת סרטון התקדמות</button></div>` : ''}
      <div class="grid">${list.map((k) => `<button class="gph" data-act="viewPhoto" data-key="${k}"><img data-url-key="${k}" alt="${app.esc(labelFor(app, k))}"><span>${app.esc(labelFor(app, k))}</span></button>`).join('')}</div>
      ${keys.length > list.length || ui.all ? `<button class="pill" data-act="photoAll">${ui.all ? 'רק הניסיון הנוכחי' : 'הצג תמונות מניסיונות קודמים'}</button>` : ''}`;
    host.querySelectorAll('[data-url-key]').forEach((img) => {
      Photos.url(img.dataset.urlKey).then((u) => { if (u) img.src = u; }).catch(() => {});
    });
  }

  function after(app) { drawPhotos(app); }

  function openMilestone(app, m) {
    const t = MILESTONE_TEXT[m.n];
    app.modal(`<div class="center"><h1 class="big-h">${t[0]}</h1><p>${t[1]}</p>
      <div class="btns"><button class="btn primary" data-act="milestoneOk" data-id="${m.id}">המשך</button></div></div>`, 'milestone');
  }

  function wire(app) {
    app.act('milestoneOk', (el) => { D.markCelebrated(app.state, el.dataset.id); app.commit(); app.closeModal(); });
    app.act('photoAll', () => { ui.all = !ui.all; drawPhotos(app); });
    app.act('cmpA', (el) => { ui.a = el.value; drawPhotos(app); });
    app.act('cmpB', (el) => { ui.b = el.value; drawPhotos(app); });
    app.act('viewPhoto', async (el) => {
      const k = el.dataset.key, u = await Photos.url(k);
      if (u) app.modal(`<h2>${app.esc(labelFor(app, k))}</h2><img class="full" src="${u}" alt=""><div class="btns"><button class="btn" data-act="closeModal">סגירה</button></div>`);
    });
    app.act('slideshow', async () => {
      const run = app.state.run;
      const keys = (await Photos.keys()).sort().filter((k) => ui.all || (run && D.diffDays(run.startDate, k) >= 0));
      if (keys.length < 2) return;
      const urls = (await Promise.all(keys.map((k) => Photos.url(k)))).filter(Boolean);
      app.modal(`<h2 id="ssLabel"></h2><img class="full" id="ssImg" alt=""><div class="btns"><button class="btn" data-act="closeModal">סגירה</button></div>`, 'slideshow');
      let i = 0;
      const step = () => {
        if (app.modalKind !== 'slideshow') { clearInterval(timer); return; }
        document.getElementById('ssImg').src = urls[i];
        document.getElementById('ssLabel').textContent = labelFor(app, keys[i]);
        i = (i + 1) % urls.length;
      };
      const timer = setInterval(step, 450);
      step();
    });

    app.act('saveMeasure', () => {
      const ok = D.addMeasurement(app.state, document.getElementById('msDate').value,
        document.getElementById('msWeight').value, document.getElementById('msWaist').value);
      if (!ok) { app.toast('הזינו משקל או היקף מותן תקינים'); return; }
      app.commit(); app.render(); app.toast('המדידה נשמרה');
    });
    app.act('delMeasure', (el) => app.confirm({
      title: 'למחוק את המדידה?', body: app.esc(fmtShort(el.dataset.date)), ok: 'מחיקה', danger: true,
      onOk: () => { D.removeMeasurement(app.state, el.dataset.date); app.commit(); app.render(); }
    }));
  }

  root.Views = root.Views || {};
  root.Views.progress = { render, after, wire, openMilestone };
})(typeof globalThis !== 'undefined' ? globalThis : this);
