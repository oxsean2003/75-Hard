// Meals guide: pick a category + meal slot, tap an option to log it as that
// meal on today's checklist. Also the plate formula and allowed/banned lists.
(function (root) {
  'use strict';

  const D = Day, M = Meals;
  const ui = { cat: M.CATEGORIES[0].id, slot: null };

  function defaultSlot(now) {
    const h = new Date(now).getHours();
    return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
  }

  function render(app, st) {
    const { esc } = app;
    const slotId = ui.slot || defaultSlot(app.now());
    const slot = M.SLOTS.find((s) => s.id === slotId);
    const cat = M.CATEGORIES.find((c) => c.id === ui.cat);
    const key = st.today;
    const canLog = st.phase === 'active' && !app.fix && D.canEdit(app.state, key, app.now());
    const day = app.state.days[key] || D.newDay();
    const loggedText = day.meals && day.meals[slot.task];

    const chips = M.CATEGORIES.map((c) => `<button class="pill${c.id === cat.id ? ' on' : ''}" data-act="mealCat" data-id="${c.id}">${esc(c.name)}</button>`).join('');
    const tabs = M.SLOTS.map((s) => `<button class="pill${s.id === slot.id ? ' on' : ''}" data-act="mealSlot" data-id="${s.id}">${esc(s.name)}${day.tasks[s.task] ? ' ✓' : ''}</button>`).join('');

    const cards = cat[slot.id].map((text, i) => {
      const picked = loggedText === text;
      return `<div class="opt${picked ? ' picked' : ''}"><p>${esc(text)}</p>
        ${canLog
          ? `<button class="btn mini${picked ? '' : ' primary'}" data-act="pickMeal" data-cat="${cat.id}" data-i="${i}" ${picked ? 'disabled' : ''}>${picked ? 'נרשמה' : `רשום כארוחת ${esc(slot.name)}`}</button>`
          : ''}</div>`;
    }).join('');

    return `<h1 class="page-h">ארוחות</h1>
      <details class="card" open><summary>${esc(M.PLATE.title)}</summary>
        <p class="formula">${esc(M.PLATE.formula)}</p>
        <ul class="plain">${M.PLATE.parts.map(([a, b]) => `<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')}</ul>
        <p class="note-l">${esc(M.PLATE.fruit)}</p></details>
      <div class="pills" role="tablist">${tabs}</div>
      <div class="pills">${chips}</div>
      ${loggedText ? `<p class="logged">נרשם היום כארוחת ${esc(slot.name)}: ${esc(loggedText)}</p>` : ''}
      <div class="opts">${cards}</div>
      <details class="card"><summary>מה מותר</summary><ul class="plain">${M.RULES.allowed.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>
      <details class="card"><summary>מה אסור</summary><ul class="plain ban">${M.RULES.banned.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  }

  function wire(app) {
    app.act('mealCat', (el) => { ui.cat = el.dataset.id; app.render(); });
    app.act('mealSlot', (el) => { ui.slot = el.dataset.id; app.render(); });
    app.act('pickMeal', (el) => {
      const slot = M.SLOTS.find((s) => s.id === (ui.slot || defaultSlot(app.now())));
      const cat = M.CATEGORIES.find((c) => c.id === el.dataset.cat);
      const text = cat[slot.id][Number(el.dataset.i)];
      if (D.setMeal(app.state, app.status().today, app.now(), slot.task, text)) {
        app.commit(); app.render(); app.toast(`נרשם: ארוחת ${slot.name}`);
      }
    });
  }

  root.Views = root.Views || {};
  root.Views.meals = { render, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
