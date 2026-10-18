// Weekly training quota (Hebrew): 14 sessions = 7 days x 2 workouts.
//   strength 4 (upper 2, lower/full 2) · impact 3 (sports 2, run 1) · recovery walks 5 · mobility 2.
// The quota is a GOAL (never fails a day); only the 75 Hard rules can restart the run.
(function (root) {
  'use strict';

  // outdoor: a category that is outdoors by nature (walk, run). light: an easy session (OK beside a game).
  const CATEGORIES = [
    { id: 'str_up',  name: 'חיזוק עליון',            short: 'חיזוק ↑', tiny: 'עליון', group: 'power',    target: 2, outdoor: false, light: false },
    { id: 'str_low', name: 'חיזוק רגליים / כל הגוף', short: 'חיזוק ↓', tiny: 'רגליים', group: 'power',    target: 2, outdoor: false, light: false },
    { id: 'sport',   name: 'ספורט (כדורסל / פאדל)',  short: 'ספורט',   tiny: 'ספורט', group: 'impact',   target: 2, outdoor: false, light: false },
    { id: 'run',     name: 'ריצה / ספרינטים',        short: 'ריצה',    tiny: 'ריצה', group: 'impact',   target: 1, outdoor: true,  light: false },
    { id: 'walk',    name: 'הליכה / ראק בחוץ',       short: 'הליכה',   tiny: 'הליכה', group: 'recovery', target: 5, outdoor: true,  light: true },
    { id: 'mob',     name: 'ניידות וגמישות',         short: 'ניידות',  tiny: 'ניידות', group: 'mobility', target: 2, outdoor: false, light: true }
  ];

  const GROUPS = [
    { id: 'power', name: 'כוח ובניית שריר',
      blurb: 'גירוי לצמיחת שריר. קצר וממוקד: שני אימונים לפלג גוף עליון ושניים לרגליים או לכל הגוף. בבית עם משקולות ומשקל גוף, או בפארק קלייסטניקס (שכיבות סמיכה, מתח, סקוואט, לאנג׳).' },
    { id: 'impact', name: 'אימפקט ואתלטיקה',
      blurb: 'מהירות, זריזות וסיבולת לב-ריאה: שני משחקים (כדורסל או פאדל, 90+ דקות) וריצה או ספרינטים אחת. אלה אימונים עמוסים לברכיים, לקרסוליים ולמערכת העצבים, ולכן הם מוגבלים ל-3 בשבוע. זה מונע כאבי שוקיים ושומר כוח לרגליים בימי החיזוק.' },
    { id: 'recovery', name: 'התאוששות פעילה',
      blurb: 'הליכה מהירה או ראק (הליכה עם תיק עמוס) בחוץ. עומד בכלל "בחוץ", שורף שומן, ותנועה קלה שמזרימה דם לשרירים ומזרזת התאוששות בלי לפרק רקמה חדשה. אלה לא אימונים "מבוזבזים": הם מה שמאפשר לגוף להתאושש ולצמוח.' },
    { id: 'mobility', name: 'ניידות וגמישות',
      blurb: 'זרימה רצופה של 45 דקות: מתיחות, פתיחת ירכיים ויציבות ליבה. לפרק עומס מהמפרקים, למנוע פציעות ולאפס את מערכת העצבים. הכי טוב ביום שאחרי משחק.' }
  ];

  // Concrete sessions to pick from, per category (every category also accepts free text).
  // Routines A / B / C are appended at runtime: A -> str_low (full body), B -> run, C -> mob.
  const SESSIONS = {
    str_up: ['מעגל פלג גוף עליון בחוץ (שכיבות סמיכה, מקבילים, פלאנק)', 'פלג גוף עליון וליבה בבית'],
    str_low: ['רגליים וליבה בבית (סקוואט, לאנג׳, גשר ישבן)', 'כוח לכל הגוף בבית (משקל גוף / משקולות)'],
    sport: ['כדורסל (90+ דק׳)', 'פאדל (90+ דק׳)', 'כדורגל (90+ דק׳)'],
    run: ['ספרינטים בעלייה או מעגל בפארק', 'ריצה קלה'],
    walk: ['הליכה מהירה בחוץ', 'הליכה עם תיק כבד (ראק) בחוץ', 'הליכת התאוששות בחוץ'],
    mob: ['ניידות ופתיחת ירכיים בחוץ', 'זרימת ניידות אתלטית (45 דק׳)', 'גמישות ופתיחה עמוקה (החזקות של 2 דק׳)']
  };

  // What the previous releases showed by default per weekday (0=Sun) and slot. Used ONLY to keep
  // already-finished workouts counting after the weekday template was removed (see Store.normalize).
  const LEGACY_DEFAULTS = [
    { w1: 'הליכת התאוששות בחוץ',                                    w2: 'גמישות ופתיחה עמוקה (החזקות של 2 דק׳)' },
    { w1: 'מעגל פלג גוף עליון בחוץ (שכיבות סמיכה, מקבילים, פלאנק)', w2: 'רגליים וליבה בבית (סקוואט, לאנג׳, גשר ישבן)' },
    { w1: 'הליכה מהירה / ריצה קלה בבוקר',                           w2: 'כדורסל / ספורט (90+ דק׳)' },
    { w1: 'ניידות ופתיחת ירכיים בחוץ',                              w2: 'פלג גוף עליון וליבה בבית' },
    { w1: 'ספרינטים בעלייה או מעגל בפארק',                          w2: 'זרימת ניידות אתלטית (45 דק׳)' },
    { w1: 'הליכה מהירה עם תיק כבד בחוץ',                            w2: 'כוח לכל הגוף בבית (משקל גוף / משקולות)' },
    { w1: 'ריצה קלה או הליכה בבוקר',                                w2: 'כדורסל / ספורט (90+ דק׳)' }
  ];

  // Exact texts from earlier releases -> category. The two "run or walk" light sessions were the easy
  // slot next to a game, so they count as walks (the quota has only one run a week).
  const LEGACY_CATS = {
    'הליכת התאוששות בחוץ': 'walk',
    'גמישות ופתיחה עמוקה (החזקות של 2 דק׳)': 'mob',
    'מעגל פלג גוף עליון בחוץ (שכיבות סמיכה, מקבילים, פלאנק)': 'str_up',
    'רגליים וליבה בבית (סקוואט, לאנג׳, גשר ישבן)': 'str_low',
    'הליכה מהירה / ריצה קלה בבוקר': 'walk',
    'כדורסל / ספורט (90+ דק׳)': 'sport',
    'ניידות ופתיחת ירכיים בחוץ': 'mob',
    'פלג גוף עליון וליבה בבית': 'str_up',
    'ספרינטים בעלייה או מעגל בפארק': 'run',
    'זרימת ניידות אתלטית (45 דק׳)': 'mob',
    'הליכה מהירה עם תיק כבד בחוץ': 'walk',
    'כוח לכל הגוף בבית (משקל גוף / משקולות)': 'str_low',
    'ריצה קלה או הליכה בבוקר': 'walk'
  };

  root.TrainingData = { CATEGORIES, GROUPS, SESSIONS, LEGACY_DEFAULTS, LEGACY_CATS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
