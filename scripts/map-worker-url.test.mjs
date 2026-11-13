import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Execute the actual initializer, substituting only browser imports.
const source = readFileSync(new URL("../src/lib/osm-map.ts", import.meta.url), "utf8");
const start = source.indexOf("let libPromise:");
const end = source.indexOf("/** @deprecated", start);
assert.ok(start > 0 && end > start);
const compiled = ts.transpileModule(source.slice(start, end).replaceAll("import.meta.url", "__moduleUrl"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function initializer(moduleUrl = "https://preview.example/src/lib/osm-map.ts", browser = {}) {
  let failImport = false;
  const urls = [];
  const imports = [];
  const ml = { setWorkerUrl: (url) => urls.push(url) };
  const module = { exports: {} };
  const load = (name) => {
    imports.push(name);
    if (name === "maplibre-gl") {
      if (failImport) throw new Error("Temporary library load failure");
      return ml;
    }
    if (name === "maplibre-gl/dist/maplibre-gl.css") return {};
    throw new Error(`Unexpected browser dependency: ${name}`);
  };
  new Function("require", "module", "exports", "window", "__moduleUrl", compiled)(load, module, module.exports, browser, moduleUrl);
  return { load: module.exports.preloadOsmMap, urls, imports, ml, fail: (value) => { failImport = value; } };
}

test("MapLibre receives the emitted worker URL and shares initialization", async () => {
  const app = initializer();
  const first = app.load();
  assert.equal(app.load(), first);
  assert.equal(await first, app.ml);
  assert.equal(await app.load(), app.ml);
  assert.deepEqual(app.urls, ["https://preview.example/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"]);
  assert.equal(app.imports.length, 2);
  assert.ok(app.imports.every((name) => !name.includes("maplibre-gl-worker")), "The worker is not executed on the main thread");
});

test("A failed library import is retryable without assigning a worker class", async () => {
  const app = initializer();
  app.fail(true);
  await assert.rejects(app.load(), /Temporary library load failure/);
  assert.deepEqual(app.urls, []);
  app.fail(false);
  assert.equal(await app.load(), app.ml);
  assert.equal(typeof app.urls[0], "string");
  assert.equal(app.urls.length, 1);
});

test("server execution rejects before loading browser dependencies", async () => {
  const module = { exports: {} };
  new Function("require", "module", "exports", "window", "__moduleUrl", compiled)(() => { throw new Error("Browser import reached server"); }, module, module.exports, undefined, "file:///server/index.mjs");
  await assert.rejects(module.exports.preloadOsmMap(), /Map is browser-only/);
});
