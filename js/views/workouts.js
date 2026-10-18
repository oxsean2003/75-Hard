// Workouts tab: the WEEKLY QUOTA (14 sessions = 7 days x 2 workouts, by category), today's two slots,
// the week at a glance, soft hints, then the 45-minute routines and the exercise library.
// The quota is a goal: nothing here fails a day. Choosing / starting a workout happens on "היום".
(function (root) {
  'use strict';

  const T = Training;
  const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  function fmtShort(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  const chip = (cat, solid, tiny) => `<span class="catchip cat-${cat || 'other'}${solid ? ' solid' : ''}">${cat ? T.BY.get(cat)[tiny ? 'tiny' : 'short'] : 'אחר'}</span>`;

  function statusText(prog) {
    if (prog.partial) return 'שבוע חלקי — סופרים מה שבוצע, בלי יעד קבוע.';
    if (prog.status === 'done') return 'המכסה השבועית הושלמה!';
    if (prog.status === 'behind') return `נשארו ${prog.need} אימונים במכסה ו-${prog.daysLeft} ימים: אי אפשר להשלים את כל המכסה השבוע. זה יעד, לא כלל — ממשיכים הלאה.`;
    return 'בדרך ליעד — כל משבצת אימון נחשבת.';
  }

  function quotaCard(app, prog) {
    const { esc } = app;
    const dots = prog.partial ? '' : `<div class="q-dots-big" aria-hidden="true">${Array.from({ length: T.TOTAL }, (_, i) => `<i class="${i < prog.total.done ? 'on' : ''}"></i>`).join('')}</div>`;
    const groups = T.GROUPS.map((g) => {
      const rows = prog.cats.filter((c) => c.group === g.id).map((c) => {
        const n = Math.max(c.target, c.done);
        const d = Array.from({ length: n }, (_, i) => `<i class="${i < c.done ? 'on' : ''}"></i>`).join('');
        return `<div class="q-row"><span class="q-name">${esc(c.name)}</span><span class="q-dots" dir="ltr" aria-hidden="true">${d}</span><span class="q-cnt">${c.done}${prog.partial ? '' : '/' + c.target}</span></div>`;
      }).join('');
      return `<div class="q-group"><h3>${esc(g.name)}</h3>${rows}
        <details class="q-info"><summary>מה זה?</summary><p>${esc(g.blurb)}</p></details></div>`;
    }).join('');
    return `<div class="card quota">
      <div class="q-head"><div class="q-count"><b>${prog.total.done}</b>${prog.partial ? '' : `<span>/${T.TOTAL}</span>`}</div>
        <div class="q-meta"><b>יעד שבועי</b><br>${esc(fmtShort(prog.start))} – ${esc(fmtShort(prog.end))}</div></div>
      ${dots}
      <p class="q-status${prog.status === 'behind' ? ' behind' : ''}">${esc(statusText(prog))}</p>
      ${prog.extra ? `<p class="note-l">בנוסף: ${prog.extra} אימונים מעבר למכסה או מחוץ לקטגוריות.</p>` : ''}
      ${groups}</div>`;
  }

  function todayCard(app, st) {
    const { esc } = app, s = app.state;
    const rows = ['w1', 'w2'].map((id) => {
      const ef = T.effective(s, st.today, id), done = s.days[st.today] && s.days[st.today][id].done;
      return `<p><b>${id === 'w1' ? 'אימון 1' : 'אימון 2'}${done ? ' ✓' : ''}</b><br>${chip(ef.cat)} ${esc(ef.text)}${ef.source === 'suggested' ? ' <span class="sg">הצעה</span>' : ''}${ef.source === 'suggested' && ef.reason ? `<br><small class="note-l">${esc(ef.reason)}</small>` : ''}</p>`;
    }).join('');
    const hints = T.hints(s, st.today).map((h) => `<p class="hint-soft">${esc(h.text)}</p>`).join('');
    return `<div class="card plan"><h2 class="sub-h">היום</h2>${rows}${hints}
      <p class="note-l">בוחרים (או מחליפים) ומתחילים במסך "היום".</p></div>`;
  }

  function weekStrip(app, prog, st) {
    const s = app.state, run = s.run;
    const cells = DAY_LETTERS.map((letter, i) => {
      const key = Day.addDays(prog.start, i);
      const inRun = !!run && Day.diffDays(run.startDate, key) >= 0 && Day.diffDays(key, Day.addDays(run.startDate, Day.TOTAL_DAYS - 1)) >= 0;
      const rec = s.days[key];
      const slot = (id) => {
        const w = rec && rec[id];
        if (!w) return '<span class="ws-empty">—</span>';
        const c = T.catOf(w);
        if (w.done) return chip(c, true, true);
        if (w.cat || w.plan) return chip(c, false, true);
        return '<span class="ws-empty">—</span>';
      };
      return `<div class="ws-day${key === st.today ? ' today' : ''}${inRun ? '' : ' off'}"><b>${letter}</b>${slot('w1')}${slot('w2')}</div>`;
    }).join('');
    return `<h2 class="sub-h">השבוע</h2><div class="card"><div class="ws">${cells}</div>
      <p class="note-l">מלא = בוצע · מסגרת = מתוכנן · —  = עוד לא נבחר</p></div>`;
  }

  function render(app, st) {
    const { esc } = app, hasRun = !!app.state.run;
    const prog = T.weekProgress(app.state, st.today);

    const routines = Workouts.ROUTINES.map((r) => `<details class="card"><summary>${esc(r.name)} <small>${esc(r.total)}</small></summary>
      <p class="note-l">${esc(r.setup)}</p>
      <ol class="plain">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`).join('');

    const lib = Workouts.GROUPS.map((g) => `<h2 class="sub-h">${esc(g.name)}</h2>
      ${g.items.map((ex) => `<details class="card"><summary>${esc(ex.name)}</summary>
        <p class="note-l">${esc(ex.muscles)}</p>
        <ol class="plain">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>`).join('')}`).join('');

    return `<h1 class="page-h">אימונים</h1>
      ${quotaCard(app, prog)}
      ${hasRun && (st.phase === 'active' || st.phase === 'pending') ? todayCard(app, st) + weekStrip(app, prog, st) : ''}
      <h2 class="sub-h">שלושה אימוני 45 דקות מוכנים</h2>${routines}
      ${lib}`;
  }

  root.Views = root.Views || {};
  root.Views.workouts = { render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
