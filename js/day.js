// Day lifecycle + rule engine. Pure logic: no DOM, no storage (see store.js).
// All "now" values are epoch ms, passed in so tests can control the clock.
// A "logical day" runs from cutoffHour to cutoffHour (default 05:00): before the
// cutoff you are still on the previous day. Day keys are local 'YYYY-MM-DD'.
(function (root) {
  'use strict';

  const TOTAL_DAYS = 75;
  const WATER_GOAL_ML = 3800;
  const WORKOUT_MIN = 45;
  const DAY_MS = 86400000;
  const MILESTONES = [7, 25, 50, 75];

  // Checkbox tasks. Negative rules (no snacking/sugar/alcohol, phone windows, personal
  // rules) are honor-system reminders, NOT tracked. Water, reading, photo and workouts
  // are evaluated separately in evaluateDay().
  const TASK_IDS = ['meal1', 'meal2', 'meal3'];

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
        ruleNames: { r2: 'כלל אישי 2', r3: 'כלל אישי 3 — מקס׳ פעם בשבוע' },  // reminder text only
        weekPlan: [null, null, null, null, null, null, null]  // per weekday (0=Sun): { w1, w2 } text, null = calendar default
      },
      run: null,            // { attempt, startDate, startedAtMs }
      days: {},             // dayKey -> day record
      history: [],          // one entry per failed attempt
      best: 0,              // best completed-day streak ever
      pending: null,        // { dayKey, missing[], auto } awaiting fix-or-confirm
      timer: null,          // running workout: { id, dayKey, startedAt, outdoor }
      measurements: [],     // [{ date, weight, waist }] weekly body measurements
      celebrated: [],       // milestone ids already shown, 'attempt:day'
      notesShown: [],       // sticky-note ids already shown, 'attempt:dayNumber'
      pantryMissing: [],    // plate builder: ids of ingredients NOT at home (default: everything is)
      lastBackupAt: null,
      completedAt: null
    };
  }

  function newDay() {
    return {
      tasks: {},
      meals: {},            // meal1..3 -> short text of what was eaten (from the meal guide)
      waterMl: 0,
      read: false,          // 10 pages of a physical non-fiction book: just a checkmark
      photo: false,
      w1: { done: false, outdoor: false },   // + optional plan (text override), min, startedAt, endedAt
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
    if (!day.read) missing.push('read');
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

  // Honor-system restart: the user says they broke a rule. Today's record stays with the
  // failed attempt; the new Day 1 is tomorrow (same convention as confirming a failed day).
  function manualRestart(state, now) {
    if (!state.run || state.completedAt) return { ok: false, error: 'no-run' };
    if (state.pending) return { ok: false, error: 'pending' };
    const t = today(state, now);
    if (diffDays(state.run.startDate, t) < 0) return { ok: false, error: 'not-started' };
    state.history.push({
      attempt: state.run.attempt, startDate: state.run.startDate,
      failedDay: t, dayNumber: dayNumber(state, t), missing: ['manual'], at: now
    });
    const startDate = addDays(t, 1);
    state.run = { attempt: state.run.attempt + 1, startDate, startedAtMs: now };
    state.timer = null;
    return { ok: true, startDate, attempt: state.run.attempt };
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
  const addWater = (s, key, now, ml) => edit(s, key, now, (d) => { d.waterMl = Math.max(0, d.waterMl + ml); });
  const setPhoto = (s, key, now, has) => edit(s, key, now, (d) => { d.photo = !!has; });
  const setRead = (s, key, now, val) => edit(s, key, now, (d) => { d.read = !!val; });
  const setWorkout = (s, key, now, id, patch) => (id === 'w1' || id === 'w2')
    && edit(s, key, now, (d) => { Object.assign(d[id], patch); });
  // Swap which session you do today (text; '' = back to the plan). Not once it's done.
  const setWorkoutPlan = (s, key, now, id, text) => (id === 'w1' || id === 'w2')
    && !(s.days[key] && s.days[key][id].done)
    && edit(s, key, now, (d) => { d[id].plan = String(text || '').trim().slice(0, 120); });

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

  // ---- sticky notes: one per successfully closed day, counting DOWN (day 1 -> 75 ... day 75 -> 1) ----
  const noteNumber = (dayNo) => TOTAL_DAYS - dayNo + 1;

  // Closed-OK days of the CURRENT run, oldest first (earlier attempts' days fall before the start date).
  function completedNotes(state) {
    if (!state.run) return [];
    return Object.keys(state.days)
      .filter((k) => diffDays(state.run.startDate, k) >= 0 && state.days[k].closed && state.days[k].closed.ok)
      .sort()
      .map((k) => {
        const dayNo = dayNumber(state, k);
        return { key: k, dayNumber: dayNo, n: noteNumber(dayNo), id: `${state.run.attempt}:${dayNo}` };
      });
  }

  // The note to show now: the NEWEST completed day not yet shown. `ids` lists every unseen day up to it
  // so a catch-up (days closed while the app was shut) shows one note, not a backlog of pop-ups.
  function pendingNote(state) {
    const unseen = completedNotes(state).filter((d) => !state.notesShown.includes(d.id));
    if (!unseen.length) return null;
    const latest = unseen[unseen.length - 1];
    return { n: latest.n, dayNumber: latest.dayNumber, ids: unseen.map((d) => d.id) };
  }
  function markNotesShown(state, ids) {
    ids.forEach((id) => { if (!state.notesShown.includes(id)) state.notesShown.push(id); });
  }

  // ---- derived view data ----
  // Ring: 3 meals + 2 workouts + reading + photo + fractional water.
  function progress(state, key) {
    const day = state.days[key] || newDay();
    const done = TASK_IDS.filter((id) => day.tasks[id]).length
      + (day.w1.done ? 1 : 0) + (day.w2.done ? 1 : 0)
      + (day.read ? 1 : 0) + (day.photo ? 1 : 0);
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
    TOTAL_DAYS, MILESTONES, WATER_GOAL_ML, WORKOUT_MIN, TASK_IDS,
    addDays, diffDays, logicalDate, newState, newDay, ensureDay, dayNumber, phase, status,
    startRun, changeStartDate, canEdit, evaluateDay, sync, endDay,
    reevaluatePending, confirmReset, manualRestart, progress,
    addMeasurement, removeMeasurement, pendingMilestone, markCelebrated,
    noteNumber, completedNotes, pendingNote, markNotesShown,
    setTask, setMeal, addWater, setPhoto, setRead, setWorkout, setWorkoutPlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Day = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
