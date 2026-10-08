// Workouts guide: today's plan, the 7-day calendar, the three 45-minute
// routines and the exercise library with step-by-step instructions.
(function (root) {
  'use strict';

  function render(app, st) {
    const { esc } = app;
    const todayKey = st.today;
    const [y, m, d] = todayKey.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    const plan = Schedule.plan(todayKey);

    const week = Schedule.DAYS.map((p, i) => `<div class="wkrow${i === wd ? ' today' : ''}">
        <b>${esc(p.name)}${i === wd ? ' · היום' : ''}</b>
        <span>אימון 1 (בחוץ): ${esc(p.w1)}</span>
        <span>אימון 2: ${esc(p.w2)}</span></div>`).join('');

    const routines = Workouts.ROUTINES.map((r) => `<details class="card"><summary>${esc(r.name)} <small>${esc(r.total)}</small></summary>
      <p class="note-l">${esc(r.setup)}</p>
      <ol class="plain">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`).join('');

    const lib = Workouts.GROUPS.map((g) => `<h2 class="sub-h">${esc(g.name)}</h2>
      ${g.items.map((ex) => `<details class="card"><summary>${esc(ex.name)}</summary>
        <p class="note-l">${esc(ex.muscles)}</p>
        <ol class="plain">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>`).join('')}`).join('');

    return `<h1 class="page-h">אימונים</h1>
      <div class="card plan"><h2 class="sub-h">התוכנית להיום · יום ${esc(plan.name)}</h2>
        <p><b>אימון 1 · בחוץ · 45 דק׳</b><br>${esc(plan.w1)}</p>
        <p><b>אימון 2 · 45 דק׳${plan.sports ? ' (90+ אם ספורט)' : ''}</b><br>${esc(plan.w2)}</p>
        <p class="note-l">מתחילים ומתעדים את האימון במסך "היום".</p></div>
      <h2 class="sub-h">לוח שבועי</h2><div class="card">${week}</div>
      <h2 class="sub-h">שלושה אימוני 45 דקות מוכנים</h2>${routines}
      ${lib}`;
  }

  root.Views = root.Views || {};
  root.Views.workouts = { render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
