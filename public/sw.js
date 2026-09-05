/* Lightweight KidEase PWA shell. Caches app chrome only — not the catalogue. */
const VERSION = "kidease-shell-v1";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-512.png",
  "/fonts/plus-jakarta-sans-latin.woff2",
  "/channel-boot.js",
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
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isChromeAsset(url) {
  const path = url.pathname;
  return (
    path.startsWith("/assets/") ||
    path.startsWith("/fonts/") ||
    path.startsWith("/icons/") ||
    path.startsWith("/favicon") ||
    path === "/icon-512.png" ||
    path === "/apple-touch-icon.png" ||
    path === "/channel-boot.js" ||
    path === "/manifest.webmanifest" ||
    path === "/offline.html"
  );
}

function shouldBypass(url) {
  if (!sameOrigin(url)) return true;
  const path = url.pathname;
  return path.startsWith("/api/") || path === "/img" || path.startsWith("/img?");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (!isChromeAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
