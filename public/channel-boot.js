(function () {
  try {
    var c = window.Capacitor;
    var n = !!(c && c.isNativePlatform && c.isNativePlatform());
    var ua = navigator.userAgent || "";
    var uaNative = ua.indexOf("KidEaseNative") !== -1;
    var q = new URLSearchParams(location.search);
    var force = q.get("app") === "1" || q.get("channel") === "app";
    var r = document.documentElement;
    var store = "web";
    var ios = /iPhone|iPad|iPod/i.test(ua);
    var samsungBuild = !ios && ua.indexOf("KidEaseStoreSamsung") !== -1;
    if (ios && uaNative) store = "apple";
    else if (!ios && ua.indexOf("KidEaseStoreHuawei") !== -1) store = "huawei";
    else if (samsungBuild) store = "samsung";
    else if (uaNative) store = "google";
    else if (ua.indexOf("KidEaseStoreMicrosoft") !== -1 || q.get("store") === "microsoft" || /(?:^|;\s*)ke_store=microsoft(?:;|$)/.test(document.cookie || "")) store = "microsoft";
    var cookie = document.cookie || "";
    var dropMicrosoft = uaNative && /(?:^|;\s*)ke_store=microsoft(?:;|$)/.test(cookie);
    var dropSamsung = /(?:^|;\s*)ke_store=samsung(?:;|$)/.test(cookie) && !samsungBuild;
    if (dropMicrosoft || dropSamsung) {
      document.cookie = "ke_store=; Path=/; Max-Age=0; SameSite=Lax";
    } else if (q.get("store") === "microsoft" && !uaNative) {
      var secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = "ke_store=microsoft; Path=/; Max-Age=31536000; SameSite=Lax" + secure;
    }
    /* Keep in step with STORE_PAYMENTS_ENABLED in native-entitlements.ts. v2 flips one store to true. */
    var STORE_PAYMENTS_ENABLED = { apple: false, google: false, microsoft: false, samsung: false, huawei: false };
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (!n && !uaNative && (store === "microsoft" || standalone)) {
      window.addEventListener("load", function () {
        try {
          if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
          var sheets = document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]');
          for (var i = 0; i < sheets.length; i++) {
            if (!sheets[i].sheet) return;
          }
          navigator.serviceWorker.register("/sw.js?v=7", { scope: "/", updateViaCache: "none" }).catch(function () {});
        } catch (e) {
          /* registration is best-effort */
        }
      });
    }
    r.dataset.store = store;
    var blocksCommerce = Object.prototype.hasOwnProperty.call(STORE_PAYMENTS_ENABLED, store) && STORE_PAYMENTS_ENABLED[store] === false;
    var paintFrame = function () {
      var w = window.innerWidth || 0;
      var h = window.innerHeight || 0;
      var ratio = h > 0 ? w / h : 1;
      r.dataset.channel = force || n || uaNative || w < 1024 ? "app" : "website";
      r.dataset.keShape = ratio >= 0.85 && ratio <= 1.18 ? "square" : ratio > 1.18 ? "wide" : "tall";
    };
    paintFrame();
    window.addEventListener("resize", paintFrame);
    if (!blocksCommerce) r.dataset.runtime = "web";
    else if (n && c.getPlatform) r.dataset.runtime = c.getPlatform();
    else r.dataset.runtime = "native";
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
