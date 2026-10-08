// 7-day training calendar (from the user's Training Library doc), Hebrew.
// Index 0 = Sunday (Date#getDay). w1 is always outdoors per the calendar;
// sports days (Tue/Sat) use a 90+ min session as workout #2.
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

  // dayKey 'YYYY-MM-DD' -> that weekday's plan
  function plan(dayKey) {
    const [y, m, d] = dayKey.split('-').map(Number);
    return DAYS[new Date(y, m - 1, d).getDay()];
  }

  root.Schedule = { DAYS, plan };
})(typeof globalThis !== 'undefined' ? globalThis : this);
