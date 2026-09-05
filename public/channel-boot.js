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
  } catch (e) {
    document.documentElement.dataset.channel = "website";
  }
})();
