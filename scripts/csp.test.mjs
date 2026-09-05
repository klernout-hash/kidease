import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  applyScriptNonces,
  buildContentSecurityPolicy,
  generateNonce,
  isHtmlResponse,
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
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src[^;]*https:\/\/maps\.googleapis\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/api\.stripe\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
  assert.match(csp, /worker-src 'self' blob: data:/);
  assert.match(csp, /img-src 'self' data: blob: https:/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
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

test("Nitro owns CSP; vercel.json no longer ships a static policy", () => {
  const vercel = src("vercel.json");
  assert.doesNotMatch(vercel, /Content-Security-Policy/);
  assert.doesNotMatch(vercel, /unsafe-inline/);
  assert.doesNotMatch(vercel, /grok\.com/);
  assert.match(src("server/middleware/csp.ts"), /buildContentSecurityPolicy/);
  assert.match(src("server/middleware/csp.ts"), /applyScriptNonces/);
  assert.match(src("SECURITY.md"), /style-src.*unsafe-inline/);
});
