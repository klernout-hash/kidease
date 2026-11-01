import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dsrPropagationEnabled, governmentDsrVisible, openDsr } from "../src/lib/wiring/dsr-propagation.ts";

const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/lib/server/wiring/dsr-propagation.ts"), "utf8");

test("a retention hold blocks deletion and does not sign the person out", () => {
  assert.equal(dsrPropagationEnabled({}), false);
  const blocked = openDsr({ kind: "delete", held: true, roles: ["parent", "provider", "admin"] });
  assert.equal(blocked.ok && blocked.status, "blocked");
  assert.deepEqual(blocked.ok && blocked.targets, []);
  const exported = openDsr({ kind: "export", held: true, roles: ["admin"] });
  assert.equal(exported.ok && exported.status, "with_roles");
  assert.equal(governmentDsrVisible("MB", "ON"), false);
  assert.match(server, /retention_holds/);
  assert.doesNotMatch(server, /signOut|deleteSession|revoke session/i);
});
