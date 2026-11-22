import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/lib/auth/server.ts"), "utf8");

test("provider sign-in cannot merge into an unverified password account", () => {
  assert.match(server, /requireLocalEmailVerified:\s*true/);
  assert.doesNotMatch(server, /requireLocalEmailVerified:\s*false/);
});
