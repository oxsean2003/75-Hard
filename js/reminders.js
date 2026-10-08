// Time cues. A server-less PWA can't push notifications while closed (iOS), so:
//  - in-app: Today shows a banner for the latest cue that has passed and isn't done yet;
//  - outside the app: text() builds a list to create in iOS Reminders / Clock alarms.
(function (root) {
  'use strict';

  const LIST = [
    { id: 'photo',   label: 'תמונת התקדמות',                     banner: true,  done: (d) => d.photo },
    { id: 'w1',      label: 'אימון 1 (בחוץ)',                    banner: true,  done: (d) => d.w1.done },
    { id: 'lunch',   label: 'ארוחת צהריים',                      banner: true,  done: (d) => !!d.tasks.meal2 },
    { id: 'w2',      label: 'אימון 2',                           banner: true,  done: (d) => d.w2.done },
    { id: 'dinner',  label: 'ארוחת ערב',                         banner: true,  done: (d) => !!d.tasks.meal3 },
    { id: 'read',    label: '10 עמודי קריאה',                    banner: true,  done: (d) => !!d.read },
    { id: 'phonePm', label: 'בלי טלפון: 30 דקות לפני השינה',     banner: false },
    { id: 'endday',  label: 'לסיים את היום באפליקציה',           banner: false }
  ];

  function minutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  // Latest banner-type cue whose time has passed today and whose task isn't done.
  function due(state, day, now) {
    const d = new Date(now), cur = d.getHours() * 60 + d.getMinutes();
    let best = null, bestAt = -1;
    LIST.forEach((r) => {
      if (!r.banner) return;
      const at = minutes(state.settings.reminders[r.id]);
      if (at == null || at > cur || r.done(day)) return;
      if (at > bestAt) { best = r; bestAt = at; }
    });
    return best;
  }

  const text = (state) => LIST
    .map((r) => `${state.settings.reminders[r.id] || '--:--'}  ${r.label}`)
    .sort().join('\n');

  root.Reminders = { LIST, minutes, due, text };
})(typeof globalThis !== 'undefined' ? globalThis : this);
