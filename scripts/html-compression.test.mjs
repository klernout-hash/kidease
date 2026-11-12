import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";
import { acceptsGzip, compressHtmlResponse } from "../server/lib/html-compression.ts";
import cspMiddleware from "../server/middleware/csp.ts";
import { applyDocumentNonces, stripModulePreloadsForPath } from "./csp.mjs";

const html = '<!doctype html><html lang="fr"><head><style>body{color:currentColor}</style></head><body><h1>Garderies au Canada — Québec</h1><script>window.ready=true</script></body></html>';

test("gzip negotiation respects explicit exclusions, weights and wildcards", () => {
  for (const value of ["gzip", "br, gzip, deflate", "GZIP; Q=0.5", "*", "*;q=0.2", "gzip;q=0.001, *;q=0", "gzip;q=1, identity;q=0"]) {
    assert.equal(acceptsGzip(value), true, value);
  }
  for (const value of [null, "", "br, deflate", "gzip;q=0", "gzip;q=0, *;q=1", "*;q=0", "gzip;q=0.000", "gzip;q=bad", "gzip;q=1.1", "gzip;q=-1", "gzip;q=0.1234", "gzip;q=0.5, identity;q=1", "gzip;q=1, gzip;q=0", "gzip;q=0;q=1"]) {
    assert.equal(acceptsGzip(value), false, String(value));
  }
});

test("gzip preserves exact UTF8 HTML, cookie/CSP/cache headers and response status", async () => {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "script-src 'nonce-fixed'",
    "Cache-Control": "private, no-store",
    "CDN-Cache-Control": "private, no-store",
    "Vary": "Cookie, Accept-Language",
    "ETag": '"old-representation"',
    "Content-MD5": "obsolete",
    "Digest": "sha-256=obsolete",
    "Content-Digest": "sha-256=:obsolete:",
    "Repr-Digest": "sha-256=:obsolete:",
    "Content-Length": "1",
  });
  headers.append("Set-Cookie", "fixture_a=one; HttpOnly; SameSite=Lax");
  headers.append("Set-Cookie", "fixture_b=two; HttpOnly; SameSite=Lax");
  const response = await compressHtmlResponse(new Response(html, { status: 201, statusText: "Created", headers }), "gzip");
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(gunzipSync(body).toString("utf8"), html);
  assert.equal(response.status, 201);
  assert.equal(response.statusText, "Created");
  assert.equal(response.headers.get("Content-Encoding"), "gzip");
  assert.equal(response.headers.get("Content-Length"), String(body.byteLength));
  assert.equal(response.headers.get("Vary"), "Cookie, Accept-Language, Accept-Encoding");
  for (const name of ["Content-Type", "Content-Security-Policy", "Cache-Control", "CDN-Cache-Control"]) {
    assert.equal(response.headers.get(name), headers.get(name), name);
  }
  assert.deepEqual(response.headers.getSetCookie(), headers.getSetCookie());
  for (const name of ["ETag", "Content-MD5", "Digest", "Content-Digest", "Repr-Digest"]) assert.equal(response.headers.has(name), false, name);
});

test("identity response varies by encoding without changing bytes, cookies or existing validators", async () => {
  for (const encoding of [null, "gzip;q=0, *;q=1", "br"]) {
    const original = new Response(html, { headers: { "Content-Type": "text/html", ETag: '"identity"', "Cache-Control": "private, no-store", "Set-Cookie": "fixture=one", "Content-Length": String(Buffer.byteLength(html)) } });
    const response = await compressHtmlResponse(original, encoding);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get("Content-Encoding"), null);
    assert.equal(response.headers.get("Content-Length"), String(Buffer.byteLength(html)));
    assert.equal(response.headers.get("ETag"), '"identity"');
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Set-Cookie"), "fixture=one");
    assert.equal(response.headers.get("Vary"), "Accept-Encoding");
  }
});

