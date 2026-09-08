(function () {
  try {
    var c = window.Capacitor;
    var n = !!(c && c.isNativePlatform && c.isNativePlatform());
    var q = new URLSearchParams(location.search);
    var force = q.get("app") === "1" || q.get("channel") === "app";
    var w = window.innerWidth || 0;
    var r = document.documentElement;
    r.dataset.channel = force || n || w < 1024 ? "app" : "website";
    r.dataset.runtime = n && c.getPlatform ? c.getPlatform() : "web";
    if (r.dataset.channel === "app") {
      var dropJakarta = function () {
        document.querySelectorAll('link[rel="preload"][href*="plus-jakarta"]').forEach(function (el) {
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      };
      dropJakarta();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", dropJakarta);
      }
    }
  } catch {
    document.documentElement.dataset.channel = "website";
  }
})();
