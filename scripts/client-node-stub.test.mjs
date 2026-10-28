import assert from "node:assert/strict";
import test from "node:test";
import { rewriteNodeBuiltinImports } from "./client-node-stub.mjs";

test("login-safe rewrite drops static node:crypto imports", () => {
  const source = `import { createHmac, timingSafeEqual } from "node:crypto";\nexport function sign() { return createHmac("sha256", "k"); }\n`;
  const out = rewriteNodeBuiltinImports(source);
  assert.doesNotMatch(out, /from ["']node:crypto["']/);
  assert.match(out, /__keNodeBuiltin\("node:crypto"\)/);
  assert.match(out, /function createHmac\(/);
  assert.match(out, /function timingSafeEqual\(/);
  assert.match(out, /createHmac\("sha256", "k"\)/);
});

test("type-only node imports stay put", () => {
  const source = `import type { KeyObject } from "node:crypto";\nexport type K = KeyObject;\n`;
  assert.equal(rewriteNodeBuiltinImports(source), source);
});

test("aliased constructors stay constructable", () => {
  const source = `import { AsyncLocalStorage } from "node:async_hooks";\nconst frames = new AsyncLocalStorage();\n`;
  const out = rewriteNodeBuiltinImports(source);
  assert.match(out, /return class AsyncLocalStorage/);
  assert.match(out, /new AsyncLocalStorage\(\)/);
  assert.doesNotMatch(out, /from ["']node:async_hooks["']/);
});

test("path helpers used at module scope do not throw in the browser fallback", () => {
  const source = `import { join } from "node:path";\nconst file = join("public", "icon-512.png");\n`;
  const out = rewriteNodeBuiltinImports(source);
  assert.match(out, /function join\(/);
  assert.match(out, /join\("public", "icon-512.png"\)/);
});
