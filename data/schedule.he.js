// 7-day training calendar (from the user's Training Library doc), Hebrew.
// Index 0 = Sunday (Date#getDay). w1 is outdoors per the calendar; sports days
// (Tue/Sat) use a 90+ min session as workout #2.
//
// Sessions are interchangeable: planFor() resolves what to show for a day as
//   1. the day's own override (swapped on Today)  >  2. the user's weekly plan (Settings)
//   >  3. this default calendar.
(function (root) {
  'use strict';
  const DAYS = [
    { name: 'ראשון',  w1: 'הליכת התאוששות בחוץ',                       w2: 'גמישות ופתיחה עמוקה (החזקות של 2 דק׳)', sports: false },
    { name: 'שני',    w1: 'מעגל פלג גוף עליון בחוץ (שכיבות סמיכה, מקבילים, פלאנק)', w2: 'רגליים וליבה בבית (סקוואט, לאנג׳, גשר ישבן)', sports: false },
    { name: 'שלישי',  w1: 'הליכה מהירה / ריצה קלה בבוקר',               w2: 'כדורסל / ספורט (90+ דק׳)',                sports: true },
    { name: 'רביעי',  w1: 'ניידות ופתיחת ירכיים בחוץ',                  w2: 'פלג גוף עליון וליבה בבית',               sports: false },
    { name: 'חמישי',  w1: 'ספרינטים בעלייה או מעגל בפארק',              w2: 'זרימת ניידות אתלטית (45 דק׳)',           sports: false },
    { name: 'שישי',   w1: 'הליכה מהירה עם תיק כבד בחוץ',                w2: 'כוח לכל הגוף בבית (משקל גוף / משקולות)', sports: false },
    { name: 'שבת',    w1: 'ריצה קלה או הליכה בבוקר',                    w2: 'כדורסל / ספורט (90+ דק׳)',                sports: true }
  ];

  const SPORTS_RE = /כדורסל|ספורט|פאדל|כדורגל/;
  const isSports = (text) => SPORTS_RE.test(text || '');

  const weekday = (dayKey) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  };

  // Calendar default for a day (kept for the weekly list / defaults).
  const plan = (dayKey) => DAYS[weekday(dayKey)];

  // Every session a user can pick: the calendar's distinct sessions + routines A/B/C.
  function options() {
    const seen = new Set(), out = [];
    const add = (text) => { if (text && !seen.has(text)) { seen.add(text); out.push({ text, sports: isSports(text) }); } };
    DAYS.forEach((d) => add(d.w1));
    DAYS.forEach((d) => add(d.w2));
    ((root.Workouts && root.Workouts.ROUTINES) || []).forEach((r) => add(r.name));
    return out;
  }

  // The user's weekly-plan text for a weekday (0=Sun) and slot, else the calendar default.
  function weekdayPlan(state, wd, id) {
    const wp = state.settings.weekPlan && state.settings.weekPlan[wd];
    return (wp && wp[id]) || DAYS[wd][id];
  }

  // What to do in slot `id` ('w1'|'w2') on `dayKey`. -> { text, sports, source }
  function planFor(state, dayKey, id) {
    const rec = state.days[dayKey];
    if (rec && rec[id] && rec[id].plan) return { text: rec[id].plan, sports: isSports(rec[id].plan), source: 'day' };
    const wd = weekday(dayKey);
    const wp = state.settings.weekPlan && state.settings.weekPlan[wd];
    if (wp && wp[id]) return { text: wp[id], sports: isSports(wp[id]), source: 'week' };
    return { text: DAYS[wd][id], sports: id === 'w2' && DAYS[wd].sports, source: 'default' };
  }

  root.Schedule = { DAYS, plan, planFor, weekdayPlan, options, isSports, weekday };
})(typeof globalThis !== 'undefined' ? globalThis : this);
