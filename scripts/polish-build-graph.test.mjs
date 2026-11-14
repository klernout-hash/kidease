import assert from "node:assert/strict";
import test from "node:test";
import { buildGraph, polishBuildGraphPlugin } from "./polish-build-graph.mjs";

const chunk = (fileName, { imports = [], dynamicImports = [], modules = {}, entry = false } = {}) => ({
  type: "chunk", fileName, code: `/* ${fileName} */`, imports, dynamicImports, modules,
  isEntry: entry, isDynamicEntry: !entry,
});

test("static closure handles cycles and excludes dynamically imported SDKs", () => {
  const graph = buildGraph({
    "entry.js": chunk("entry.js", { entry: true, imports: ["shared.js"], dynamicImports: ["map.js"], modules: { "/repo/src/client.ts": {} } }),
    "shared.js": chunk("shared.js", { imports: ["entry.js"], modules: { "/repo/src/shared.ts": {} } }),
    "map.js": chunk("map.js", { modules: { "/repo/node_modules/maplibre-gl/index.js": {} } }),
  }, { root: "/repo", entryInputCount: 1 });
  assert.deepEqual(graph.initial.chunkNames, ["entry.js", "shared.js"]);
  assert.deepEqual(graph.initial.moduleIds, ["src/client.ts", "src/shared.ts"]);
  assert.deepEqual(graph.initial.heavySdkModules, []);
  assert.deepEqual(graph.chunks.find((item) => item.fileName === "map.js").heavySdkModules, ["node_modules/maplibre-gl/index.js"]);
  assert.equal(graph.entryInputCount, 1);
  assert.equal(graph.initial.rawBytes, Buffer.byteLength("/* entry.js *//* shared.js */"));
  assert.ok(graph.initial.gzip9Bytes > 0);
});

test("observer is disabled by default and limited to client builds when enabled", () => {
  assert.equal(polishBuildGraphPlugin({ out: "" }), undefined);
  const plugin = polishBuildGraphPlugin({ out: "/task/evidence/graph.json" });
  assert.equal(plugin.apply, "build");
  assert.equal(plugin.applyToEnvironment({ name: "client" }), true);
  assert.equal(plugin.applyToEnvironment({ name: "server" }), false);
});

test("rendered metadata distinguishes removed code from real declarations and unknown metadata", () => {
  const declaration = "export const feature = false;";
  const graph = buildGraph({
    "entry.js": chunk("entry.js", { entry: true, modules: {
      "/repo/src/removed.ts": { renderedLength: 0, renderedExports: [], code: null },
      "/repo/src/declaration.ts": { renderedLength: declaration.length, renderedExports: ["feature"], code: declaration },
      "/repo/src/unknown.ts": {},
      "/repo/src/private-detail.ts": {
        renderedLength: 10, renderedExports: [],
        get code() { throw new Error("Unrequested module code must not be read"); },
      },
    } }),
  }, { root: "/repo", codeModuleIds: ["src/removed.ts", "src/declaration.ts"] });
  assert.deepEqual(graph.initial.zeroRenderedModuleIds, ["src/removed.ts"]);
  assert.deepEqual(graph.initial.unknownRenderedModuleIds, ["src/unknown.ts"]);
  assert.deepEqual(graph.initial.renderedModuleIds, ["src/declaration.ts", "src/private-detail.ts"]);
  const modules = graph.chunks[0].renderedModules;
  assert.deepEqual(modules.find(({ id }) => id === "src/declaration.ts"), {
    id: "src/declaration.ts", renderedLength: declaration.length, renderedExports: ["feature"], code: declaration,
  });
  assert.equal(modules.find(({ id }) => id === "src/removed.ts").code, null);
  assert.equal(Object.hasOwn(modules.find(({ id }) => id === "src/private-detail.ts"), "code"), false);
});
