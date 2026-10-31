function keAccessPath(href) {
  if (!href || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return false;
  var path = href;
  var hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  var q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  if (path.indexOf("http://") === 0 || path.indexOf("https://") === 0) {
    try {
      path = new URL(path).pathname;
    } catch (e) {
      return false;
    }
  }
  if (!path || path.charAt(0) !== "/") return false;
  if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
  if (path.indexOf("/fr/") === 0) path = path.slice(3) || "/";
  else if (path === "/fr") path = "/";
  return (
    path === "/admin" ||
    path.indexOf("/admin/") === 0 ||
    path.indexOf("/admin-") === 0 ||
    path === "/api/admin" ||
    path.indexOf("/api/admin/") === 0
  );
}

(function () {
  try {
    var c = window.Capacitor;
    var n = !!(c && c.isNativePlatform && c.isNativePlatform());
    var ua = navigator.userAgent || "";
    var uaNative = ua.indexOf("KidEaseNative") !== -1;
    var r = document.documentElement;
    if (n || uaNative) {
      r.dataset.native = "1";
      if (!/(?:^|;\s*)ke_shell=native(?:;|$)/.test(document.cookie || "")) {
        var nativeSecure = location.protocol === "https:" ? "; Secure" : "";
        document.cookie = "ke_shell=native; Path=/; Max-Age=31536000; SameSite=Lax" + nativeSecure;
      }
      document.addEventListener(
        "click",
        function (ev) {
          if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          var target = ev.target;
          if (!target || !target.closest) return;
          var link = target.closest("a");
          if (!link) return;
          var href = link.getAttribute("href") || "";
          if (!keAccessPath(href)) return;
          ev.preventDefault();
          location.assign("/app-admin-unavailable");
        },
        true,
      );
    }
    var q = new URLSearchParams(location.search);
    var force = q.get("app") === "1" || q.get("channel") === "app";
    var store = "web";
    var ios = /iPhone|iPad|iPod/i.test(ua);
    var samsungBuild = !ios && ua.indexOf("KidEaseStoreSamsung") !== -1;
    if (ios && uaNative) store = "apple";
    else if (!ios && ua.indexOf("KidEaseStoreHuawei") !== -1) store = "huawei";
    else if (!ios && ua.indexOf("KidEaseStoreAmazon") !== -1) store = "amazon";
    else if (samsungBuild) store = "samsung";
    else if (uaNative) store = "google";
    else if (ua.indexOf("KidEaseStoreMicrosoft") !== -1 || q.get("store") === "microsoft" || /(?:^|;\s*)ke_store=microsoft(?:;|$)/.test(document.cookie || "")) store = "microsoft";
    var preset = r.getAttribute("data-store") || "";
    if (store === "web" && /^(apple|google|samsung|huawei|amazon|microsoft)$/.test(preset)) store = preset;
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
    var STORE_PAYMENTS_ENABLED = { apple: false, google: false, microsoft: false, samsung: false, huawei: false, amazon: false };
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (!n && !uaNative && (store === "microsoft" || standalone)) {
      window.addEventListener("load", function () {
        try {
          if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
          var sheets = document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]');
          for (var i = 0; i < sheets.length; i++) {
            if (!sheets[i].sheet) return;
          }
          navigator.serviceWorker.register("/sw.js?v=8", { scope: "/", updateViaCache: "none" }).catch(function () {});
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
