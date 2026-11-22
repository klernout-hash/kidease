import assert from "node:assert/strict";
import { test } from "node:test";
import { healthEncryptionRequired, openHealth, sealHealth } from "../src/lib/child-health-crypto.ts";

const env = { CHILD_HEALTH_KEY: "a".repeat(64) };

test("health text seals and opens, and ciphertext is not shown without the key", () => {
  const sealed = sealHealth("peanuts", env);
  assert.match(sealed, /^ke1:/);
  assert.equal(openHealth(sealed, env), "peanuts");
  assert.equal(openHealth(sealed, {}), "");
  assert.equal(sealHealth("peanuts", {}), "peanuts");
  assert.equal(openHealth("peanuts", env), "peanuts");
  assert.equal(healthEncryptionRequired({ VERCEL_ENV: "production" }), true);
  assert.equal(healthEncryptionRequired({ VERCEL_ENV: "preview" }), false);
  const logs = [];
  const original = console.error;
  console.error = (...args) => {
    logs.push(args.map((part) => String(part)).join(" "));
  };
  try {
    assert.throws(() => sealHealth("peanuts", { VERCEL_ENV: "production" }), /unavailable/);
  } finally {
    console.error = original;
  }
  assert.match(logs.join("\n"), /CHILD_HEALTH_KEY is missing/);
  assert.equal(logs.join("\n").includes("peanuts"), false);
});
