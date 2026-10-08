// Progress photos in IndexedDB, keyed by day key ('YYYY-MM-DD'). Photos are
// downscaled to JPEG before saving so a 75-day run stays small on the phone.
(function (root) {
  'use strict';

  const DB = '75hard-photos';
  const STORE = 'photos';
  const MAX_EDGE = 1600;

  function open() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = root.indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(r && r.result); };
      t.onerror = () => { db.close(); reject(t.error); };
      t.onabort = () => { db.close(); reject(t.error); };
    }));
  }

  const put = (key, blob) => tx('readwrite', (s) => s.put(blob, key));
  const get = (key) => tx('readonly', (s) => s.get(key));
  const remove = (key) => tx('readwrite', (s) => s.delete(key));
  const urlCache = {};
  function url(key) {
    if (urlCache[key]) return Promise.resolve(urlCache[key]);
    return get(key).then((b) => {
      if (!b) return null;
      if (!urlCache[key]) urlCache[key] = root.URL.createObjectURL(b);
      return urlCache[key];
    });
  }
  function dropUrl(key) { if (urlCache[key]) { root.URL.revokeObjectURL(urlCache[key]); delete urlCache[key]; } }
  const clearAll = () => tx('readwrite', (s) => s.clear()).then(() => Object.keys(urlCache).forEach(dropUrl));
  const keys = () => tx('readonly', (s) => s.getAllKeys()).then((k) => k || []);

  // File -> downscaled JPEG Blob. Honors EXIF orientation via createImageBitmap.
  async function downscale(file) {
    const bmp = await root.createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = root.document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return new Promise((resolve, reject) => canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85));
  }

  async function savePhoto(key, file) {
    const blob = await downscale(file);
    await put(key, blob);
    return blob;
  }

  root.Photos = { put, get, remove, keys, savePhoto, url, dropUrl, clearAll };
})(typeof globalThis !== 'undefined' ? globalThis : this);
