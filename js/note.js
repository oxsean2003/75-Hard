// Sticky-note graphic: a note being pulled off a wall, showing the countdown number
// (day 1 finished -> 75 ... day 75 finished -> 1). Drawn as inline SVG so it stays crisp,
// animates with CSS and needs no image files. Also owns the full-screen "day done" moment
// and the wall of mini notes in Progress.
(function (root) {
  'use strict';

  let uid = 0;   // SVG gradient/filter ids must be unique per instance (the wall has many)

  // Deterministic little tilt per number (-3..3 deg) so the wall looks hand-stuck, not gridded.
  const tilt = (n) => ((Number(n) * 37) % 7) - 3;

  // n: number on the note. o: { dayNumber, animate, caption, rot }
  function svg(n, o) {
    o = o || {};
    const num = Math.max(0, Math.floor(Number(n)) || 0);
    const id = 'nt' + (++uid);
    const rot = typeof o.rot === 'number' ? o.rot : -3;
    const label = o.dayNumber ? `יום ${Math.floor(Number(o.dayNumber))} הושלם` : '';
    // Geometry (300x330 box): note 200x200 at (50,60). Bottom-right corner is peeled: cut A-B,
    // and the folded-over flap is the corner C reflected across the cut -> triangle A,B,C'.
    return `<svg class="note-svg${o.animate ? ' note-anim' : ''}" viewBox="0 0 300 330" style="--r:${rot}deg"
        role="img" aria-label="פתק ${num}${label ? ' — ' + label : ''}">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe873"/><stop offset="1" stop-color="#ffd23f"/></linearGradient>
        <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b216"/><stop offset="1" stop-color="#ffe873" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}f" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff8cf"/><stop offset="1" stop-color="#eccd4c"/></linearGradient>
        <filter id="${id}s" x="-25%" y="-25%" width="150%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
      </defs>
      <g class="nbody">
        <polygon class="nshadow" points="64,82 264,82 264,222 204,282 64,282" fill="#1b140a" opacity=".32" filter="url(#${id}s)"/>
        <polygon points="50,60 250,60 250,200 190,260 50,260" fill="url(#${id}b)"/>
        <rect x="50" y="60" width="200" height="26" fill="url(#${id}t)"/>
        <text class="nnum" x="150" y="${num >= 10 ? 188 : 192}" text-anchor="middle" font-size="${num >= 10 ? 118 : 132}" fill="#2a2823">${num}</text>
        ${o.caption !== false && label ? `<text class="ncap" x="132" y="238" text-anchor="middle" font-size="15" fill="#6b5a10">${label}</text>` : ''}
        <polygon class="nflap" points="250,200 190,260 190,200" fill="url(#${id}f)"/>
        <line x1="250" y1="200" x2="190" y2="260" stroke="#a88a10" stroke-opacity=".55" stroke-width="1.5"/>
      </g>
    </svg>`;
  }

  // ---- full-screen moment (after "end my day") and viewing a note from the wall ----
  const msgFor = (n) => (n <= 1 ? 'הפתק האחרון. סיימתם את האתגר.' : `נשארו עוד ${n - 1} ימים`);

  function openToday(app, info) {
    app.modal(`<div class="note-stage">${svg(info.n, { dayNumber: info.dayNumber, animate: true })}
      <p class="note-msg">${msgFor(info.n)}</p>
      <div class="btns"><button class="btn primary big" data-act="noteOk" data-ids="${info.ids.join(',')}">המשך</button></div></div>`,
      'note', 'note-bg');
  }

  function openView(app, n, dayNumber) {
    app.modal(`<div class="note-stage">${svg(n, { dayNumber, animate: true })}
      <p class="note-msg">${msgFor(n)}</p>
      <div class="btns"><button class="btn big" data-act="closeModal">סגירה</button></div></div>`, 'note-view', 'note-bg');
  }

  // Progress tab: one mini note per completed day, newest first.
  function wallHtml(app) {
    const notes = Day.completedNotes(app.state).reverse();
    if (!notes.length) {
      return '<section class="group"><h2>קיר הפתקים</h2><p class="note-l">כל יום שתסיימו יוסיף לכאן פתק.</p></section>';
    }
    return `<section class="group"><h2>קיר הפתקים · ${notes.length}</h2><div class="wall">${notes.map((d) =>
      `<button class="mini-note" data-act="viewNote" data-n="${d.n}" data-day="${d.dayNumber}" aria-label="פתק ${d.n}, יום ${d.dayNumber}">${svg(d.n, { caption: false, rot: tilt(d.n) })}</button>`).join('')}</div></section>`;
  }

  function wire(app) {
    app.act('noteOk', (el) => {
      Day.markNotesShown(app.state, String(el.dataset.ids || '').split(',').filter(Boolean));
      app.commit(); app.closeModal(); app.render();      // render: a milestone dialog may follow
    });
    app.act('viewNote', (el) => openView(app, Number(el.dataset.n), Number(el.dataset.day)));
  }

  root.Note = { svg, tilt };
  root.Views = root.Views || {};
  root.Views.note = { openToday, openView, wallHtml, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
