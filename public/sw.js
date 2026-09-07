/* Lightweight KidEase PWA shell. Caches app chrome only — not CSS/JS bundles. */
const VERSION = "kidease-shell-v3";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-512.png",
  "/fonts/plus-jakarta-sans-latin.woff2",
  "/channel-boot.js",
];
const NAVIGATE_MS = 8000;

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
  // Never intercept hashed CSS/JS — a failed fetch used to fall back to
  // offline.html, which the browser then parsed as the stylesheet.
  return (
    path.startsWith("/api/") ||
    path.startsWith("/assets/") ||
    path === "/img" ||
    path.startsWith("/img?") ||
    path === "/sw.js"
  );
}

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, NAVIGATE_MS).catch(() => caches.match("/offline.html")),
    );
    return;
  }

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
