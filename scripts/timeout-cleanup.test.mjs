import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { withTimeout, withTimeoutFallback } from "../src/lib/timeout.ts";

test("settled startup reads do not keep a server process alive until their deadline", () => {
  const moduleUrl = new URL("../src/lib/timeout.ts", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import { withTimeout, withTimeoutFallback } from ${JSON.stringify(moduleUrl)};
    assert.equal(await withTimeout(Promise.resolve("ready"), 60000, "late"), "ready");
    assert.equal(await withTimeoutFallback(Promise.reject(new Error("unavailable")), 60000, "fallback"), "fallback");
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 1500,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test("timeouts still reject and fallbacks keep their existing failure behavior", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10, "boot unavailable"), /boot unavailable/);
  assert.equal(await withTimeoutFallback(new Promise(() => {}), 10, false), false);
  await assert.rejects(withTimeout(Promise.reject(new Error("source error")), 100, "late"), /source error/);
});
