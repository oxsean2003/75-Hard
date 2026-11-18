// "Build your own" home workout (pure, tested; randomness is passed in as `rng`).
// A draft = { blocks: [{ theme, mins: 10|15, picks: [optionIndex per slot], locks: [bool per slot] }] }.
// buildPlan(draft) turns it into an ordinary plan object (same shape as data/home-plans.he.js), so the normal
// player / timer / logging work on it unchanged. See data/home-blocks.he.js for the fixed timings.
(function (root) {
  'use strict';

  const Data = root.HomeBlockData, TIMING = Data.TIMING, THEMES = Data.THEMES;
  const MAX_BLOCKS = 8, TARGET_MIN = 45;
  const CUSTOM_ID = 'custom';

  const theme = (id) => THEMES.find((t) => t.id === id) || null;
  const slotsFor = (block) => theme(block.theme).slots.slice(0, TIMING[block.mins].slots);
  const pickIndex = (n, rng) => Math.min(n - 1, Math.floor(rng() * n));

  function newBlock(themeId, mins, rng) {
    if (!theme(themeId) || !TIMING[mins]) return null;
    const b = { theme: themeId, mins: Number(mins), picks: [], locks: [] };
    slotsFor(b).forEach((s) => { b.picks.push(pickIndex(s.options.length, rng)); b.locks.push(false); });
    return b;
  }

  // A different option for one slot (never the current one). Returns false when locked / nothing else to pick.
  function reroll(block, slotIdx, rng) {
    const s = slotsFor(block)[slotIdx];
    if (!s || block.locks[slotIdx] || s.options.length < 2) return false;
    const others = s.options.map((_, i) => i).filter((i) => i !== block.picks[slotIdx]);
    block.picks[slotIdx] = others[pickIndex(others.length, rng)];
    return true;
  }
  const shuffleBlock = (block, rng) => slotsFor(block).forEach((_, i) => reroll(block, i, rng));
  const shuffleAll = (draft, rng) => draft.blocks.forEach((b) => shuffleBlock(b, rng));

  function setPick(block, slotIdx, optionIdx) {
    const s = slotsFor(block)[slotIdx];
    if (!s || !(optionIdx >= 0 && optionIdx < s.options.length) || block.locks[slotIdx]) return false;
    block.picks[slotIdx] = optionIdx;
    return true;
  }
  function toggleLock(block, slotIdx) {
    if (!slotsFor(block)[slotIdx]) return false;
    block.locks[slotIdx] = !block.locks[slotIdx];
    return true;
  }

  const totalMin = (draft) => draft.blocks.reduce((a, b) => a + b.mins, 0);

  // The weekly-quota category a finished custom workout is logged under: the one with the most minutes (ties: first block's).
  function catOf(draft) {
    const tally = new Map();
    draft.blocks.forEach((b) => { const c = theme(b.theme).cat; tally.set(c, (tally.get(c) || 0) + b.mins); });
    let best = null, bestMin = -1;
    tally.forEach((m, c) => { if (m > bestMin) { best = c; bestMin = m; } });
    return best;
  }

  function buildPlan(draft) {
    const blocks = (draft && draft.blocks) || [];
    const names = [];
    blocks.forEach((b) => { const n = theme(b.theme).name.split(':')[0]; if (!names.includes(n)) names.push(n); });
    const sections = blocks.map((b, bi) => {
      const T = TIMING[b.mins], th = theme(b.theme), slots = slotsFor(b);
      const items = slots.map((s, si) => {
        const opt = s.options[b.picks[si]];
        return { name: opt.name, work: T.work, rest: si === slots.length - 1 ? 0 : T.rest, note: opt.note };
      });
      return {
        name: `בלוק ${bi + 1}: ${th.name} · ${b.mins} דק׳`, kind: 'circuit', rounds: T.rounds, roundRest: T.roundRest, items,
        note: `${T.rounds} סבבים, ${T.work} שנ׳ עבודה, ${T.roundRest} שנ׳ מנוחה בין סבבים.`
      };
    });
    return {
      id: CUSTOM_ID, name: names.length ? 'אימון מותאם: ' + names.join(' + ') : 'אימון מותאם',
      cat: blocks.length ? catOf(draft) : 'str_up',
      note: 'נבנה מבלוקים של 10 ו-15 דקות.', sections
    };
  }

  // Clean a draft read from storage / a backup: unknown themes or lengths are dropped, picks clamped, locks booleans.
  function fix(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.blocks)) return null;
    const blocks = [];
    d.blocks.slice(0, MAX_BLOCKS).forEach((b) => {
      if (!b || !theme(b.theme) || !TIMING[b.mins]) return;
      const out = { theme: b.theme, mins: Number(b.mins), picks: [], locks: [] };
      slotsFor(out).forEach((s, i) => {
        const p = Array.isArray(b.picks) ? b.picks[i] : 0;
        out.picks.push(Number.isInteger(p) && p >= 0 && p < s.options.length ? p : 0);
        out.locks.push(Array.isArray(b.locks) ? b.locks[i] === true : false);
      });
      blocks.push(out);
    });
    return { blocks };
  }

  root.HomeBlocks = { TIMING, THEMES, MAX_BLOCKS, TARGET_MIN, CUSTOM_ID, theme, slotsFor, newBlock, reroll, shuffleBlock, shuffleAll, setPick, toggleLock, totalMin, catOf, buildPlan, fix };
})(typeof globalThis !== 'undefined' ? globalThis : this);