test("existing Vary encoding and wildcard values are preserved without duplication", async () => {
  for (const vary of ["Cookie, accept-encoding", "*"]) {
    const response = await compressHtmlResponse(new Response(html, { headers: { "Content-Type": "text/html", Vary: vary } }), "gzip");
    assert.equal(response.headers.get("Vary"), vary);
  }
});

test("unacceptable gzip and identity return no-body406; explicit identity overrides a zero wildcard", async () => {
  for (const encoding of ["gzip;q=0, identity;q=0", "*;q=0", "br, *;q=0", "gzip;q=0, identity;q=0, *;q=1"]) {
    const response = await compressHtmlResponse(new Response(html, { headers: {
      "Content-Type": "text/html", "Content-Length": "100", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "script-src 'nonce-fixed'", "Set-Cookie": "fixture=one", ETag: '"obsolete"',
    } }), encoding);
    assert.equal(response.status, 406, encoding);
    assert.equal(response.body, null);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("Content-Length"), "0");
    assert.equal(response.headers.get("Vary"), "Accept-Encoding");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Content-Security-Policy"), "script-src 'nonce-fixed'");
    assert.equal(response.headers.get("Set-Cookie"), "fixture=one");
    assert.equal(response.headers.has("ETag"), false);
  }
  const identity = await compressHtmlResponse(new Response(html, { headers: { "Content-Type": "text/html" } }), "*;q=0, identity;q=1");
  assert.equal(identity.status, 200);
  assert.equal(await identity.text(), html);
  assert.equal(identity.headers.has("Content-Encoding"), false);
});

test("nonHTML, already encoded, range and bodyless responses pass through untouched", async () => {
  for (const response of [
    new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }),
    new Response(gzipSync(html), { headers: { "Content-Type": "text/html", "Content-Encoding": "gzip", ETag: '"upstream"' } }),
    new Response(html, { status: 206, headers: { "Content-Type": "text/html", "Content-Range": "bytes 0-12/100" } }),
    new Response(null, { status: 204, headers: { "Content-Type": "text/html" } }),
    new Response(null, { headers: { "Content-Type": "text/html", "Content-Length": "100" } }),
  ]) {
    assert.equal(await compressHtmlResponse(response, "gzip"), response);
    assert.equal(response.bodyUsed, false);
  }
});

test("CSP middleware compresses only after exact nonce/head processing", async () => {
  const response = await cspMiddleware({ url: new URL("http://127.0.0.1/search"), req: { method: "GET", headers: new Headers({ "Accept-Encoding": "gzip" }) } }, async () => new Response(html, { headers: { "Content-Type": "text/html", "Set-Cookie": "fixture=one" } }));
  assert.ok(response instanceof Response);
  const nonce = response.headers.get("Content-Security-Policy").match(/'nonce-([^']+)'/)[1];
  const decoded = gunzipSync(new Uint8Array(await response.arrayBuffer())).toString("utf8");
  assert.equal(decoded, stripModulePreloadsForPath(applyDocumentNonces(html, nonce), "/search"));
  assert.equal(response.headers.get("Set-Cookie"), "fixture=one");
});

test("CSP middleware leaves upstream encoded HTML and its authored CSP byte-for-byte intact", async () => {
  const encoded = gzipSync(html);
  const original = new Response(encoded, { headers: { "Content-Type": "text/html", "Content-Encoding": "gzip", "Content-Security-Policy": "script-src 'nonce-upstream'", ETag: '"upstream"', "Cache-Control": "private, no-store", "Set-Cookie": "fixture=one" } });
  const response = await cspMiddleware({ url: new URL("http://127.0.0.1/parent"), req: { method: "GET", headers: new Headers({ "Accept-Encoding": "gzip" }) } }, async () => original);
  assert.equal(response, original);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(encoded));
  assert.equal(response.headers.get("Content-Security-Policy"), "script-src 'nonce-upstream'");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("ETag"), '"upstream"');
});
