// Speichert die App-Dateien für schnellen Start. Preise kommen immer frisch aus dem Netz.
const CACHE = 'tanken-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'forecast.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-180.png', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Netz zuerst, damit Updates sofort ankommen; offline aus dem Cache.
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});
