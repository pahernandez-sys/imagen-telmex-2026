// Service Worker de Limpieza y Neutralización de Caché v5.1
const CACHE_NAME = "telmex-pwa-cache-v51-clean";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        console.log("[Service Worker] Purgando caché obsoleta:", key);
        return caches.delete(key);
      }));
    }).then(() => {
      console.log("[Service Worker] Auto-desregistrado para garantizar código 100% fresco.");
      return self.registration.unregister();
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Siempre solicitar directamente a la red sin caché para garantizar paridad inmediata
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
