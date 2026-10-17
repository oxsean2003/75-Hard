// Plate-builder logic (pure, tested): which ingredients fit a meal, what is "missing at home",
// substitutes for a missing item, how a chosen plate reads, and whether it follows the plate formula.
// `state.pantryMissing` = ids of items the user marked as not available (default [] = everything at home).
(function (root) {
  'use strict';

  const { PARTS, ITEMS } = root.Ingredients;
  const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
  const PART_ORDER = PARTS.map((p) => p.id);

  // 'breakfast' -> items marked b/bm; 'lunch' / 'dinner' -> items marked m/bm
  const slotKey = (slotId) => (slotId === 'breakfast' ? 'b' : 'm');
  const inSlot = (item, slotId) => item.slots === 'bm' || item.slots === slotKey(slotId);
  const itemsFor = (part, slotId) => ITEMS.filter((i) => i.part === part && inSlot(i, slotId));

  const missingList = (state) => (Array.isArray(state.pantryMissing) ? state.pantryMissing : (state.pantryMissing = []));
  const isMissing = (state, id) => missingList(state).includes(id);
  const toggleMissing = (state, id) => {
    if (!BY_ID.has(id)) return false;
    const list = missingList(state), i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    return true;
  };
  const clearMissing = (state) => { state.pantryMissing = []; };

  // Substitutes when `id` isn't at home: same part and meal, still available, same family first.
  function swaps(state, id, slotId, limit) {
    const item = BY_ID.get(id);
    if (!item) return [];
    const pool = itemsFor(item.part, slotId).filter((i) => i.id !== id && !isMissing(state, i.id));
    const family = pool.filter((i) => i.grp === item.grp), others = pool.filter((i) => i.grp !== item.grp);
    return family.concat(others).slice(0, limit || 6);
  }

  // "ביצי עין + לחם מחמצת + מלפפון, עגבנייה + טחינה + זעתר": items in a part joined by ", ", parts by " + ".
  function compose(ids) {
    const chosen = ids.map((id) => BY_ID.get(id)).filter(Boolean);
    return PART_ORDER
      .map((part) => chosen.filter((i) => i.part === part).map((i) => i.name).join(', '))
      .filter(Boolean).join(' + ');
  }

  // The plate formula: a protein, a whole carb, and vegetables or a fat. `missing` = what to add.
  function completeness(ids) {
    const has = (parts) => ids.some((id) => { const i = BY_ID.get(id); return i && parts.includes(i.part); });
    const protein = has(['protein']), carb = has(['carb']), veg = has(['veg', 'fat']);
    const missing = [];
    if (!protein) missing.push('חלבון');
    if (!carb) missing.push('פחמימה');
    if (!veg) missing.push('ירקות');
    return { protein, carb, veg, complete: missing.length === 0, missing };
  }

  root.Plate = { PARTS, ITEMS, BY_ID, inSlot, itemsFor, isMissing, toggleMissing, clearMissing, swaps, compose, completeness };
})(typeof globalThis !== 'undefined' ? globalThis : this);
