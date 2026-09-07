import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  applyDocumentNonces,
  applyHtmlDocumentCacheHeaders,
  applyScriptNonces,
  applyStyleNonceBoot,
  applyStyleNonces,
  buildContentSecurityPolicy,
  generateNonce,
  HTML_DOCUMENT_CACHE_CONTROL,
  isHtmlResponse,
  STYLE_NONCE_BOOT,
} from "./csp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("nonce CSP drops script-src unsafe-inline and keeps product hosts", () => {
  const csp = buildContentSecurityPolicy("abc+123/XYZ=");
  assert.match(csp, /script-src 'self' 'nonce-abc\+123\/XYZ=' 'strict-dynamic'/);
  assert.match(csp, /script-src[^;]*https:\/\/maps\.googleapis\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/js\.stripe\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/us\.i\.posthog\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
  assert.match(csp, /style-src 'self' 'nonce-abc\+123\/XYZ='/);
  assert.match(csp, /style-src-attr 'unsafe-inline'/);
  assert.match(csp, /connect-src[^;]*https:\/\/maps\.googleapis\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/api\.stripe\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
  assert.match(csp, /worker-src 'self' blob: data:/);
  assert.match(csp, /img-src 'self' data: blob: https: https:\/\/pub-9e5f137809844fcdb6d6671cd909f312\.r2\.dev https:\/\/\*\.r2\.dev/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /(?:^|; )style-src [^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /grok\.com/);
  assert.doesNotMatch(csp, /r2\.cloudflarestorage\.com/);
  assert.throws(() => buildContentSecurityPolicy("bad nonce"), /unsafe characters/);
  assert.throws(() => buildContentSecurityPolicy(""), /required/);
});

test("applyScriptNonces stamps tags without double-noncing", () => {
  const html = [
    '<script src="/channel-boot.js"></script>',
    '<script type="module" src="/assets/app.js"></script>',
    '<script>window.__TSR=1</script>',
    '<script nonce="keep-me" src="/already.js"></script>',
  ].join("");
  const out = applyScriptNonces(html, "n1");
  assert.match(out, /<script nonce="n1" src="\/channel-boot\.js">/);
  assert.match(out, /<script nonce="n1" type="module" src="\/assets\/app\.js">/);
  assert.match(out, /<script nonce="n1">window\.__TSR=1<\/script>/);
  assert.match(out, /<script nonce="keep-me" src="\/already\.js">/);
  assert.equal((out.match(/nonce="n1"/g) ?? []).length, 3);
  assert.equal(isHtmlResponse("text/html; charset=utf-8"), true);
  assert.equal(isHtmlResponse("application/json"), false);
  const token = generateNonce();
  assert.match(token, /^[A-Za-z0-9+/]+=*$/);
  assert.notEqual(generateNonce(), token);
});

test("applyStyleNonces stamps style tags without double-noncing", () => {
  const html = [
    "<style>.a{color:red}</style>",
    '<style type="text/css">.b{color:blue}</style>',
    '<style nonce="keep-me">.c{color:green}</style>',
  ].join("");
  const out = applyStyleNonces(html, "s1");
  assert.match(out, /<style nonce="s1">\.a\{color:red\}<\/style>/);
  assert.match(out, /<style nonce="s1" type="text\/css">\.b\{color:blue\}<\/style>/);
  assert.match(out, /<style nonce="keep-me">\.c\{color:green\}<\/style>/);
  assert.equal((out.match(/nonce="s1"/g) ?? []).length, 2);
});

test("applyDocumentNonces injects style-nonce boot and stamps script plus style", () => {
  const html =
    "<html><head><style>.x{}</style><script src=\"/channel-boot.js\"></script></head><body></body></html>";
  const out = applyDocumentNonces(html, "n1");
  assert.match(out, /<head><script data-ke-style-nonce nonce="n1">/);
  assert.match(out, /<style nonce="n1">\.x\{\}<\/style>/);
  assert.match(out, /<script nonce="n1" src="\/channel-boot\.js">/);
  assert.match(out, /Document\.prototype\.createElement/);
  assert.equal(out.includes(STYLE_NONCE_BOOT), true);
  const again = applyStyleNonceBoot(out, "n1");
  assert.equal((again.match(/data-ke-style-nonce/g) ?? []).length, 1);
  assert.match(STYLE_NONCE_BOOT, /document\.currentScript/);
  assert.doesNotMatch(STYLE_NONCE_BOOT, /<\/script>/);
});

test("HTML documents are not cached so they cannot point at deleted asset hashes", () => {
  const headers = new Headers({ "content-type": "text/html" });
  applyHtmlDocumentCacheHeaders(headers);
  assert.equal(headers.get("Cache-Control"), HTML_DOCUMENT_CACHE_CONTROL);
  assert.equal(headers.get("CDN-Cache-Control"), HTML_DOCUMENT_CACHE_CONTROL);
  assert.match(HTML_DOCUMENT_CACHE_CONTROL, /max-age=0/);
  assert.match(src("server/middleware/csp.ts"), /applyHtmlDocumentCacheHeaders/);
  const vercel = src("vercel.json");
  assert.match(vercel, /"source": "\/"/);
  assert.match(vercel, /"source": "\/asset-recover\.js"/);
  assert.match(vercel, /"source": "\/assets\/\(\.\*\)"/);
});

test("Nitro owns CSP; vercel.json no longer ships a static policy", () => {
  const vercel = src("vercel.json");
  assert.doesNotMatch(vercel, /Content-Security-Policy/);
  assert.doesNotMatch(vercel, /unsafe-inline/);
  assert.doesNotMatch(vercel, /grok\.com/);
  assert.match(src("server/middleware/csp.ts"), /buildContentSecurityPolicy/);
  assert.match(src("server/middleware/csp.ts"), /applyDocumentNonces/);
  assert.doesNotMatch(src("scripts/csp.mjs"), /style-src 'self' 'unsafe-inline'/);
  assert.match(src("SECURITY.md"), /style-src-attr.*unsafe-inline/);
  assert.match(src("src/styles.css"), /ke-sheet\[data-snap="peek"\]/);
  const rootHtml = src("src/routes/__root.tsx");
  assert.match(rootHtml, /data-ke-style-nonce/);
  assert.equal(rootHtml.includes(STYLE_NONCE_BOOT), true);
  assert.doesNotMatch(rootHtml, /channel-boot\.js[\s\S]*data-ke-style-nonce/);
});
