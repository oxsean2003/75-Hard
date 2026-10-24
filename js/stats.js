// Statistics for the CURRENT attempt (pure, tested; state + today's key are passed in).
//  - workouts: totals, minutes, outdoor vs indoor, per category, per weekday, and a list of weeks.
//  - meals: how many of the 3 daily meals were logged (closed days only), how they were logged,
//    the plate-formula rate, protein sources and the most used ingredients.
// Meal detail comes from `day.mealInfo` (recorded since the stats update); older meals count as
// "logged" only, except ready-made dishes whose text still matches the original list.
(function (root) {
  'use strict';

  // Day / Training / Plate are always loaded before this file; Meals is not (data/meals.he.js comes later in
  // index.html), so it is looked up when needed instead of captured here.
  const D = root.Day, T = root.Training, P = root.Plate;

  const FAMILIES = {
    egg: 'ביצים', dairy: 'מוצרי חלב', cheese: 'גבינות', fish: 'דגים', poultry: 'עוף והודו',
    redmeat: 'בקר', legume: 'קטניות', plant: 'טופו / סייטן', leftover: 'שאריות'
  };
  const MEAL_TASKS = [['meal1', 'בוקר'], ['meal2', 'צהריים'], ['meal3', 'ערב']];

  // days of the current run, oldest first
  function runDays(state) {
    if (!state.run) return [];
    return Object.keys(state.days).filter((k) => D.diffDays(state.run.startDate, k) >= 0).sort();
  }

  // ---------- workouts ----------
  function workouts(state, todayKey) {
    const cats = T.CATS.map((c) => ({ id: c.id, name: c.name, short: c.short, count: 0, minutes: 0 }));
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    let sessions = 0, minutes = 0, timed = 0, outdoor = 0, longest = 0, other = 0;

    runDays(state).forEach((k) => ['w1', 'w2'].forEach((id) => {
      const w = state.days[k][id];
      if (!w || !w.done) return;
      sessions++;
      const row = cats.find((r) => r.id === T.catOf(w));
      if (row) row.count++; else other++;
      if (typeof w.min === 'number') { minutes += w.min; timed++; longest = Math.max(longest, w.min); if (row) row.minutes += w.min; }
      if (w.outdoor) outdoor++;
      weekdays[T.weekdayOf(k)]++;
    }));

    // one entry per calendar week of the run, newest first
    const weeks = [];
    if (state.run && todayKey) {
      const thisWeek = T.weekOf(todayKey).start;
      for (let ws = T.weekOf(state.run.startDate).start; D.diffDays(ws, thisWeek) >= 0; ws = D.addDays(ws, 7)) {
        const pr = T.weekProgress(state, ws);
        weeks.push({ start: ws, end: pr.end, partial: pr.partial, current: ws === thisWeek, done: pr.total.done,
          cats: pr.cats.map((c) => ({ id: c.id, done: c.done })), extra: pr.extra });
      }
      weeks.reverse();
    }
    return { sessions, minutes, avgMin: timed ? Math.round(minutes / timed) : 0, longest, outdoor, indoor: sessions - outdoor, other, cats, weekdays, weeks };
  }

  // ---------- meals ----------
  // What we know about how a meal was logged: recorded info, else (ready-made dish text) inferred.
  function infoFor(day, task) {
    const info = day.mealInfo && day.mealInfo[task];
    if (info && (info.src === 'plate' || info.src === 'quick')) return info;
    const text = day.meals && day.meals[task], M = root.Meals;
    if (text && M) {
      for (const c of M.CATEGORIES) {
        if (['breakfast', 'lunch', 'dinner'].some((slot) => (c[slot] || []).includes(text))) return { src: 'quick', cat: c.id };
      }
    }
    return null;
  }

  function meals(state) {
    const keys = runDays(state).filter((k) => state.days[k].closed);          // only finished days: a fair denominator
    const slots = MEAL_TASKS.map(([task, name]) => ({ task, name, logged: 0 }));
    const src = { plate: 0, quick: 0, untracked: 0 };
    const itemCount = {}, famCount = {};
    let logged = 0, plateTotal = 0, plateComplete = 0;

    keys.forEach((k) => {
      const d = state.days[k];
      MEAL_TASKS.forEach(([task], si) => {
        if (!d.tasks[task]) return;
        logged++; slots[si].logged++;
        const info = infoFor(d, task);
        if (!info) { src.untracked++; return; }
        if (info.src === 'quick') { src.quick++; return; }
        src.plate++;
        const items = (info.items || []).filter((id) => P.BY_ID.has(id));
        plateTotal++;
        if (P.completeness(items).complete) plateComplete++;
        items.forEach((id) => {
          itemCount[id] = (itemCount[id] || 0) + 1;
          const it = P.BY_ID.get(id);
          if (it.part === 'protein') famCount[it.grp] = (famCount[it.grp] || 0) + 1;
        });
      });
    });

    const possible = keys.length * MEAL_TASKS.length;
    const protein = Object.keys(famCount).map((g) => ({ id: g, name: FAMILIES[g] || g, count: famCount[g] }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const topByPart = P.PARTS.map((part) => ({
      id: part.id, name: part.name,
      items: P.ITEMS.filter((i) => i.part === part.id && itemCount[i.id]).map((i) => ({ id: i.id, name: i.name, count: itemCount[i.id] }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3)
    })).filter((p) => p.items.length);

    return { days: keys.length, possible, logged, rate: possible ? Math.round((logged / possible) * 100) : 0,
      slots, src, plate: { total: plateTotal, complete: plateComplete }, protein, topByPart };
  }

  root.Stats = { FAMILIES, workouts, meals, infoFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
