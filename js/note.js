// Sticky-note graphic: a note being pulled off a wall, showing the countdown number
// (day 1 finished -> 75 ... day 75 finished -> 1). Drawn as inline SVG so it stays crisp,
// animates with CSS and needs no image files. Also owns the full-screen "day done" show
// (random pastel colour, fireworks, the note swinging like it's about to fall - then falling)
// and the wall of mini notes in Progress.
(function (root) {
  'use strict';

  let uid = 0;   // SVG gradient/filter ids must be unique per instance (the wall has many)

  // Show timeline (ms). The CSS reads --fall-at from the SVG, so CSS and the fireworks timers can't drift apart.
  const TIMING = { peel: 450, wobbleAt: 1000, fallAt: 3900 };

  // Classic sticky-note colours. Each has the gradient stops, adhesive band, folded-flap and caption colours.
  const PALETTE = [
    { id: 'yellow', top: '#ffe873', bottom: '#ffd23f', band: '#e2b216', flapA: '#fff8cf', flapB: '#eccd4c', fold: '#a88a10', cap: '#6b5a10' },
    { id: 'pink',   top: '#ffc2d8', bottom: '#ff94bb', band: '#e5659a', flapA: '#ffe6f0', flapB: '#f6a8c8', fold: '#b8456f', cap: '#7a2848' },
    { id: 'blue',   top: '#b3e0ff', bottom: '#78c2f7', band: '#4f9fd8', flapA: '#e4f4ff', flapB: '#a2d0f2', fold: '#2f77a8', cap: '#1d4a6b' },
    { id: 'green',  top: '#c1f3b9', bottom: '#8ade80', band: '#5fbd55', flapA: '#e9fbe4', flapB: '#ace4a2', fold: '#3b8a33', cap: '#245a1f' },
    { id: 'orange', top: '#ffd4a3', bottom: '#ffb166', band: '#e68a2e', flapA: '#ffeedb', flapB: '#f6c48f', fold: '#b3601a', cap: '#7a4010' },
    { id: 'purple', top: '#e0ceff', bottom: '#bf9cf7', band: '#9468d6', flapA: '#f2e9ff', flapB: '#d1b8f4', fold: '#6b43ad', cap: '#43286f' },
    { id: 'mint',   top: '#baf5e6', bottom: '#85e1cb', band: '#50c0a6', flapA: '#e3fbf6', flapB: '#a6ead9', fold: '#2f8f78', cap: '#1c5c4d' }
  ];

  // A stable "random" colour per day: the big note and its mini on the wall always match.
  // Never the same colour two days in a row.
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const seqCache = {};
  function colorIndex(attempt, dayNumber) {
    const day = Math.max(1, Math.floor(Number(dayNumber)) || 1);
    const seq = seqCache[attempt] || (seqCache[attempt] = []);
    for (let d = seq.length + 1; d <= day; d++) {
      let i = hash(`${attempt}:${d}`) % PALETTE.length;
      if (d > 1 && i === seq[d - 2]) i = (i + 1 + (hash(`x${attempt}:${d}`) % (PALETTE.length - 1))) % PALETTE.length;
      seq.push(i);
    }
    return seq[day - 1];
  }

  // Deterministic little tilt per number (-3..3 deg) so the wall looks hand-stuck, not gridded.
  const tilt = (n) => ((Number(n) * 37) % 7) - 3;

  // n: number on the note. o: { dayNumber, color (palette index), mode: 'show' | 'calm', caption, rot }
  function svg(n, o) {
    o = o || {};
    const num = Math.max(0, Math.floor(Number(n)) || 0);
    const id = 'nt' + (++uid);
    const rot = typeof o.rot === 'number' ? o.rot : -3;
    const P = PALETTE[(o.color || 0) % PALETTE.length];
    const label = o.dayNumber ? `יום ${Math.floor(Number(o.dayNumber))} הושלם` : '';
    const cls = o.mode === 'show' ? ' note-anim' : o.mode === 'calm' ? ' note-calm' : '';
    // Geometry (300x330 box): note 200x200 at (50,60). Bottom-right corner is peeled: cut A-B,
    // and the folded-over flap is the corner C reflected across the cut -> triangle A,B,C'.
    return `<svg class="note-svg${cls}" viewBox="0 0 300 330" style="--r:${rot}deg;--fall-at:${TIMING.fallAt}ms;--wob-at:${TIMING.wobbleAt}ms"
        role="img" aria-label="פתק ${num}${label ? ' — ' + label : ''}">
      <defs>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.top}"/><stop offset="1" stop-color="${P.bottom}"/></linearGradient>
        <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.band}"/><stop offset="1" stop-color="${P.top}" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}f" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${P.flapA}"/><stop offset="1" stop-color="${P.flapB}"/></linearGradient>
        <filter id="${id}s" x="-25%" y="-25%" width="150%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
      </defs>
      <g class="nfall"><g class="nbody">
        <polygon class="nshadow" points="64,82 264,82 264,222 204,282 64,282" fill="#1b140a" opacity=".32" filter="url(#${id}s)"/>
        <polygon points="50,60 250,60 250,200 190,260 50,260" fill="url(#${id}b)"/>
        <rect x="50" y="60" width="200" height="26" fill="url(#${id}t)"/>
        <text class="nnum" x="150" y="${num >= 10 ? 188 : 192}" text-anchor="middle" font-size="${num >= 10 ? 118 : 132}" fill="#2a2823">${num}</text>
        ${o.caption !== false && label ? `<text class="ncap" x="132" y="238" text-anchor="middle" font-size="15" fill="${P.cap}">${label}</text>` : ''}
        <polygon class="nflap" points="250,200 190,260 190,200" fill="url(#${id}f)"/>
        <line x1="250" y1="200" x2="190" y2="260" stroke="${P.fold}" stroke-opacity=".55" stroke-width="1.5"/>
      </g></g>
    </svg>`;
  }

  // ---- full-screen show (after "end my day") ----
  const msgFor = (n) => (n <= 1 ? 'פתק 1 ירד מהקיר. סיימתם את האתגר.' : `פתק ${n} ירד מהקיר · נשארו עוד ${n - 1} ימים`);
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Fireworks: a small pop as the note peels, rockets + a burst when it falls.
  function startFireworks(app, svgEl) {
    const modal = document.getElementById('modal');
    if (!modal || !svgEl || !root.Fireworks || reducedMotion()) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'fx';
    modal.appendChild(canvas);
    const fx = root.Fireworks.start(canvas);
    const alive = () => canvas.isConnected && app.modalKind === 'note';
    const noteCenter = () => {
      const r = svgEl.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      return { x: r.left + r.width / 2 - c.left, y: r.top + r.height * 0.45 - c.top };
    };
    setTimeout(() => { if (alive()) { const p = noteCenter(); fx.burst(p.x, p.y, 34, 5); } }, TIMING.peel);
    setTimeout(() => { if (alive()) { const p = noteCenter(); fx.burst(p.x, p.y, 30, 4.5); } }, TIMING.fallAt);
    [[0.18, 0.3, 0.2], [0.5, 0.18, 0.5], [0.82, 0.3, 0.8]].forEach(([tx, ty, sx], i) => {
      setTimeout(() => {
        if (!alive()) return;
        const { W, H } = fx.size();
        fx.rocket(W * sx, H, W * tx, H * ty, 64, 6.5);
      }, TIMING.fallAt - 150 + i * 230);
    });
  }

  function openToday(app, info) {
    const idx = colorIndex(app.state.run ? app.state.run.attempt : 1, info.dayNumber);
    app.modal(`<div class="note-stage show" style="--fall-at:${TIMING.fallAt}ms">${svg(info.n, { dayNumber: info.dayNumber, color: idx, mode: 'show' })}
      <p class="note-msg">${msgFor(info.n)}</p>
      <div class="btns"><button class="btn primary big" data-act="noteOk" data-ids="${info.ids.join(',')}">המשך</button></div></div>`,
      'note', 'note-bg');
    startFireworks(app, document.querySelector('#modal .note-svg'));
  }

  // Tapping a mini note on the wall: a calm look (it stays on screen), no fireworks, no fall.
  function openView(app, n, dayNumber) {
    const idx = colorIndex(app.state.run ? app.state.run.attempt : 1, dayNumber);
    app.modal(`<div class="note-stage">${svg(n, { dayNumber, color: idx, mode: 'calm' })}
      <p class="note-msg">${n <= 1 ? 'הפתק האחרון.' : `נשארו עוד ${n - 1} ימים`}</p>
      <div class="btns"><button class="btn big" data-act="closeModal">סגירה</button></div></div>`, 'note-view', 'note-bg');
  }

  // Progress tab: one mini note per completed day, newest first, each in its own colour.
  function wallHtml(app) {
    const notes = Day.completedNotes(app.state).reverse();
    if (!notes.length) {
      return '<section class="group"><h2>קיר הפתקים</h2><p class="note-l">כל יום שתסיימו יוסיף לכאן פתק.</p></section>';
    }
    const attempt = app.state.run ? app.state.run.attempt : 1;
    return `<section class="group"><h2>קיר הפתקים · ${notes.length}</h2><div class="wall">${notes.map((d) =>
      `<button class="mini-note" data-act="viewNote" data-n="${d.n}" data-day="${d.dayNumber}" aria-label="פתק ${d.n}, יום ${d.dayNumber}">${svg(d.n, { caption: false, rot: tilt(d.n), color: colorIndex(attempt, d.dayNumber) })}</button>`).join('')}</div></section>`;
  }

  function wire(app) {
    app.act('noteOk', (el) => {
      Day.markNotesShown(app.state, String(el.dataset.ids || '').split(',').filter(Boolean));
      app.commit(); app.closeModal(); app.render();      // render: a milestone dialog may follow
    });
    app.act('viewNote', (el) => openView(app, Number(el.dataset.n), Number(el.dataset.day)));
  }

  root.Note = { svg, tilt, PALETTE, colorIndex, TIMING };
  root.Views = root.Views || {};
  root.Views.note = { openToday, openView, wallHtml, wire };
})(typeof globalThis !== 'undefined' ? globalThis : this);
