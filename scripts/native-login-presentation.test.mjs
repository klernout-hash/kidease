import assert from "node:assert/strict";
import test from "node:test";
import { waitToShowNativeLogin } from "../src/lib/auth/native-login-presentation.ts";

const initial = {
  native: true,
  explicitFlow: false,
  sessionPending: true,
  hasUser: false,
  resume: "idle",
  busy: false,
  interrupted: false,
};
const waiting = (overrides) => waitToShowNativeLogin({ ...initial, ...overrides });
test("native login waits through session lookup, resolved user, and desk continuation", () => {
  assert.equal(waiting({}), true);
  assert.equal(waiting({ sessionPending: false, hasUser: true }), true);
  assert.equal(waiting({ sessionPending: false, hasUser: true, busy: true, resume: "opening" }), true);
});
test("native guests and explicit sign-out still get the regular login", () => {
  assert.equal(waiting({ sessionPending: false }), false);
  assert.equal(waiting({ resume: "signed-out", hasUser: true, sessionPending: false }), false);
});
test("web, expired login, OAuth errors and signup keep their forms", () => {
  assert.equal(waiting({ native: false }), false);
  assert.equal(waiting({ explicitFlow: true }), false);
});
test("failed or stalled continuation restores retry; manual login stays mounted", () => {
  assert.equal(waiting({ interrupted: true, resume: "opening" }), false);
  assert.equal(waiting({ busy: true, hasUser: true }), false);
});
