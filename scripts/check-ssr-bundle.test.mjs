import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { undeclaredSsrExports } from "./check-ssr-bundle.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("nitro inlines SSR dynamic imports to avoid the ssr_exports ESM crash", () => {
  const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /inlineDynamicImports:\s*true/);
  assert.match(viteConfig, /TanStack\/router\/issues\/8031/);
});

test("detects a Rolldown-style undeclared ssr_exports re-export", () => {
  const broken = `
var server_exports = /* @__PURE__ */ __exportAll({ getResponseHeaders: () => getResponseHeaders });
export { ssr_exports as a, createServerEntry, server_default as default };
`;
  assert.equal(undeclaredSsrExports(broken), true);
});

test("accepts a chunk that actually declares ssr_exports", () => {
  const ok = `
var ssr_exports = /* @__PURE__ */ __exportAll({ createServerEntry: () => createServerEntry });
export { ssr_exports as a, createServerEntry };
`;
  assert.equal(undeclaredSsrExports(ok), false);
});

test("ignores modules that never mention ssr_exports", () => {
  assert.equal(undeclaredSsrExports("export const x = 1;"), false);
});
