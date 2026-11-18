// Home-workout timer logic (pure, tested; the clock is always passed in).
//   compile(plan)     -> flat, contiguous list of timed segments
//   positionAt(...)   -> where we are for a given elapsed time
//   run helpers       -> start / pause / resume / skip / back, all TIMESTAMP based, so the position is exact after
//                        the phone locks or the app is closed and reopened
//   cuesBetween(...)  -> which beeps/flashes are due between two moments (each exactly once, never a flood)
(function (root) {
  'use strict';

  const SEC = 1000;

  // ---------- compile ----------
  function compile(plan) {
    const segments = [];
    const sections = [];
    let t = 0;

    const push = (seg) => {
      const secs = Number(seg.secs);
      if (!(secs > 0)) return;                                  // zero-length rests simply don't exist
      const startMs = t; t += secs * SEC;
      segments.push(Object.assign({}, seg, { secs, startMs, endMs: t, index: segments.length }));
    };

    (plan.sections || []).forEach((sec, si) => {
      const sectionStart = t;
      if (sec.kind === 'block') {
        push({ kind: 'block', label: sec.name, secs: sec.secs, note: sec.note || '', section: si, round: 1, rounds: 1 });
      } else if (sec.kind === 'intervals') {
        for (let r = 1; r <= sec.repeat; r++) {
          push({ kind: 'work', label: (sec.work && sec.work.name) || sec.name, secs: sec.work.secs, note: sec.note || '', section: si, round: r, rounds: sec.repeat });
          if (r < sec.repeat) push({ kind: 'rest', label: 'מנוחה', secs: sec.rest && sec.rest.secs, note: '', section: si, round: r, rounds: sec.repeat });
        }
      } else {                                                   // circuit
        const rounds = sec.rounds || 1;
        for (let r = 1; r <= rounds; r++) {
          (sec.items || []).forEach((item, ii) => {
            const parts = item.parts && item.parts.length ? item.parts : [null];
            parts.forEach((part) => push({
              kind: 'work', label: part ? `${item.name} · ${part}` : item.name, secs: item.work,
              note: item.note || '', section: si, exercise: ii, round: r, rounds
            }));
            push({ kind: 'rest', label: 'מנוחה', secs: item.rest, note: '', section: si, exercise: ii, round: r, rounds });
          });
          if (r < rounds) push({ kind: 'roundRest', label: 'מנוחה בין סבבים', secs: sec.roundRest, note: '', section: si, round: r, rounds });
        }
      }
      sections.push({ name: sec.name, note: sec.note || '', index: si, startMs: sectionStart, endMs: t });
    });

    // a rest at the very end of the workout is dead time: drop it
    while (segments.length && segments[segments.length - 1].kind === 'rest') { const s = segments.pop(); t = s.startMs; }
    if (sections.length) sections[sections.length - 1].endMs = Math.min(sections[sections.length - 1].endMs, t);
    return { planId: plan.id, segments, sections, totalMs: t };
  }

  // ---------- position ----------
  // Segments are start-inclusive / end-exclusive. At or past the end: done.
  function positionAt(c, elapsedMs) {
    const total = c.totalMs;
    const e = Math.max(0, elapsedMs);
    if (!c.segments.length || e >= total) {
      return { index: c.segments.length, segment: null, intoMs: 0, remainingMs: 0, segmentMs: 0, totalMs: total, elapsedMs: Math.min(e, total), done: true };
    }
    let lo = 0, hi = c.segments.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c.segments[mid].startMs <= e) lo = mid; else hi = mid - 1; }
    const seg = c.segments[lo];
    return { index: lo, segment: seg, intoMs: e - seg.startMs, remainingMs: seg.endMs - e, segmentMs: seg.endMs - seg.startMs, totalMs: total, elapsedMs: e, done: false };
  }

  // ---------- the running workout ----------
  // run = { planId, startedAt, pausedAt: null | ms, pausedMs, skips: [[fromMs, toMs], ...], dayKey }
  // `skips` = ranges of the PLAN timeline that were skipped over and not (yet) replayed.
  const newRun = (planId, now, dayKey) => ({ planId, startedAt: now, pausedAt: null, pausedMs: 0, skips: [], dayKey: dayKey || null });
  const skippedMs = (run) => (run.skips || []).reduce((a, r) => a + Math.max(0, r[1] - r[0]), 0);
  const isPaused = (run) => run.pausedAt != null;
  const elapsed = (run, now) => (run.pausedAt != null ? run.pausedAt : now) - run.startedAt - run.pausedMs;

  function pause(run, now) { if (run.pausedAt == null) run.pausedAt = now; return run; }
  function resume(run, now) {
    if (run.pausedAt != null) { run.pausedMs += Math.max(0, now - run.pausedAt); run.pausedAt = null; }
    return run;
  }
  // Move the position to `targetElapsed` without touching pause state.
  function seek(run, now, targetElapsed) {
    const ref = run.pausedAt != null ? run.pausedAt : now;
    run.startedAt = ref - run.pausedMs - targetElapsed;
    return run;
  }
  // Skip to the start of the next segment (or finish). The skipped remainder is not credited.
  function skip(c, run, now) {
    const pos = positionAt(c, elapsed(run, now));
    if (pos.done) return false;
    (run.skips || (run.skips = [])).push([pos.elapsedMs, pos.segment.endMs]);
    seek(run, now, pos.segment.endMs);
    return true;
  }
  // Back: restart the current segment, or (in its first 2 s) go to the previous one.
  function back(c, run, now) {
    const pos = positionAt(c, elapsed(run, now));
    let target;
    if (pos.done) target = c.segments.length ? c.segments[c.segments.length - 1].startMs : 0;
    else if (pos.intoMs > 2 * SEC || pos.index === 0) target = pos.segment.startMs;
    else target = c.segments[pos.index - 1].startMs;
    // going back means replaying from `target` on: whatever was skipped from there onwards is no longer skipped
    run.skips = (run.skips || []).filter((r) => r[0] < target).map((r) => [r[0], Math.min(r[1], target)]);
    seek(run, now, target);
    return true;
  }
  // Minutes a FINISHED plan logs as: the planned time minus anything skipped (pauses don't reduce it), rounded to the
  // NEAREST minute - flooring made a plan with a few skipped seconds (a skip tapped near the end of a rest) log 44.
  const creditedMin = (c, run) => Math.round(Math.max(0, c.totalMs - skippedMs(run)) / 60000);

  // ---------- cues ----------
  // What is due between two elapsed times. Crossing a segment boundary -> ONE 'change' (the segment we are in now),
  // even if frames were missed; 'done' once at the end; otherwise at most one 3-2-1 'tick' of the current segment.
  function cuesBetween(c, prev, now) {
    if (!(now > prev) || !c.segments.length) return [];
    const out = [];
    const total = c.totalMs;
    if (now >= total) { if (prev < total) out.push({ type: 'done' }); return out; }
    const pos = positionAt(c, now);
    const crossed = c.segments.some((s) => s.startMs > prev && s.startMs <= now);
    if (crossed) { out.push({ type: 'change', index: pos.index }); return out; }
    for (const n of [1, 2, 3]) {                                   // latest tick first
      const at = pos.segment.endMs - n * SEC;
      if (at > pos.segment.startMs && prev < at && at <= now) { out.push({ type: 'tick', n }); break; }
    }
    return out;
  }

  // Log a FINISHED plan as one of today's two workouts. Refuses a slot that is already done or has its own timer
  // running, and (through Day.setWorkout) a closed day / another day. Real start/end times are stored, so the
  // existing 3-hour gap rule still applies.
  function logWorkout(state, dayKey, now, slotId, plan, c, run) {
    const D = root.Day;
    const slot = state.days[dayKey] && state.days[dayKey][slotId];
    if (slot && slot.done) return false;
    if (state.timer && state.timer.id === slotId && state.timer.dayKey === dayKey) return false;
    return D.setWorkout(state, dayKey, now, slotId, {
      done: true, outdoor: false, startedAt: run.startedAt, min: creditedMin(c, run), cat: plan.cat, plan: plan.name,
      endedAt: Math.min(now, run.startedAt + (run.pausedMs || 0) + c.totalMs)       // when the plan actually ended (logging may come later)
    });
  }

  // ---------- persistence guard ----------
  function validRun(run) {
    return !!run && typeof run === 'object' && typeof run.planId === 'string'
      && Number.isFinite(run.startedAt) && Number.isFinite(run.pausedMs) && run.pausedMs >= 0
      && (run.pausedAt === null || Number.isFinite(run.pausedAt))
      && (run.skips === undefined || (Array.isArray(run.skips) && run.skips.every((r) => Array.isArray(r) && r.length === 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] >= r[0])));
  }

  root.HomeWorkout = { SEC, compile, positionAt, newRun, skippedMs, isPaused, elapsed, pause, resume, seek, skip, back, creditedMin, cuesBetween, logWorkout, validRun };
})(typeof globalThis !== 'undefined' ? globalThis : this);
