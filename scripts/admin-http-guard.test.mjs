import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

// Direct fixture invocation must stop before Nitro/database initialization,
// without reflecting the rejected value in Node's uncaught-error output.
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
for (const [key, message] of [
  ["DATABASE_URL", "Synthetic HTTP instance refuses database configuration"],
  ["VERCEL", "Synthetic HTTP instance refuses deployment configuration"],
  ["E2E_ROLE_FIXTURE", "Synthetic HTTP instance refuses authentication fixtures"],
]) {
  test(`direct HTTP fixture rejects ${key} without exposing its value`, () => {
    const sentinel = `synthetic-sensitive-value-${randomBytes(20).toString("hex")}`;
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/fixtures/admin-http-instance.mjs"],
      { env: { ...env, [key]: sentinel }, encoding: "utf8", timeout: 15_000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    const output = child.stdout + child.stderr;
    assert.ok(output.includes(message), "Expected static refusal before app initialization");
    assert.ok(!output.includes(sentinel), "Rejected values must never be printed");
  });
}

test("direct HTTP fixture refuses a missing ephemeral secret before app initialization", () => {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/fixtures/admin-http-instance.mjs"],
    { env, encoding: "utf8", timeout: 15_000 },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.ok(
    (child.stdout + child.stderr).includes(
      "Synthetic HTTP instance requires an ephemeral signing secret",
    ),
  );
});
