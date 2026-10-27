// Speichert die App-Dateien für schnellen Start. Preise kommen immer frisch aus dem Netz.
const CACHE = 'tanken-v13';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'forecast.js', 'alerts.js', 'config.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
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
    // no-cache: beim Server nachfragen statt alte Dateien aus dem Browser-Cache zu nehmen.
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});

// Preisalarm vom Backend
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'Tanken', body: e.data?.text() ?? '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Tanken', {
    body: data.body,
    tag: data.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
