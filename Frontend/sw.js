/* Speakeasy Academy — service worker
   Strategy: cache-first for app shell assets, network-first for API calls.
   On offline, serve the cached shell so users see the app rather than
   a Chrome error page; API calls simply fail with the app's own error UI.
*/
const CACHE_NAME = "speakeasy-v1";
const SHELL = [
  "/",
  "/styles.css",
  "/app.js",
  "/favicon.svg",
  "/manifest.json",
  "/offline.html"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Never intercept API calls — let them go to network directly
  if (url.pathname.startsWith("/api/")) return;

  // For navigation requests (HTML pages), try network first, fall back to cached shell
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match("/") || caches.match("/offline.html"))
    );
    return;
  }

  // For other assets: cache-first, update cache in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
