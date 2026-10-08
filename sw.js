// Offline cache. Same-origin files are network-first (fresh when online, cached when offline);
// the SHELL list is precached for first offline use. Bump CACHE when the file list changes.
const CACHE = '75hard-v5';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './js/app.js', './js/day.js', './js/store.js', './js/photos.js',
  './js/views/today.js', './js/views/meals.js', './js/views/workouts.js', './js/views/more.js', './js/views/progress.js', './js/views/settings.js', './js/reminders.js',
  './data/schedule.he.js', './data/meals.he.js', './data/workouts.he.js', './data/rules.he.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  const store = (res) => {
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  };
  if (sameOrigin) {
    // Network-first: always fresh when online, cached copy when offline.
    e.respondWith(fetch(e.request).then(store).catch(() => caches.match(e.request).then((h) => h || caches.match('./index.html'))));
  } else {
    // Fonts etc.: cache-first.
    e.respondWith(caches.match(e.request).then((h) => h || fetch(e.request).then(store)));
  }
});
