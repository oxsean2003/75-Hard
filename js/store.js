// Persistence: state in localStorage (+ JSON export/import). Photos get their
// own IndexedDB store in photos.js. Every storage call is guarded: Safari can
// throw in private mode / when storage is full, and the app must still run.
(function (root) {
  'use strict';

  const KEY = '75hard:state';
  const CORRUPT_KEY = '75hard:state:corrupt';

  function load() {
    let raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { return { state: root.Day.newState(), error: 'unavailable' }; }
    if (!raw) return { state: root.Day.newState(), error: null };
    try {
      return { state: normalize(JSON.parse(raw)), error: null };
    } catch (e) {
      // Never silently overwrite unreadable data: keep the raw copy for recovery.
      try { root.localStorage.setItem(CORRUPT_KEY, raw); } catch (e2) { /* nothing more to do */ }
      return { state: root.Day.newState(), error: 'corrupt' };
    }
  }

  // Fill any fields missing from older saves so the rest of the app can rely on shape.
  function normalize(s) {
    if (!s || typeof s !== 'object' || s.v !== 1 || typeof s.days !== 'object') throw new Error('bad state');
    const base = root.Day.newState();
    const out = Object.assign(base, s);
    out.settings = Object.assign(base.settings, s.settings);
    out.settings.ruleNames = Object.assign(base.settings.ruleNames, (s.settings || {}).ruleNames);
    out.settings.reminders = Object.assign(base.settings.reminders, (s.settings || {}).reminders);
    out.measurements = Array.isArray(s.measurements) ? s.measurements : [];
    out.celebrated = Array.isArray(s.celebrated) ? s.celebrated : [];
    out.r3Log = Array.isArray(s.r3Log) ? s.r3Log : [];
    out.history = Array.isArray(s.history) ? s.history : [];
    Object.keys(out.days).forEach((k) => {
      const d = out.days[k];
      out.days[k] = Object.assign(root.Day.newDay(), d, {
        w1: Object.assign({ done: false, outdoor: false }, d.w1),
        w2: Object.assign({ done: false, outdoor: false }, d.w2)
      });
    });
    return out;
  }

  function save(state) {
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
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

  const api = { KEY, CORRUPT_KEY, load, save, normalize, exportJson, parseBackup, importJson, requestPersistence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Store = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
