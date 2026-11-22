import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assertGovSecondFactorVerified,
  govCallAllowed,
  govVerifyPath,
  GovSecondFactorError,
} from "../src/lib/gov/second-factor.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a government data call needs the email code or a passkey cookie", () => {
  assert.equal(govCallAllowed(true), true);
  assert.equal(govCallAllowed(false), false);
  assert.doesNotThrow(() => assertGovSecondFactorVerified(true));
  assert.throws(() => assertGovSecondFactorVerified(false), GovSecondFactorError);
  assert.equal(govVerifyPath("en", "/gov"), "/verify-2fa?next=%2Fgov");
  assert.equal(govVerifyPath("fr", "/fr/gov"), "/fr/verify-2fa?next=%2Ffr%2Fgov");
});

test("gov server functions and the export API check the second step", () => {
  const middleware = src("src/lib/auth/gov-middleware.ts");
  assert.match(middleware, /assertGovSecondFactorVerified/);
  assert.match(middleware, /isCurrentUserTwoFactorVerified/);
  assert.match(src("src/routes/api/gov.export.ts"), /govCallAllowed/);
  assert.match(src("src/lib/server/gov-portal.ts"), /needSecondFactor/);
  assert.match(src("src/lib/gov/desk-guard.ts"), /govVerifyPath/);
  assert.match(src("src/lib/server/gov-actor.server.ts"), /assertGovSecondFactorVerified/);
});
