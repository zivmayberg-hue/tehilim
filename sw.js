// Теилим для семьи: работа без интернета (самолёт, роуминг).
// Страница и картинки: сначала сеть (всегда свежая версия, если есть интернет), без сети из кэша.
// Шрифты Google: из кэша, в фоне обновляются. Статистика (Umami) и всё остальное: мимо кэша.
// У живого сайта (/tehilim/) и сайта предпросмотра (/tehilim-preview/) свои кэши.
"use strict";
const CACHE = "tehilim:" + self.registration.scope;
const PAGE = self.registration.scope;                       // «./» хранит саму страницу, с любыми ?lang=…
const CORE = [PAGE, "apple-touch-icon.png"];
const NETWORK_TIMEOUT_MS = 6000;                            // медленная сеть в самолёте: потом берём из кэша

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(CORE.map(u => fetch(u, { cache: "no-cache" }).then(r => r.ok && c.put(u, r)).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim()); });

function networkFirst(req, key) {
  return caches.open(CACHE).then(cache => {
    const net = fetch(req, { cache: "no-cache" }).then(r => { if (r.ok) cache.put(key, r.clone()); return r; });
    const timeout = new Promise(res => setTimeout(res, NETWORK_TIMEOUT_MS));
    const cached = () => cache.match(key, { ignoreSearch: true });
    return Promise.race([net.catch(() => null), timeout.then(() => "timeout")])
      .then(r => r && r !== "timeout" ? r : cached().then(c => c || net));
  });
}
function cacheFirst(req) {
  return caches.open(CACHE).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") cache.put(req, r.clone()); return r; });
    return hit || net;
  }));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && req.url.startsWith(PAGE)) return e.respondWith(networkFirst(req, PAGE));
  if (req.url.startsWith(PAGE) && url.pathname !== new URL(PAGE).pathname + "sw.js") return e.respondWith(networkFirst(req, url.origin + url.pathname));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return e.respondWith(cacheFirst(req));
});
