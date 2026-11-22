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
  const allows = (th, mins) => !!th && !!TIMING[mins] && (th.mins || [10, 15]).includes(Number(mins));
  const slotsFor = (block) => theme(block.theme).slots.slice(0, TIMING[block.mins].slots);
  const pickIndex = (n, rng) => Math.min(n - 1, Math.floor(rng() * n));

  function newBlock(themeId, mins, rng) {
    if (!allows(theme(themeId), mins)) return null;
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
    const mains = draft.blocks.filter((b) => theme(b.theme).role === 'main');
    (mains.length ? mains : draft.blocks).forEach((b) => { const c = theme(b.theme).cat; tally.set(c, (tally.get(c) || 0) + b.mins); });
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
      if (!b || !allows(theme(b.theme), b.mins)) return;
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

  // ---------- the suggestion ----------
  // A 45-minute workout in the order the research favours (see the "why" text in the builder):
  //   warm-up 10  ->  main A 15 (the priority, done while fresh)  ->  main B 10 (different muscles, core last)  ->  easy finish 10.
  // preferCat: the weekly-quota category this slot should serve ('str_up' -> push/pull lead, 'str_low' -> legs lead).
  // avoid: theme ids to not lead with again (e.g. last time's), when there is an alternative.
  const pick = (arr, rng) => arr[pickIndex(arr.length, rng)];
  function suggest(rng, opts) {
    const o = opts || {};
    let leads = ['push', 'pull', 'legs'];
    if (o.preferCat === 'str_up') leads = ['push', 'pull'];
    else if (o.preferCat === 'str_low') leads = ['legs'];
    const fresh = leads.filter((t) => !(o.avoid || []).includes(t));
    const a = pick(fresh.length ? fresh : leads, rng);
    const seconds = { push: ['pull', 'core'], pull: ['push', 'core'], legs: ['push', 'pull', 'core'] }[a];
    const b = pick(seconds, rng);
    return { blocks: [['warmup', 10], [a, 15], [b, 10], ['cooldown', 10]].map(([t, m]) => newBlock(t, m, rng)) };
  }

  // Plain-language hints about a draft's order (empty = it follows the recommended shape). Pure.
  function advice(draft) {
    const bl = (draft && draft.blocks) || [], out = [];
    if (!bl.length) return out;
    const th = bl.map((b) => theme(b.theme));
    if (th[0].role !== 'warmup') out.push('אין חימום בהתחלה: כדאי להתחיל בבלוק חימום.');
    const last = th[th.length - 1];
    if (last.role !== 'cooldown' && last.group !== 'recovery') out.push('האימון לא מסתיים בבלוק קליל: כדאי לסיים בסיום קליל או במוביליטי.');
    for (let i = 1; i < th.length; i++) {
      if (th[i].role === 'main' && th[i - 1].role === 'main' && th[i].group === th[i - 1].group) out.push('שני בלוקים ברצף על אותה קבוצת שרירים: עדיף להחליף (דחיפה/משיכה, גוף עליון/תחתון).');
    }
    const coreAt = th.findIndex((t) => t.group === 'core');
    if (coreAt >= 0 && th.some((t, i) => i > coreAt && ['push', 'pull', 'lower'].includes(t.group))) out.push('בלוק ליבה לפני בלוק כוח: עדיף ליבה אחרי הכוח, כדי לא לעייף את המייצבים.');
    if (th.some((t, i) => t.role === 'cooldown' && i < th.length - 1)) out.push('בלוק סיום קליל באמצע האימון: מקומו בסוף.');
    if (th.some((t, i) => t.role === 'warmup' && i > 0)) out.push('בלוק חימום לא בהתחלה: מקומו בראש האימון.');
    const total = totalMin(draft);
    if (total !== TARGET_MIN) out.push(total < TARGET_MIN ? `חסרות ${TARGET_MIN - total} דקות ל-45.` : `${total - TARGET_MIN} דקות מעל 45.`);
    return out;
  }

  root.HomeBlocks = { suggest, advice, allows, TIMING, THEMES, MAX_BLOCKS, TARGET_MIN, CUSTOM_ID, theme, slotsFor, newBlock, reroll, shuffleBlock, shuffleAll, setPick, toggleLock, totalMin, catOf, buildPlan, fix };
})(typeof globalThis !== 'undefined' ? globalThis : this);
