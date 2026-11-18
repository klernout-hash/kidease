import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import * as csp from "./csp.mjs";
import * as publicCache from "./public-static-cache.mjs";
import { compressHtmlResponse } from "../server/lib/html-compression.ts";

// Explicit non-payment cache-policy allowlist: real Response, CSP, public
// document cache and gzip helpers. No application services or auth fixtures.
const require = createRequire(import.meta.url);
const module = { exports: {} };
const javascript = ts.transpileModule(
  readFileSync(new URL("../server/middleware/csp.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
new vm.Script(javascript).runInNewContext({
  module,
  exports: module.exports,
  Headers,
  Response,
  require: (name) =>
    ({
      "../../scripts/csp.mjs": csp,
      "../../scripts/public-static-cache.mjs": publicCache,
      "../lib/html-compression.ts": { compressHtmlResponse },
    })[name] ?? require(name),
});
const middleware = module.exports.default;
const document =
  "<!doctype html><html><head><script>window.syntheticQueue = true;</script></head><body>Synthetic queue totals</body></html>";
function event(path = "/admin", encoding = "identity") {
  return {
    url: new URL(`http://127.0.0.1${path}`),
    req: { method: "GET", headers: new Headers({ "accept-encoding": encoding }) },
  };
}
function assertCdnDoesNotStore(headers) {
  for (const name of [
    "CDN-Cache-Control",
    "Cloudflare-CDN-Cache-Control",
    "Vercel-CDN-Cache-Control",
  ])
    assert.equal(headers.get(name), "no-store", name);
}

test("HTML defaults still revalidate and every CDN stays disarmed", () => {
  const headers = new Headers({
    "Cache-Control": "public, max-age=600",
    "CDN-Cache-Control": "public, s-maxage=600",
  });
  csp.applyHtmlDocumentCacheHeaders(headers);
  assert.equal(headers.get("Cache-Control"), csp.HTML_DOCUMENT_CACHE_CONTROL);
  assertCdnDoesNotStore(headers);
});

test("upstream private and no-store policies are preserved verbatim", () => {
  for (const policy of [
    "private, no-store",
    "PRIVATE, max-age=0",
    "no-store",
    "no-store, max-age=500",
    'private="Set-Cookie", no-cache',
  ]) {
    const headers = new Headers({ "Cache-Control": policy });
    assert.equal(csp.hasPrivateCacheControl(headers), true);
    csp.applyHtmlDocumentCacheHeaders(headers);
    assert.equal(headers.get("Cache-Control"), policy);
    assertCdnDoesNotStore(headers);
  }
  for (const policy of ["public, max-age=0", "no-cache", 'public, extension="private"'])
    assert.equal(csp.hasPrivateCacheControl(new Headers({ "Cache-Control": policy })), false);
});

test("actual admin HTML middleware preserves private no-store through nonce stamping and gzip", async () => {
  const response = await middleware(
    event("/admin", "gzip"),
    () =>
      new Response(document, {
        headers: { "content-type": "text/html", "Cache-Control": "private, no-store" },
      }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assertCdnDoesNotStore(response.headers);
  const html = gunzipSync(new Uint8Array(await response.arrayBuffer())).toString();
  assert.match(html, /Synthetic queue totals/);
  assert.match(html, /<script nonce="[^"]+"/);
});

test("explicitly private public-path HTML cannot be promoted back into a shared cache", async () => {
  const response = await middleware(
    event("/privacy"),
    () =>
      new Response(document, {
        headers: { "content-type": "text/html", "Cache-Control": "private, no-store" },
      }),
  );
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assertCdnDoesNotStore(response.headers);
});

test("ordinary anonymous public documents retain the existing edge-cache rule", async () => {
  const response = await middleware(
    event("/privacy"),
    () => new Response(document, { headers: { "content-type": "text/html" } }),
  );
  assert.equal(response.headers.get("Cache-Control"), publicCache.PUBLIC_STATIC_EDGE_CACHE);
  assert.equal(response.headers.get("CDN-Cache-Control"), publicCache.PUBLIC_STATIC_EDGE_CACHE);
});

test("non-HTML private responses keep their cache policy", async () => {
  const response = await middleware(event("/_serverFn/synthetic-private"), () =>
    Response.json({ count: 7 }, { headers: { "Cache-Control": "private, no-store" } }),
  );
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { count: 7 });
});
