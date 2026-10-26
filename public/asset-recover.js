/**
 * If hashed /assets/* CSS or JS 404, the document is stale (SW or HTTP cache).
 * Unregister every service worker, drop Cache Storage, reload once.
 */
(function () {
  var FLAG = "ke-asset-recover";
  var CHUNK = "ke-chunk-reload";

  function flagged() {
    try {
      return sessionStorage.getItem(FLAG) === "1";
    } catch {
      return false;
    }
  }

  function flag() {
    try {
      sessionStorage.setItem(FLAG, "1");
    } catch {
      /* ignore */
    }
  }

  function clearFlag() {
    try {
      sessionStorage.removeItem(FLAG);
    } catch {
      /* ignore */
    }
  }

  function markChunk() {
    try {
      sessionStorage.setItem(CHUNK, "1");
    } catch {
      /* ignore */
    }
  }

  function chunkReloadPending() {
    try {
      return sessionStorage.getItem(CHUNK) === "1";
    } catch {
      return false;
    }
  }

  function isChunkMiss(message) {
    return /dynamically imported module|loading chunk|module script|mime type|text\/html|chunkloaderror/i.test(
      String(message || ""),
    );
  }

  function isHashedAsset(url) {
    return typeof url === "string" && url.indexOf("/assets/") !== -1;
  }

  // Ad blockers that match "posthog" in the URL fail this file on every page.
  // That is not a stale document. Reloading it loops (the flag clears on load).
  function isBlockedAnalytics(url) {
    return typeof url === "string" && /posthog/i.test(url);
  }

  function recover() {
    if (flagged()) return;
    flag();
    var reload = function () {
      location.reload();
    };
    var jobs = [];
    if ("serviceWorker" in navigator) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(
            regs.map(function (reg) {
              return reg.unregister();
            }),
          );
        }),
      );
    }
    if (self.caches && caches.keys) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            }),
          );
        }),
      );
    }
    Promise.all(jobs).then(reload).catch(reload);
  }

  window.addEventListener(
    "error",
    function (event) {
      var el = event.target;
      if (!el || el === window) {
        var message = event.message ? String(event.message) : "";
        if (isBlockedAnalytics(message) || !isChunkMiss(message)) return;
        markChunk();
        recover();
        return;
      }
      var url = el.href || el.src || "";
      if (!isHashedAsset(url) || isBlockedAnalytics(url)) return;
      if (el.tagName === "LINK" || el.tagName === "SCRIPT") recover();
    },
    true,
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var message = reason && reason.message ? String(reason.message) : String(reason || "");
    if (isBlockedAnalytics(message) || !isChunkMiss(message)) return;
    if (event.preventDefault) event.preventDefault();
    markChunk();
    recover();
  });

  window.addEventListener("vite:preloadError", function (event) {
    var payload = event && event.payload;
    var message = payload && payload.message ? String(payload.message) : "";
    var url = payload && payload.url ? String(payload.url) : message;
    if (isBlockedAnalytics(url) || isBlockedAnalytics(message)) {
      if (event.preventDefault) event.preventDefault();
      return;
    }
    if (event.preventDefault) event.preventDefault();
    markChunk();
    recover();
  });

  window.addEventListener("load", function () {
    var sheets = document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]');
    for (var i = 0; i < sheets.length; i++) {
      if (!sheets[i].sheet) {
        recover();
        return;
      }
    }
    // A missing JS chunk must reload only once. CSS can be fine on that page.
    if (chunkReloadPending()) return;
    clearFlag();
  });
})();
