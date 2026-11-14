import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { rolldown } from "rolldown";
import { startupChunkGroup, startupChunksPlugin } from "./startup-chunks.mjs";

test("startup consolidation applies only to the client and preserves existing named groups", () => {
  const plugin = startupChunksPlugin();
  const original = { codeSplitting: { groups: [{ name: "product-events", priority: 0 }] } };
  assert.equal(plugin.applyToEnvironment({ name: "client" }), true);
  for (const name of ["ssr", "server", "nitro"]) {
    assert.equal(plugin.applyToEnvironment({ name }), false);
    assert.equal(plugin.outputOptions.call({ environment: { name } }, original), undefined);
  }
  const client = plugin.outputOptions.call({ environment: { name: "client" } }, original);
  assert.equal(client.codeSplitting.groups[0], original.codeSplitting.groups[0]);
  assert.equal(original.codeSplitting.groups.length, 1);
  assert.ok(client.codeSplitting.groups[1].priority < original.codeSplitting.groups[0].priority);
});

test("real emitted chunks preserve startup effects and keep optional map/desk modules lazy", async () => {
  const sources = new Map([
    ["/repo/src/entry.js", `
      import { timeoutValue } from "/repo/src/lib/timeout.ts";
      import { helperValue } from "/repo/src/lib/utils.ts";
      globalThis.__keChunkEffects.push("entry");
      export const answer = timeoutValue + helperValue;
      export const openMap = () => import("/repo/node_modules/maplibre-gl/index.js").then(m => m.value);
      export const openDesk = () => import("/repo/src/lib/server/earnings-desk.ts").then(m => m.value);
      export const openFeature = () => import("/repo/src/lib/features.ts").then(m => m.value);
    `],
    ["/repo/src/lib/timeout.ts", 'globalThis.__keChunkEffects.push("timeout"); export const timeoutValue = 20;'],
    ["/repo/src/lib/utils.ts", 'globalThis.__keChunkEffects.push("helper"); export const helperValue = 22;'],
    ["/repo/node_modules/maplibre-gl/index.js", 'globalThis.__keChunkEffects.push("map"); export const value = "map-ready";'],
    ["/repo/src/lib/server/earnings-desk.ts", 'globalThis.__keChunkEffects.push("desk"); export const value = "desk-ready";'],
    ["/repo/src/lib/features.ts", 'globalThis.__keChunkEffects.push("feature"); export const value = "feature-ready";'],
  ]);
  const previousEffects = globalThis.__keChunkEffects;
  const directory = await mkdtemp(join(tmpdir(), "kidease-startup-chunks-"));
  const runs = [];
  try {
    for (const grouped of [false, true]) {
      const bundle = await rolldown({
        input: "/repo/src/entry.js",
        plugins: [{
          name: "startup-fixture",
          resolveId(id) { return sources.has(id) ? id : null; },
          load(id) { return sources.get(id) ?? null; },
        }],
      });
      let output;
      try {
        ({ output } = await bundle.generate({
          format: "es",
          entryFileNames: `${grouped ? "grouped" : "control"}-[name].mjs`,
          chunkFileNames: `${grouped ? "grouped" : "control"}-[name]-[hash].mjs`,
          codeSplitting: { groups: grouped ? [startupChunkGroup()] : [] },
        }));
      } finally {
        await bundle.close();
      }
      const chunks = output.filter((item) => item.type === "chunk");
      const entry = chunks.find((chunk) => chunk.isEntry);
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const initial = new Set();
      const visit = (name) => {
        if (initial.has(name)) return;
        initial.add(name);
        for (const dependency of byName.get(name).imports) visit(dependency);
      };
      visit(entry.fileName);
      const initialModules = [...initial].flatMap((name) => Object.keys(byName.get(name).modules)).sort();
      assert.deepEqual(initialModules, ["/repo/src/entry.js", "/repo/src/lib/timeout.ts", "/repo/src/lib/utils.ts"]);
      if (grouped) assert.ok(chunks.some((chunk) => chunk.fileName.includes("startup-shared") && Object.keys(chunk.modules).length === 2));
      for (const chunk of chunks) await writeFile(join(directory, chunk.fileName), chunk.code);
      globalThis.__keChunkEffects = [];
      const module = await import(pathToFileURL(join(directory, entry.fileName)).href);
      const startup = [...globalThis.__keChunkEffects];
      assert.equal(module.answer, 42);
      assert.deepEqual(startup, ["timeout", "helper", "entry"]);
      assert.equal(await module.openMap(), "map-ready");
      assert.equal(await module.openDesk(), "desk-ready");
      assert.equal(await module.openFeature(), "feature-ready");
      assert.deepEqual(globalThis.__keChunkEffects, [...startup, "map", "desk", "feature"]);
      runs.push({ answer: module.answer, startup, initialModules });
    }
    assert.deepEqual(runs[1], runs[0]);
  } finally {
    if (previousEffects === undefined) delete globalThis.__keChunkEffects;
    else globalThis.__keChunkEffects = previousEffects;
    await rm(directory, { recursive: true, force: true });
  }
});
