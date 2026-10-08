// Persistence: state in localStorage (+ JSON export/import). Photos get their
// own IndexedDB store in photos.js. Every storage call is guarded: Safari can
// throw in private mode / when storage is full, and the app must still run.
(function (root) {
  'use strict';

  const KEY = '75hard:state';
  const CORRUPT_KEY = '75hard:state:corrupt';

  // Storage backend. Tests inject an in-memory stand-in (useBackend) so they can never
  // read, overwrite or delete the real save — the test page is served from the same origin.
  let backend = null;
  const ls = () => backend || root.localStorage;
  const useBackend = (b) => { backend = b || null; };

  function load() {
    let raw = null;
    try { raw = ls().getItem(KEY); } catch (e) { return { state: root.Day.newState(), error: 'unavailable' }; }
    if (!raw) return { state: root.Day.newState(), error: null };
    try {
      return { state: normalize(JSON.parse(raw)), error: null };
    } catch (e) {
      // Never silently overwrite unreadable data: keep the raw copy for recovery.
      try { ls().setItem(CORRUPT_KEY, raw); } catch (e2) { /* nothing more to do */ }
      return { state: root.Day.newState(), error: 'corrupt' };
    }
  }

  // Fill any fields missing from older saves so the rest of the app can rely on shape.
  function normalize(s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || typeof s.days !== 'object') throw new Error('bad state');
    // `defaults` stays pristine: merging INTO it (not into the saved objects) is what makes
    // settings added in later versions appear on older saves.
    const defaults = root.Day.newState().settings, saved = s.settings || {};
    const out = Object.assign(root.Day.newState(), s);
    out.settings = Object.assign({}, defaults, saved);
    out.settings.ruleNames = Object.assign({}, defaults.ruleNames, saved.ruleNames);
    out.settings.reminders = Object.assign({}, defaults.reminders, saved.reminders);
    out.settings.weekPlan = Array.isArray(saved.weekPlan) && saved.weekPlan.length === 7 ? saved.weekPlan : defaults.weekPlan;
    out.measurements = Array.isArray(s.measurements) ? s.measurements : [];
    out.celebrated = Array.isArray(s.celebrated) ? s.celebrated : [];
    delete out.r3Log;                                   // weekly rule was removed
    out.history = Array.isArray(s.history) ? s.history : [];
    Object.keys(out.days).forEach((k) => {
      const d = out.days[k];
      // Older saves tracked pages/book/takeaway and many "kept" checkboxes; reading is now
      // just a checkmark (carry over a finished day), the rest is ignored.
      const read = typeof d.read === 'boolean' ? d.read : Number(d.pages) >= 10;
      out.days[k] = Object.assign(root.Day.newDay(), d, {
        read,
        w1: Object.assign({ done: false, outdoor: false }, d.w1),
        w2: Object.assign({ done: false, outdoor: false }, d.w2)
      });
      ['pages', 'book', 'takeaway'].forEach((f) => { delete out.days[k][f]; });
    });
    return out;
  }

  function save(state) {
    try { ls().setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  const exportJson = (state) => JSON.stringify({ app: '75hard', exportedAt: Date.now(), state }, null, 2);

  // Backup file -> { state, photos } (photos = { dayKey: dataURL } for full backups, else {}).
  function parseBackup(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.app !== '75hard') throw new Error('not a 75hard backup');
    return { state: normalize(parsed.state), photos: parsed.photos && typeof parsed.photos === 'object' ? parsed.photos : {} };
  }
  const importJson = (text) => parseBackup(text).state;

  // Ask the browser not to evict our data under storage pressure (best effort).
  function requestPersistence() {
    try { return root.navigator.storage && root.navigator.storage.persist ? root.navigator.storage.persist() : Promise.resolve(false); }
    catch (e) { return Promise.resolve(false); }
  }

  const api = { KEY, CORRUPT_KEY, useBackend, load, save, normalize, exportJson, parseBackup, importJson, requestPersistence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Store = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
