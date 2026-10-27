/* KidEase PWA worker for Chromium, including the Microsoft Store app (Edge).
 * Pages register /sw.js?v=8 so a cached copy of /sw.js cannot stay behind.
 * The iOS and Android shells do not register this file.
 * Documents, /api/, and /_serverFn are never cached.
 * The offline page is used only for a real network failure or navigator.onLine === false.
 * A 401 or Unauthorized response is not offline.
 * HTML is never written to the cache (stale /assets hashes break the page). */
const VERSION = "kidease-shell-v8";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/manifest.microsoft.webmanifest",
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
      // Drop the previous shell cache. A reload does not clear cookies or sign anyone out.
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
    path === "/manifest.microsoft.webmanifest" ||
    path === "/offline.html"
  );
}

function shouldBypass(url) {
  if (!sameOrigin(url)) return true;
  const path = url.pathname;
  // Hashed CSS/JS must always come from the current deploy.
  return (
    path.startsWith("/api/") ||
    path.startsWith("/_serverFn") ||
    path.startsWith("/ingest") ||
    path.startsWith("/assets/") ||
    path === "/img" ||
    path.startsWith("/img?") ||
    path === "/sw.js" ||
    path === "/channel-boot.js" ||
    path === "/asset-recover.js"
  );
}

function notificationPath(raw) {
  if (typeof raw !== "string" || !raw) return "/notifications";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const ours = host === "kidease.ca" || host === "www.kidease.ca" || host.endsWith(".kidease.ca");
    if (url.protocol === "https:" && ours) return `${url.pathname}${url.search}` || "/notifications";
  } catch {
    /* ignore */
  }
  return "/notifications";
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "KidEase";
  const body = typeof payload.body === "string" ? payload.body : "";
  const url = notificationPath(payload.url);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-512.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const url = notificationPath(raw);
  event.waitUntil(self.clients.openWindow(url));
});

function isDocument(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function isAuthFailure(error, response) {
  if (response && (response.status === 401 || response.status === 403)) return true;
  const message = error && typeof error.message === "string" ? error.message : "";
  return message === "Unauthorized" || message === "Not authorized" || message === "401";
}

function isNetworkFailure(error) {
  if (!error || isAuthFailure(error)) return false;
  return error instanceof TypeError || error.name === "TypeError";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  // Do not cache HTML. Offline only when the network itself fails.
  if (isDocument(request)) {
    event.respondWith(
      fetch(request).catch((error) => {
        if (isAuthFailure(error)) return Promise.reject(error);
        const browserOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (browserOffline || isNetworkFailure(error)) return caches.match("/offline.html");
        return Promise.reject(error);
      }),
    );
    return;
  }
  if (shouldBypass(url)) return;
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
