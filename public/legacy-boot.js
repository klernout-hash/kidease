/* KidEase legacy engine support. Classic script, runs before any module.
   Fire OS 7/8 (Silk, WebView 91) and other old Chromium/Safari builds lack a
   few APIs the app and its libraries call. Each shim only fills a gap. When
   the engine cannot use the stylesheet (no cascade layers: Chrome < 99,
   Safari < 15.4), unwrap the layers into a plain copy of the stylesheet. */
(function () {
  "use strict";
  var w = window;
  function def(obj, name, fn) {
    if (obj && !(name in obj)) {
      try { Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true }); } catch (e) { obj[name] = fn; }
    }
  }
  function at(n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    return n < 0 || n >= this.length ? undefined : this[n];
  }
  def(Array.prototype, "at", at);
  def(String.prototype, "at", at);
  [w.Int8Array, w.Uint8Array, w.Uint8ClampedArray, w.Int16Array, w.Uint16Array, w.Int32Array, w.Uint32Array, w.Float32Array, w.Float64Array].forEach(function (T) {
    if (T) def(T.prototype, "at", at);
  });
  def(Object, "hasOwn", function (o, k) { return Object.prototype.hasOwnProperty.call(Object(o), k); });
  def(Array.prototype, "findLast", function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; return undefined; });
  def(Array.prototype, "findLastIndex", function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(Array.prototype, "toSorted", function (cmp) { return Array.prototype.slice.call(this).sort(cmp); });
  def(Array.prototype, "toReversed", function () { return Array.prototype.slice.call(this).reverse(); });
  if (typeof w.structuredClone !== "function") {
    w.structuredClone = function (v) {
      if (v === undefined || v === null || typeof v !== "object") return v;
      var seen = typeof Map === "function" ? new Map() : null;
      function clone(x) {
        if (x === null || typeof x !== "object") return x;
        if (seen && seen.has(x)) return seen.get(x);
        var out;
        if (x instanceof Date) out = new Date(x.getTime());
        else if (x instanceof RegExp) out = new RegExp(x.source, x.flags);
        else if (typeof Map === "function" && x instanceof Map) { out = new Map(); if (seen) seen.set(x, out); x.forEach(function (val, key) { out.set(clone(key), clone(val)); }); return out; }
        else if (typeof Set === "function" && x instanceof Set) { out = new Set(); if (seen) seen.set(x, out); x.forEach(function (val) { out.add(clone(val)); }); return out; }
        else if (ArrayBuffer.isView(x)) return x.slice ? x.slice() : x;
        else if (Array.isArray(x)) out = [];
        else out = {};
        if (seen) seen.set(x, out);
        for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) out[k] = clone(x[k]);
        return out;
      }
      return clone(v);
    };
  }
  if (w.crypto && typeof w.crypto.randomUUID !== "function" && typeof w.crypto.getRandomValues === "function") {
    def(w.crypto, "randomUUID", function () {
      var b = w.crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
      var h = []; for (var i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
      return h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" + h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" + h.slice(10).join("");
    });
  }
  if (w.AbortSignal && typeof w.AbortSignal.timeout !== "function" && typeof w.AbortController === "function") {
    w.AbortSignal.timeout = function (ms) {
      var c = new AbortController();
      setTimeout(function () {
        var err; try { err = new DOMException("The operation timed out.", "TimeoutError"); } catch (e) { err = new Error("TimeoutError"); }
        c.abort(err);
      }, ms);
      return c.signal;
    };
  }
  if (w.AbortSignal && w.AbortSignal.prototype && typeof w.AbortSignal.prototype.throwIfAborted !== "function") {
    def(w.AbortSignal.prototype, "throwIfAborted", function () {
      if (!this.aborted) return;
      if (this.reason !== undefined) throw this.reason;
      var err; try { err = new DOMException("This operation was aborted", "AbortError"); } catch (e) { err = new Error("AbortError"); err.name = "AbortError"; }
      throw err;
    });
  }
  if (typeof w.requestIdleCallback !== "function") {
    w.requestIdleCallback = function (cb) { var s = Date.now(); return setTimeout(function () { cb({ didTimeout: false, timeRemaining: function () { return Math.max(0, 50 - (Date.now() - s)); } }); }, 1); };
    w.cancelIdleCallback = function (id) { clearTimeout(id); };
  }
  // Cascade layers carry every Tailwind rule. Without them the page is unstyled.
  if (typeof w.CSSLayerBlockRule === "undefined") {
    document.documentElement.setAttribute("data-ke-legacy", "1");
    var nonce = (document.currentScript && document.currentScript.nonce) || "";
    var flatten = function (css) {
      // Drop "@layer a, b;" statements and unwrap "@layer x { ... }" blocks.
      // Strings and comments are copied as they are.
      var out = "", i = 0, n = css.length, stack = [];
      while (i < n) {
        var ch = css[i];
        if (ch === "/" && css[i + 1] === "*") { var end = css.indexOf("*/", i + 2); end = end < 0 ? n : end + 2; out += css.slice(i, end); i = end; continue; }
        if (ch === '"' || ch === "'") { var j = i + 1; while (j < n && css[j] !== ch) { if (css[j] === "\\") j++; j++; } out += css.slice(i, j + 1); i = j + 1; continue; }
        if (ch === "@" && css.substr(i, 6) === "@layer" && !/[\w-]/.test(css[i + 6] || "")) {
          var k = i + 6; while (k < n && css[k] !== "{" && css[k] !== ";") k++;
          if (css[k] === ";") { i = k + 1; continue; }
          stack.push(true); i = k + 1; continue;
        }
        if (ch === "{") { stack.push(false); out += ch; i++; continue; }
        if (ch === "}") { var drop = stack.pop(); if (!drop) out += ch; i++; continue; }
        out += ch; i++;
      }
      return out;
    };
    var fix = function () {
      var links = document.querySelectorAll('link[rel="stylesheet"][href*="/assets/"]');
      Array.prototype.forEach.call(links, function (link) {
        if (link.getAttribute("data-ke-flat")) return;
        link.setAttribute("data-ke-flat", "1");
        fetch(link.href, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (css) {
          if (!css) return;
          var style = document.createElement("style");
          if (nonce) { style.setAttribute("nonce", nonce); try { style.nonce = nonce; } catch (e) { /* read-only in old engines */ } }
          style.setAttribute("data-ke-legacy-css", "");
          style.textContent = flatten(css);
          if (link.parentNode) link.parentNode.insertBefore(style, link.nextSibling);
        }).catch(function () {});
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fix);
    else fix();
    w.addEventListener("load", fix);
  }
})();
