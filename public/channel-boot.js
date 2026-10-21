(function () {
  try {
    var c = window.Capacitor;
    var n = !!(c && c.isNativePlatform && c.isNativePlatform());
    var ua = navigator.userAgent || "";
    var uaNative = ua.indexOf("KidEaseNative") !== -1;
    var q = new URLSearchParams(location.search);
    var force = q.get("app") === "1" || q.get("channel") === "app";
    var w = window.innerWidth || 0;
    var r = document.documentElement;
    var store = "web";
    if (ua.indexOf("KidEaseStoreHuawei") !== -1) store = "huawei";
    else if (ua.indexOf("KidEaseStoreSamsung") !== -1) store = "samsung";
    else if (ua.indexOf("KidEaseStoreMicrosoft") !== -1 || q.get("store") === "microsoft" || /(?:^|;\s*)ke_store=microsoft(?:;|$)/.test(document.cookie || "")) store = "microsoft";
    else if (uaNative) store = /iPhone|iPad|iPod/i.test(ua) ? "apple" : "google";
    if (q.get("store") === "microsoft") {
      var secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = "ke_store=microsoft; Path=/; Max-Age=31536000; SameSite=Lax" + secure;
    }
    r.dataset.store = store;
    var blocksCommerce = store === "apple" || store === "google" || store === "huawei";
    r.dataset.channel = force || n || uaNative || w < 1024 ? "app" : "website";
    if (!blocksCommerce) r.dataset.runtime = "web";
    else if (n && c.getPlatform) r.dataset.runtime = c.getPlatform();
    else if (uaNative) r.dataset.runtime = "native";
    else r.dataset.runtime = "web";
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
