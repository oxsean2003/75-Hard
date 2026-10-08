// Day lifecycle + rule engine. Pure logic: no DOM, no storage (see store.js).
// All "now" values are epoch ms, passed in so tests can control the clock.
// A "logical day" runs from cutoffHour to cutoffHour (default 05:00): before the
// cutoff you are still on the previous day. Day keys are local 'YYYY-MM-DD'.
(function (root) {
  'use strict';

  const TOTAL_DAYS = 75;
  const WATER_GOAL_ML = 3800;
  const PAGES_GOAL = 10;
  const WORKOUT_MIN = 45;
  const DAY_MS = 86400000;
  const MILESTONES = [7, 25, 50, 75];

  // Simple "kept all day / done" checkboxes. Water, pages, photo and workouts
  // have richer data and are evaluated separately in evaluateDay().
  const TASK_IDS = ['meal1', 'meal2', 'meal3', 'nosnack', 'nosugar', 'nofried',
    'noflour', 'noalc', 'phoneAm', 'phonePm', 'rule2'];

  // ---- date helpers (date-only math in UTC so DST can't skew day counts) ----
  const pad = (n) => String(n).padStart(2, '0');
  const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromUtc = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const addDays = (key, n) => fromUtc(utc(key) + n * DAY_MS);
  const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / DAY_MS);

  function logicalDate(nowMs, cutoffHour) {
    const d = new Date(nowMs);
    let key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (d.getHours() < cutoffHour) key = addDays(key, -1); // local hour, not ms math: DST-safe
    return key;
  }

  // ---- state ----
  function newState() {
    return {
      v: 1,
      settings: {
        cutoffHour: 5,
        gapHours: 3,
        bottleMl: 500,
        glassMl: 250,
        // time cues for in-app banners and the iOS Reminders list (HH:MM, editable)
        reminders: { photo: '07:00', w1: '08:30', lunch: '13:00', w2: '17:00', dinner: '19:30', read: '21:00', phonePm: '22:00', endday: '22:30' },
        ruleNames: { r2: 'כלל אישי 2', r3: 'כלל אישי 3 — מקס׳ פעם בשבוע' }
      },
      run: null,            // { attempt, startDate, startedAtMs }
      days: {},             // dayKey -> day record
      r3Log: [],            // dayKeys on which the weekly-limited rule was used
      history: [],          // one entry per failed attempt
      best: 0,              // best completed-day streak ever
      pending: null,        // { dayKey, missing[], auto } awaiting fix-or-confirm
      timer: null,          // running workout: { id, dayKey, startedAt, outdoor }
      measurements: [],     // [{ date, weight, waist }] weekly body measurements
      celebrated: [],       // milestone ids already shown, 'attempt:day'
      lastBackupAt: null,
      completedAt: null
    };
  }

  function newDay() {
    return {
      tasks: {},
      meals: {},            // meal1..3 -> short text of what was eaten (from the meal guide)
      waterMl: 0,
      pages: 0,
      book: '',
      takeaway: '',
      photo: false,
      w1: { done: false, outdoor: false },
      w2: { done: false, outdoor: false },
      closed: null          // { at, ok, auto, missing[] }
    };
  }

  function ensureDay(state, key) {
    if (!state.days[key]) state.days[key] = newDay();
    return state.days[key];
  }

  const cutoff = (s) => s.settings.cutoffHour;
  const today = (s, now) => logicalDate(now, cutoff(s));
  const dayNumber = (s, key) => (s.run ? diffDays(s.run.startDate, key) + 1 : 0);

  function phase(state, now) {
    if (state.completedAt) return 'complete';
    if (!state.run) return 'unset';
    if (state.pending) return 'pending';
    return diffDays(state.run.startDate, today(state, now)) < 0 ? 'ready' : 'active';
  }

  function startRun(state, startDate, now) {
    if (state.run && !state.completedAt) return { ok: false, error: 'already-running' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: 'bad-date' };
    if (diffDays(startDate, today(state, now)) > 0) return { ok: false, error: 'past' };
    state.run = { attempt: state.history.length + 1, startDate, startedAtMs: now };
    state.completedAt = null;
    return { ok: true };
  }

  // Change a not-yet-started run's date (ready phase only).
  function changeStartDate(state, startDate, now) {
    if (phase(state, now) !== 'ready') return { ok: false, error: 'not-ready' };
    if (diffDays(startDate, today(state, now)) > 0) return { ok: false, error: 'past' };
    state.run.startDate = startDate;
    return { ok: true };
  }

  // ---- weekly-limited rule (max 1 per 7-day block of the run: days 1-7, 8-14, ...) ----
  const weekIndex = (s, key) => Math.floor((dayNumber(s, key) - 1) / 7);

  function weekR3Count(state, key) {
    if (!state.run) return 0;
    const w = weekIndex(state, key);
    return state.r3Log.filter((e) => diffDays(state.run.startDate, e) >= 0
      && diffDays(e, key) >= 0 && weekIndex(state, e) === w).length;
  }
  const r3Over = (state, key) => weekR3Count(state, key) > 1;

  function canEdit(state, key, now) {
    if (!state.run) return false;
    if (state.pending && state.pending.dayKey === key) return true; // fix a mis-tap
    const day = state.days[key];
    return key === today(state, now) && diffDays(state.run.startDate, key) >= 0 && !(day && day.closed);
  }

  // ---- rule evaluation: returns ids of everything that is missing / broken ----
  function evaluateDay(state, key) {
    const day = state.days[key] || newDay();
    const missing = [];
    TASK_IDS.forEach((id) => { if (!day.tasks[id]) missing.push(id); });
    if (day.waterMl < WATER_GOAL_ML) missing.push('water');
    if (day.pages < PAGES_GOAL) missing.push('read');
    if (!day.photo) missing.push('photo');

    ['w1', 'w2'].forEach((id) => {
      const w = day[id];
      if (!w.done) missing.push(id);
      else if (typeof w.min === 'number' && w.min < WORKOUT_MIN) missing.push(id + 'min');
    });
    if (!((day.w1.done && day.w1.outdoor) || (day.w2.done && day.w2.outdoor))) missing.push('outdoor');

    // Gap check only when both sessions carry real timestamps (timer-recorded).
    const a = day.w1, b = day.w2;
    if (a.done && b.done && a.startedAt && a.endedAt && b.startedAt && b.endedAt) {
      const [first, second] = a.startedAt <= b.startedAt ? [a, b] : [b, a];
      if (second.startedAt - first.endedAt < state.settings.gapHours * 3600000) missing.push('gap');
    }
    if (r3Over(state, key)) missing.push('r3');
    return missing;
  }

  // ---- closing days ----
  function bumpBest(state, key) { state.best = Math.max(state.best, dayNumber(state, key)); }

  function finishIfComplete(state, key, now) {
    if (dayNumber(state, key) >= TOTAL_DAYS) { state.completedAt = now; return true; }
    return false;
  }

  function closeDay(state, key, now, auto) {
    const day = ensureDay(state, key);
    const missing = evaluateDay(state, key);
    day.closed = { at: now, ok: missing.length === 0, auto: !!auto, missing };
    if (missing.length) return { ok: false, missing };
    bumpBest(state, key);
    return { ok: true, completed: finishIfComplete(state, key, now) };
  }

  // Close every day that has fully elapsed (covers "forgot to press End my day"
  // and "didn't open the app for days"). Stops at the first failed day.
  function sync(state, now) {
    if (!state.run || state.pending || state.completedAt) return { changed: false };
    const t = today(state, now);
    let changed = false;
    for (let key = state.run.startDate; diffDays(key, t) > 0; key = addDays(key, 1)) {
      const day = ensureDay(state, key);
      if (day.closed) continue;
      changed = true;
      const res = closeDay(state, key, now, true);
      if (!res.ok) { state.pending = { dayKey: key, missing: res.missing, auto: true }; break; }
      if (res.completed) break;
    }
    return { changed };
  }

  // The "End my day" button. With missing items it refuses unless confirmFail,
  // so the UI can show the warning first and let the user go fix a mis-tap.
  function endDay(state, now, opts) {
    const confirmFail = !!(opts && opts.confirmFail);
    if (phase(state, now) !== 'active') return { ok: false, error: 'not-active' };
    const key = today(state, now);
    const day = ensureDay(state, key);
    if (day.closed) return { ok: false, error: 'already-closed' };
    const missing = evaluateDay(state, key);
    if (missing.length && !confirmFail) return { ok: false, error: 'missing', missing };
    const res = closeDay(state, key, now, false);
    if (res.ok) return { ok: true, dayNumber: dayNumber(state, key), completed: res.completed };
    state.pending = { dayKey: key, missing: res.missing, auto: false };
    confirmReset(state, now);
    return { ok: true, reset: true, missing: res.missing };
  }

  // User fixed items on the pending day: re-check it.
  function reevaluatePending(state, now) {
    const p = state.pending;
    if (!p) return { resolved: false, error: 'no-pending' };
    const missing = evaluateDay(state, p.dayKey);
    if (missing.length) { p.missing = missing; return { resolved: false, missing }; }
    const day = ensureDay(state, p.dayKey);
    day.closed = { at: now, ok: true, auto: p.auto, missing: [], fixed: true };
    state.pending = null;
    bumpBest(state, p.dayKey);
    const completed = finishIfComplete(state, p.dayKey, now);
    if (!completed) sync(state, now);
    return { resolved: true, completed };
  }

  // User accepted the restart. New Day 1 = the day after the failed one, or
  // today if that day is already behind us.
  function confirmReset(state, now) {
    const p = state.pending;
    if (!p) return { ok: false, error: 'no-pending' };
    const failedNo = dayNumber(state, p.dayKey);
    state.history.push({
      attempt: state.run.attempt, startDate: state.run.startDate,
      failedDay: p.dayKey, dayNumber: failedNo, missing: p.missing.slice(), at: now
    });
    const next = addDays(p.dayKey, 1);
    const t = today(state, now);
    const newStart = diffDays(next, t) > 0 ? t : next;
    state.run = { attempt: state.run.attempt + 1, startDate: newStart, startedAtMs: now };
    state.pending = null;
    return { ok: true, startDate: newStart, attempt: state.run.attempt };
  }

  // ---- edits (all guarded so closed/past days can't be altered by accident) ----
  function edit(state, key, now, fn) {
    if (!canEdit(state, key, now)) return false;
    fn(ensureDay(state, key));
    return true;
  }
  const setTask = (s, key, now, id, val) => TASK_IDS.includes(id)
    && edit(s, key, now, (d) => { d.tasks[id] = !!val; });
  // Log a meal from the guide: ticks the meal task and remembers what it was.
  const setMeal = (s, key, now, id, text) => ['meal1', 'meal2', 'meal3'].includes(id)
    && edit(s, key, now, (d) => { d.tasks[id] = true; d.meals[id] = String(text || '').slice(0, 200); });
  const addWater =(s, key, now, ml) => edit(s, key, now, (d) => { d.waterMl = Math.max(0, d.waterMl + ml); });
  const setPages = (s, key, now, n) => edit(s, key, now, (d) => { d.pages = Math.max(0, Math.floor(n) || 0); });
  const setPhoto = (s, key, now, has) => edit(s, key, now, (d) => { d.photo = !!has; });
  const setReading = (s, key, now, r) => edit(s, key, now, (d) => {
    d.pages = Math.max(0, Math.floor(r.pages) || 0);
    d.book = String(r.book || '').slice(0, 120);
    d.takeaway = String(r.takeaway || '').slice(0, 500);
  });
  const setWorkout = (s, key, now, id, patch) => (id === 'w1' || id === 'w2')
    && edit(s, key, now, (d) => { Object.assign(d[id], patch); });
  function logR3(state, key, now) {
    return edit(state, key, now, () => { state.r3Log.push(key); });
  }
  function unlogR3(state, key, now) {
    return edit(state, key, now, () => {
      const i = state.r3Log.lastIndexOf(key);
      if (i >= 0) state.r3Log.splice(i, 1);
    });
  }

  // ---- measurements (not tied to the day lifecycle: can be added/edited any time) ----
  function addMeasurement(state, dateKey, weight, waist) {
    const w = Number(weight), c = Number(waist);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !(w > 0 || c > 0)) return false;
    const entry = { date: dateKey };
    if (w > 0 && w < 500) entry.weight = Math.round(w * 10) / 10;
    if (c > 0 && c < 400) entry.waist = Math.round(c * 10) / 10;
    if (entry.weight == null && entry.waist == null) return false;
    state.measurements = state.measurements.filter((m) => m.date !== dateKey).concat(entry)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return true;
  }
  function removeMeasurement(state, dateKey) {
    state.measurements = state.measurements.filter((m) => m.date !== dateKey);
  }

  // ---- milestones: a celebration is due once the day closes OK, shown once per attempt ----
  function pendingMilestone(state) {
    if (!state.run) return null;
    for (const n of MILESTONES) {
      const d = state.days[addDays(state.run.startDate, n - 1)];
      const id = `${state.run.attempt}:${n}`;
      if (d && d.closed && d.closed.ok && !state.celebrated.includes(id)) return { n, id };
    }
    return null;
  }
  function markCelebrated(state, id) { if (!state.celebrated.includes(id)) state.celebrated.push(id); }

  // ---- derived view data ----
  // Ring: 11 checkbox tasks + 2 workouts + reading + photo + fractional water.
  function progress(state, key) {
    const day = state.days[key] || newDay();
    const done = TASK_IDS.filter((id) => day.tasks[id]).length
      + (day.w1.done ? 1 : 0) + (day.w2.done ? 1 : 0)
      + (day.pages >= PAGES_GOAL ? 1 : 0) + (day.photo ? 1 : 0);
    const total = TASK_IDS.length + 4;
    const water = Math.min(day.waterMl / WATER_GOAL_ML, 1);
    return { done, total, water, pct: Math.round(((done + water) / (total + 1)) * 100) };
  }

  function status(state, now) {
    const p = phase(state, now);
    const key = today(state, now);
    const n = state.run ? dayNumber(state, key) : 0;
    const doneDays = state.run
      ? Object.keys(state.days).filter((k) => diffDays(state.run.startDate, k) >= 0
        && state.days[k].closed && state.days[k].closed.ok).length
      : 0;
    return {
      phase: p, today: key, dayNumber: n, totalDays: TOTAL_DAYS,
      daysLeft: Math.max(0, TOTAL_DAYS - n), doneDays, best: state.best,
      attempt: state.run ? state.run.attempt : 0,
      closedToday: !!(state.days[key] && state.days[key].closed),
      daysUntilStart: state.run && p === 'ready' ? diffDays(key, state.run.startDate) : 0
    };
  }

  const api = {
    TOTAL_DAYS, MILESTONES, WATER_GOAL_ML, PAGES_GOAL, WORKOUT_MIN, TASK_IDS,
    addDays, diffDays, logicalDate, newState, newDay, ensureDay, dayNumber, phase, status,
    startRun, changeStartDate, weekR3Count, r3Over, canEdit, evaluateDay, sync, endDay,
    reevaluatePending, confirmReset, progress,
    addMeasurement, removeMeasurement, pendingMilestone, markCelebrated,
    setTask, setMeal, addWater, setPages, setPhoto, setReading, setWorkout, logR3, unlogR3
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Day = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
