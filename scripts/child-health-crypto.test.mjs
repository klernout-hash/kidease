import assert from "node:assert/strict";
import { test } from "node:test";
import { openHealth, sealHealth } from "../src/lib/child-health-crypto.ts";

const env = { CHILD_HEALTH_KEY: "a".repeat(64) };

test("health text seals and opens, and ciphertext is not shown without the key", () => {
  const sealed = sealHealth("peanuts", env);
  assert.match(sealed, /^ke1:/);
  assert.equal(openHealth(sealed, env), "peanuts");
  assert.equal(openHealth(sealed, {}), "");
  assert.equal(sealHealth("peanuts", {}), "peanuts");
  assert.equal(openHealth("peanuts", env), "peanuts");
});
