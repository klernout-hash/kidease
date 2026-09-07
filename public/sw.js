/* Chrome-only KidEase PWA worker. Never intercepts HTML or hashed /assets/. */
const VERSION = "kidease-shell-v4";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-512.png",
  "/fonts/plus-jakarta-sans-latin.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const stale = keys.filter((key) => key !== VERSION);
      await Promise.all(stale.map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!stale.length) return;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(
        clients.map((client) => {
          try {
            return client.navigate(client.url);
          } catch {
            return null;
          }
        }),
      );
    }),
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isChromeAsset(url) {
  const path = url.pathname;
  return (
    path.startsWith("/fonts/") ||
    path.startsWith("/icons/") ||
    path.startsWith("/favicon") ||
    path === "/icon-512.png" ||
    path === "/apple-touch-icon.png" ||
    path === "/manifest.webmanifest" ||
    path === "/offline.html"
  );
}

function shouldBypass(url, request) {
  if (!sameOrigin(url)) return true;
  const path = url.pathname;
  // Documents and hashed CSS/JS must always come from the current deploy.
  // A stale HTML document pointing at deleted /assets/* hashes is the
  // production “giant logo + dead clicks” failure.
  if (request.mode === "navigate" || request.destination === "document") return true;
  return (
    path.startsWith("/api/") ||
    path.startsWith("/assets/") ||
    path === "/img" ||
    path.startsWith("/img?") ||
    path === "/sw.js" ||
    path === "/channel-boot.js" ||
    path === "/asset-recover.js"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (shouldBypass(url, request)) return;
  if (!isChromeAsset(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
