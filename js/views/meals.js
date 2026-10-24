// Meals tab. Three views:
//   בנה ארוחה  — build a plate from parts (protein / carb / veg / fat / flavor), mark what's missing
//                at home (substitutes are suggested), then log exactly what you ate;
//   הצעות מוכנות — the original ready-made dishes (one tap to log);
//   בחוץ — how to order within the rules at a cafeteria / restaurant.
// Logging ticks the meal on today's checklist and remembers the text (Day.setMeal).
(function (root) {
  'use strict';

  const D = Day, M = Meals, P = Plate;
  const TABS = [['build', 'בנה ארוחה'], ['quick', 'הצעות מוכנות'], ['out', 'בחוץ']];
  // sel = chosen ingredient ids per meal (kept while you browse; cleared once logged)
  const ui = { tab: 'build', cat: M.CATEGORIES[0].id, slot: null, pantry: false, closed: {}, sel: { breakfast: [], lunch: [], dinner: [] } };

  function defaultSlot(now) {
    const h = new Date(now).getHours();
    return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
  }
  const currentSlot = (app) => M.SLOTS.find((s) => s.id === (ui.slot || defaultSlot(app.now())));

  function slotTabs(app, slot, day) {
    return `<div class="pills" role="tablist">${M.SLOTS.map((s) =>
      `<button class="pill${s.id === slot.id ? ' on' : ''}" data-act="mealSlot" data-id="${s.id}">${app.esc(s.name)}${day.tasks[s.task] ? ' ✓' : ''}</button>`).join('')}</div>`;
  }

  // plate formula + allowed / banned lists (shared by the build and quick views)
  function referenceHtml(app) {
    const { esc } = app;
    return `<details class="card"><summary>${esc(M.PLATE.title)}</summary>
        <p class="formula">${esc(M.PLATE.formula)}</p>
        <ul class="plain">${M.PLATE.parts.map(([a, b]) => `<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')}</ul>
        <p class="note-l">${esc(M.PLATE.fruit)}</p></details>
      <details class="card"><summary>מה מותר</summary><ul class="plain">${M.RULES.allowed.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>
      <details class="card"><summary>מה אסור</summary><ul class="plain ban">${M.RULES.banned.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  }

  // ===== build a plate =====
  function buildHtml(app, slot, day, loggedText, canLog) {
    const { esc } = app, st = app.state;
    const sel = (ui.sel[slot.id] = ui.sel[slot.id].filter((id) => !P.isMissing(st, id)));   // a missing item can't stay chosen
    const missingCount = st.pantryMissing.length;

    const pantryBar = ui.pantry
      ? `<div class="banner warn"><b>מצב סימון: לחצו על מה שחסר בבית</b><span>מה שמסומן יופיע מחוק, ובלחיצה עליו תקבלו תחליפים.</span>
          <div class="btns"><button class="btn primary mini" data-act="pantryMode">סיום</button>
          <button class="btn mini" data-act="pantryClear" ${missingCount ? '' : 'disabled'}>קניתי הכול</button></div></div>`
      : `<div class="pantry-bar"><button class="btn mini" data-act="pantryMode">אין לי משהו בבית</button>
          ${missingCount ? `<span class="note-l">חסרים בבית: ${missingCount}</span><button class="btn mini" data-act="pantryClear">קניתי הכול</button>` : '<span class="note-l">הכול זמין כרגע</span>'}</div>`;

    const parts = P.PARTS.map((part) => {
      const items = P.itemsFor(part.id, slot.id);
      const ordered = items.filter((i) => !P.isMissing(st, i.id)).concat(items.filter((i) => P.isMissing(st, i.id)));   // missing last
      const open = !ui.closed[part.id];
      const chosen = items.filter((i) => sel.includes(i.id)).length;
      return `<section class="pp"><button class="pp-h" data-act="partToggle" data-id="${part.id}" aria-expanded="${open}">
          <span>${esc(part.name)}${chosen ? ` <small>· ${chosen} נבחרו</small>` : ''}</span><span class="pp-chev">${open ? '▾' : '◂'}</span></button>
        ${open ? `<div class="chips">${ordered.map((i) => {
          const miss = P.isMissing(st, i.id), on = sel.includes(i.id);
          return `<button class="pc${on ? ' sel' : ''}${miss ? ' miss' : ''}" data-act="plateItem" data-id="${i.id}" aria-pressed="${on}">${esc(i.name)}</button>`;
        }).join('')}</div>` : ''}</section>`;
    }).join('');

    const c = P.completeness(sel);
    const mark = (ok, label) => `<span class="pb-part${ok ? ' ok' : ''}">${ok ? '✓' : '○'} ${label}</span>`;
    const bar = `<div class="plate-bar">
        <div class="pb-text">${sel.length ? esc(P.compose(sel)) : 'בחרו מרכיבים לארוחת ' + esc(slot.name)}</div>
        <div class="pb-parts">${mark(c.protein, 'חלבון')}${mark(c.carb, 'פחמימה')}${mark(c.veg, 'ירקות')}</div>
        <div class="btns"><button class="btn mini" data-act="plateClear" ${sel.length ? '' : 'disabled'}>ניקוי</button>
        ${canLog ? `<button class="btn primary mini" data-act="plateLog" ${sel.length ? '' : 'disabled'}>רשום כארוחת ${esc(slot.name)}</button>` : ''}</div>
      </div>`;

    return `${loggedText ? `<p class="logged">נרשם היום כארוחת ${esc(slot.name)}: ${esc(loggedText)}</p>` : ''}
      ${pantryBar}${parts}${bar}${referenceHtml(app)}`;
  }

  // ===== quick picks (the original ready-made dishes) =====
  function quickHtml(app, slot, loggedText, canLog) {
    const { esc } = app, cat = M.CATEGORIES.find((c) => c.id === ui.cat);
    const chips = M.CATEGORIES.map((c) => `<button class="pill${c.id === cat.id ? ' on' : ''}" data-act="mealCat" data-id="${c.id}">${esc(c.name)}</button>`).join('');
    const cards = cat[slot.id].map((text, i) => {
      const picked = loggedText === text;
      return `<div class="opt${picked ? ' picked' : ''}"><p>${esc(text)}</p>
        ${canLog
          ? `<button class="btn mini${picked ? '' : ' primary'}" data-act="pickMeal" data-cat="${cat.id}" data-i="${i}" ${picked ? 'disabled' : ''}>${picked ? 'נרשמה' : `רשום כארוחת ${esc(slot.name)}`}</button>`
          : ''}</div>`;
    }).join('');
    return `<div class="pills">${chips}</div>
      ${loggedText ? `<p class="logged">נרשם היום כארוחת ${esc(slot.name)}: ${esc(loggedText)}</p>` : ''}
      <div class="opts">${cards}</div>${referenceHtml(app)}`;
  }

  // ===== eating out =====
  function outHtml(app) {
    const { esc } = app, E = M.EATING_OUT, li = (a) => a.map((t) => `<li>${esc(t)}</li>`).join('');
    return `<p class="note-l">${esc(E.intro)}</p>
      <div class="card"><h2 class="sub-h">איך מרכיבים צלחת בחוץ</h2>
        <ul class="plain">${E.steps.map(([a, b]) => `<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')}</ul></div>
      <details class="card" open><summary>מה להגיד למלצר / לדלפק</summary><ul class="plain">${li(E.say)}</ul></details>
      <details class="card"><summary>במה להימנע</summary><ul class="plain ban">${li(E.avoid)}</ul></details>
      <details class="card"><summary>לפי סוג מקום</summary>${E.places.map(([a, b]) => `<p><b>${esc(a)}:</b> ${esc(b)}</p>`).join('')}</details>
      <details class="card"><summary>אין כלום מתאים? חירום</summary><ul class="plain">${li(E.emergency)}</ul></details>`;
  }

  function render(app, st) {
    const slot = currentSlot(app), key = st.today;
    const canLog = st.phase === 'active' && !app.fix && D.canEdit(app.state, key, app.now());
    const day = app.state.days[key] || D.newDay();
    const loggedText = day.meals && day.meals[slot.task];
    const subnav = `<div class="pills">${TABS.map(([id, t]) => `<button class="pill${ui.tab === id ? ' on' : ''}" data-act="mealTab" data-id="${id}">${t}</button>`).join('')}</div>`;
    const body = ui.tab === 'out' ? outHtml(app)
      : `${slotTabs(app, slot, day)}${ui.tab === 'quick' ? quickHtml(app, slot, loggedText, canLog) : buildHtml(app, slot, day, loggedText, canLog)}`;
    return `<h1 class="page-h">ארוחות</h1>${subnav}${body}`;
  }

  function wire(app) {
    app.act('mealTab', (el) => { ui.tab = el.dataset.id; ui.pantry = false; app.render(); });
    app.act('mealCat', (el) => { ui.cat = el.dataset.id; app.render(); });
    app.act('mealSlot', (el) => { ui.slot = el.dataset.id; app.render(); });

    app.act('pickMeal', (el) => {
      const slot = currentSlot(app), cat = M.CATEGORIES.find((c) => c.id === el.dataset.cat);
      const text = cat[slot.id][Number(el.dataset.i)];
      if (D.setMeal(app.state, app.status().today, app.now(), slot.task, text, { src: 'quick', cat: cat.id })) {
        app.commit(); app.render(); app.toast(`נרשם: ארוחת ${slot.name}`);
      }
    });

    // --- plate builder ---
    const toggleSel = (slot, id) => {
      const list = ui.sel[slot.id], i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
    };
    app.act('plateItem', (el) => {
      const id = el.dataset.id, slot = currentSlot(app), item = P.BY_ID.get(id);
      if (!item) return;
      if (ui.pantry) {                                   // marking mode: flip "missing at home"
        P.toggleMissing(app.state, id);
        ui.sel[slot.id] = ui.sel[slot.id].filter((x) => x !== id);
        app.commit(); app.render(); return;
      }
      if (P.isMissing(app.state, id)) {                  // not at home: offer substitutes
        const alts = P.swaps(app.state, id, slot.id);
        app.modal(`<h2>אין לך ${app.esc(item.name)}</h2>
          <p class="hint-l">במקום זה אפשר:</p>
          <div class="opts">${alts.map((a) => `<button class="opt-btn" data-act="plateSwapPick" data-id="${a.id}">${app.esc(a.name)}</button>`).join('')}</div>
          <div class="btns"><button class="btn" data-act="closeModal">סגירה</button></div>`);
        return;
      }
      toggleSel(slot, id); app.render();
    });
    app.act('plateSwapPick', (el) => {
      const slot = currentSlot(app);
      if (!ui.sel[slot.id].includes(el.dataset.id)) ui.sel[slot.id].push(el.dataset.id);
      app.closeModal(); app.render();
    });
    app.act('partToggle', (el) => { ui.closed[el.dataset.id] = !ui.closed[el.dataset.id]; app.render(); });
    app.act('pantryMode', () => { ui.pantry = !ui.pantry; app.render(); });
    app.act('pantryClear', () => { P.clearMissing(app.state); app.commit(); app.render(); app.toast('הכול זמין שוב'); });
    app.act('plateClear', () => { ui.sel[currentSlot(app).id] = []; app.render(); });
    app.act('plateLog', () => {
      const slot = currentSlot(app), text = P.compose(ui.sel[slot.id]);
      if (!text) return;
      if (D.setMeal(app.state, app.status().today, app.now(), slot.task, text, { src: 'plate', items: ui.sel[slot.id].slice() })) {
        ui.sel[slot.id] = [];
        app.commit(); app.render(); app.toast(`נרשם: ארוחת ${slot.name}`);
      }
    });
  }

  root.Views = root.Views || {};
  root.Views.meals = { render, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
