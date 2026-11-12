import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("module initialization disables schema construction and first parse Function probes", () => {
  const source = `
    import assert from 'node:assert/strict';
    let probes = 0;
    globalThis.Function = new Proxy(globalThis.Function, {
      apply() { probes += 1; throw new Error('CSP blocks eval'); },
      construct() { probes += 1; throw new Error('CSP blocks eval'); },
    });
    const { installZodCsp } = await import('./src/lib/zod-csp.ts');
    const { config } = await import('zod/v4/core');
    const { z } = await import('zod');
    assert.equal(config().jitless, true);
    assert.deepEqual(z.object({ path: z.string().min(1) }).parse({ path: '/fr/search' }), { path: '/fr/search' });
    assert.equal(probes, 0);
    config({ jitless: false });
    installZodCsp();
    assert.equal(config().jitless, true);
  `;
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], {
    cwd: root,
    timeout: 10_000,
    stdio: "pipe",
  });
});

test("startup calls the installer before starting hydration", () => {
  const client = readFileSync(join(root, "src/client.tsx"), "utf8");
  const installAt = client.indexOf("installZodCsp();");
  assert.ok(installAt > client.indexOf('import { installZodCsp } from "./lib/zod-csp"'));
  assert.ok(installAt < client.indexOf("function paint()"));
});
