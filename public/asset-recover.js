/**
 * If hashed /assets/* CSS or JS 404, the document is stale (SW or HTTP cache).
 * Unregister every service worker, drop Cache Storage, reload once.
 */
(function () {
  var FLAG = "ke-asset-recover";

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

  function isHashedAsset(url) {
    return typeof url === "string" && url.indexOf("/assets/") !== -1;
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
      if (!el || el === window) return;
      var url = el.href || el.src || "";
      if (!isHashedAsset(url)) return;
      if (el.tagName === "LINK" || el.tagName === "SCRIPT") recover();
    },
    true,
  );

  window.addEventListener("load", function () {
    var sheets = document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]');
    for (var i = 0; i < sheets.length; i++) {
      if (!sheets[i].sheet) {
        recover();
        return;
      }
    }
    clearFlag();
  });
})();
