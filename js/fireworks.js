// Fireworks: sparks that fly out of a point, plus rockets that launch from the bottom and explode.
// Physics is pure (createParticles / step) so it can be tested; start() adds the canvas loop.
(function (root) {
  'use strict';

  const COLORS = ['#ff4d6d', '#ffd23f', '#3ddc84', '#4aa8ff', '#b78cff', '#ff8a4c', '#ffffff', '#40e0d0'];

  // `rand` is injectable for tests. Speeds are px per 60fps frame.
  function createParticles(x, y, count, power, rand) {
    const r = rand || Math.random, out = [];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, sp = (0.35 + r() * 0.85) * power;
      out.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 45 + r() * 55,
        size: 1.6 + r() * 2.2, color: COLORS[Math.floor(r() * COLORS.length)] });
    }
    return out;
  }

  // Advance one particle by dt frames; false once it has expired.
  function step(p, dt) {
    p.px = p.x; p.py = p.y;
    if (p.rocket) {                                    // straight flight to the target, no gravity
      p.x += p.vx * dt; p.y += p.vy * dt;
    } else {
      const drag = Math.pow(0.985, dt);
      p.vx *= drag; p.vy = p.vy * drag + 0.12 * dt;     // friction + gravity
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    p.life += dt;
    return p.life < p.max;
  }

  function start(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0, last = 0, stopped = false;
    const parts = [];

    function resize() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const kick = () => { if (!raf && !stopped) raf = root.requestAnimationFrame(tick); };

    function burst(x, y, count, power) { createParticles(x, y, count, power || 5).forEach((p) => parts.push(p)); kick(); }

    // A rocket flies from (x0,y0) to (x1,y1) in ~26 frames, then explodes into `count` sparks.
    function rocket(x0, y0, x1, y1, count, power) {
      const frames = 26;
      parts.push({ x: x0, y: y0, px: x0, py: y0, vx: (x1 - x0) / frames, vy: (y1 - y0) / frames, life: 0, max: frames,
        size: 2.4, color: '#ffffff', rocket: { x: x1, y: y1, count, power } });
      kick();
    }

    function tick(ts) {
      raf = 0;
      if (stopped || !canvas.isConnected) { stop(); return; }
      const dt = last ? Math.min(3, (ts - last) / 16.7) : 1;
      last = ts;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (!step(p, dt)) {
          parts.splice(i, 1);
          if (p.rocket) burst(p.rocket.x, p.rocket.y, p.rocket.count, p.rocket.power);   // explode at the target
          continue;
        }
        ctx.globalAlpha = p.rocket ? 0.9 : Math.max(0, 1 - p.life / p.max);
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (parts.length) raf = root.requestAnimationFrame(tick); else { last = 0; ctx.clearRect(0, 0, W, H); }
    }

    function stop() { stopped = true; if (raf) root.cancelAnimationFrame(raf); raf = 0; parts.length = 0; }

    return { burst, rocket, stop, size: () => ({ W, H }), active: () => parts.length };
  }

  root.Fireworks = { COLORS, createParticles, step, start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
