// Weekly training quota logic (pure, tested; the clock/state are passed in).
// Week = calendar Sunday-Saturday. The quota is a GOAL: nothing here can fail a day or restart the run.
(function (root) {
  'use strict';

  const D = root.Day, TD = root.TrainingData;
  const CATS = TD.CATEGORIES;
  const BY = new Map(CATS.map((c) => [c.id, c]));
  const TOTAL = CATS.reduce((a, c) => a + c.target, 0);   // 14

  const weekdayOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
  function weekOf(key) {
    const start = D.addDays(key, -weekdayOf(key));
    return { start, end: D.addDays(start, 6) };
  }

  // ---- classifying a workout ----
  function catOfText(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (TD.LEGACY_CATS[t]) return TD.LEGACY_CATS[t];
    if (/^אפשרות א/.test(t)) return 'str_low';       // routines A / B / C
    if (/^אפשרות ב/.test(t)) return 'run';
    if (/^אפשרות ג/.test(t)) return 'mob';
    for (const c of CATS) if ((TD.SESSIONS[c.id] || []).includes(t)) return c.id;
    if (/כדורסל|פאדל|כדורגל|ספורט/.test(t)) return 'sport';
    if (/ספרינט|ריצ/.test(t)) return 'run';
    if (/ניידות|גמישות|מתיחות|יוגה/.test(t)) return 'mob';
    if (/הליכ|ראק|תיק כבד/.test(t)) return 'walk';
    if (/עליון/.test(t)) return 'str_up';
    if (/רגליים|כוח|ספסל|חיזוק|סקוואט/.test(t)) return 'str_low';
    return null;
  }
  // A workout record's category: the explicit `cat`, else derived from its session text.
  const catOf = (rec) => (!rec ? null : (rec.cat && BY.has(rec.cat) ? rec.cat : catOfText(rec.plan)));

  function sessionsFor(cat) {
    const list = (TD.SESSIONS[cat] || []).slice();
    const routineCat = { A: 'str_low', B: 'run', C: 'mob' };
    ((root.Workouts && root.Workouts.ROUTINES) || []).forEach((r) => { if (routineCat[r.id] === cat) list.push(r.name); });
    return list;
  }
  const defaultSession = (cat) => sessionsFor(cat)[0] || (BY.get(cat) || {}).name || '';

  // ---- weekly progress ----
  // Counts DONE workouts of the current run inside the calendar week of `dayKey`.
  function weekProgress(state, dayKey) {
    const { start, end } = weekOf(dayKey);
    const run = state.run;
    const rows = CATS.map((c) => ({ id: c.id, name: c.name, short: c.short, group: c.group, done: 0, target: c.target }));
    let other = 0;
    if (run) {
      for (let k = start; D.diffDays(k, end) >= 0; k = D.addDays(k, 1)) {
        if (D.diffDays(run.startDate, k) < 0) continue;            // earlier attempt / before the start
        const day = state.days[k];
        if (!day) continue;
        ['w1', 'w2'].forEach((id) => {
          const w = day[id];
          if (!w || !w.done) return;
          const row = rows.find((r) => r.id === catOf(w));
          if (row) row.done++; else other++;
        });
      }
    }
    const runEnd = run ? D.addDays(run.startDate, D.TOTAL_DAYS - 1) : null;
    const partial = !run || D.diffDays(start, run.startDate) > 0 || D.diffDays(runEnd, end) > 0;

    let daysLeft = 0, slotsLeft = 0;
    if (run) {
      const from = D.diffDays(run.startDate, dayKey) < 0 ? run.startDate : dayKey;
      const last = D.diffDays(end, runEnd) < 0 ? runEnd : end;     // min(week end, last day of the run)
      const today = state.days[dayKey];
      const closed = !!(today && today.closed);
      daysLeft = Math.max(0, D.diffDays(from, last) + 1 - (closed && from === dayKey ? 1 : 0));
      const doneToday = today && !closed ? ['w1', 'w2'].filter((id) => today[id] && today[id].done).length : 0;
      slotsLeft = Math.max(0, daysLeft * 2 - doneToday);
    }

    const need = rows.reduce((a, r) => a + Math.max(0, r.target - r.done), 0);
    const doneInQuota = rows.reduce((a, r) => a + Math.min(r.done, r.target), 0);
    const extra = rows.reduce((a, r) => a + Math.max(0, r.done - r.target), 0) + other;
    // 14 sessions fill all 14 slots, so "need == slots left" is simply what being on track looks like.
    // 'behind' = the quota can no longer be completed this week (informational; it is a goal, not a rule).
    let status = null;
    if (!partial) status = need === 0 ? 'done' : need > slotsLeft ? 'behind' : 'ontrack';
    return { start, end, partial, total: { done: doneInQuota, target: partial ? null : TOTAL }, cats: rows, other, extra, need, daysLeft, slotsLeft, status };
  }

  // ---- suggestions ----
  // Ranks categories for a slot given what is left this week and the day's other slot.
  function rank(state, dayKey, otherCat, reserveOther) {
    const prog = weekProgress(state, dayKey);
    const y = state.days[D.addDays(dayKey, -1)];
    const yestSport = !!y && ['w1', 'w2'].some((id) => y[id] && y[id].done && catOf(y[id]) === 'sport');
    const scored = [];
    CATS.forEach((c, order) => {
      const row = prog.cats.find((r) => r.id === c.id);
      const remaining = row.target - row.done - (reserveOther && otherCat === c.id ? 1 : 0);
      if (remaining <= 0) return;
      let score = (remaining / row.target) * 10, reason = '';          // share of the target still owed

      const bump = (n, why) => { score += n; if (n > 0 && why && !reason) reason = why; };   // the first (most specific) reason wins
      if (yestSport && c.id === 'mob') bump(6, 'יום אחרי משחק');
      if (yestSport && c.id === 'sport') score -= 3;
      if (otherCat === 'sport') {
        if (c.id === 'sport') return;
        if (c.light) bump(6, 'ביום משחק האימון השני קל'); else score -= 5;
      }
      if (otherCat === 'run' && (c.id === 'str_low' || c.id === 'run')) return;
      if (otherCat && !BY.get(otherCat).outdoor && c.outdoor) bump(c.light ? 4 : 2, 'אימון בחוץ להיום');   // prefer the easy outdoor option
      scored.push({ cat: c.id, reason, score, order });
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return scored.map(({ cat, reason }) => ({ cat, reason }));
  }

  // Top suggestions for slot `slotId` ('w1' | 'w2') on `dayKey` (never empty).
  function suggest(state, dayKey, slotId, limit) {
    const day = state.days[dayKey] || {};
    const other = slotId === 'w1' ? 'w2' : 'w1';
    let otherCat = catOf(day[other]);
    let reserve = !!(otherCat && !(day[other] && day[other].done));   // chosen but not counted yet
    if (!otherCat && slotId === 'w2') {                                // anticipate slot 1 so the two complement each other
      const first = rank(state, dayKey, null, false)[0];
      if (first) { otherCat = first.cat; reserve = true; }
    }
    let out = rank(state, dayKey, otherCat, reserve);
    if (!out.length) out = ['walk', 'mob'].map((cat) => ({ cat, reason: 'המכסה מלאה — אימון קל נוסף' }));
    return out.slice(0, limit || 2);
  }

  // What a slot is today: the explicit choice (or a finished workout), else the top suggestion.
  // -> { cat (null = uncategorised custom session), text, source: 'chosen' | 'suggested', reason }
  function effective(state, dayKey, id) {
    const rec = (state.days[dayKey] || {})[id];
    const c = catOf(rec);
    if (c) return { cat: c, text: (rec && rec.plan) || defaultSession(c), source: 'chosen', reason: '' };
    if (rec && rec.plan) return { cat: null, text: rec.plan, source: 'chosen', reason: '' };      // custom text, no category
    const top = suggest(state, dayKey, id, 1)[0];
    return { cat: top.cat, text: defaultSession(top.cat), source: 'suggested', reason: top.reason };
  }

  // ---- soft hints for today ----
  function hints(state, dayKey) {
    const out = [], day = state.days[dayKey] || {};
    const c1 = catOf(day.w1), c2 = catOf(day.w2), cats = [c1, c2].filter(Boolean);
    const outdoorDone = ['w1', 'w2'].some((id) => day[id] && day[id].done && day[id].outdoor);

    if (c1 && c2 && !outdoorDone && !cats.some((c) => BY.get(c).outdoor)) {
      out.push({ id: 'no_outdoor', text: 'אין אימון מתוכנן בחוץ היום — אחד האימונים חייב להיות בחוץ (פארק, דשא, מגרש או הליכה).' });
    }
    if (cats.includes('str_low') && cats.includes('run')) {
      out.push({ id: 'leg_on_run_day', text: 'חיזוק רגליים ביום ריצה עמוס לברכיים — עדיף להפריד.' });
    }
    if (cats.includes('sport') && cats.some((c) => c !== 'sport' && !BY.get(c).light)) {
      out.push({ id: 'game_light_first', text: 'ביום משחק האימון השני קל: הליכה או ניידות.' });
    }
    const y = state.days[D.addDays(dayKey, -1)];
    const yestSport = !!y && ['w1', 'w2'].some((id) => y[id] && y[id].done && catOf(y[id]) === 'sport');
    const prog = weekProgress(state, dayKey);
    const mob = prog.cats.find((r) => r.id === 'mob');
    if (yestSport && mob.target - mob.done > 0 && !cats.includes('mob')) {
      out.push({ id: 'mobility_due', text: 'אתמול היה משחק — זה הזמן לניידות.' });
    }
    return out;
  }

  root.Training = { CATS, BY, TOTAL, GROUPS: TD.GROUPS, weekdayOf, weekOf, catOfText, catOf, sessionsFor, defaultSession, weekProgress, suggest, effective, hints };
})(typeof globalThis !== 'undefined' ? globalThis : this);
