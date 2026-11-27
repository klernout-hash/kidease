import assert from "node:assert/strict";
import test from "node:test";
import { createAppTabOwnership } from "../src/lib/app-tab-ownership.ts";

test("an overlapping Shell takes over as soon as the old primary unmounts", () => {
  const ownership = createAppTabOwnership();
  const old = Symbol(), next = Symbol();
  const states = [];
  const unsubscribe = ownership.subscribe(() => states.push(ownership.isPrimary(next)));
  const leaveOld = ownership.mount(old);
  const leaveNext = ownership.mount(next);
  assert.equal(ownership.isPrimary(old), true);
  assert.equal(ownership.isPrimary(next), false);
  leaveOld();
  assert.equal(ownership.isPrimary(next), true);
  assert.deepEqual(states, [false, false, true]);
  unsubscribe();
  leaveNext();
  assert.equal(states.length, 3);
});

test("closing a nested Shell leaves the current primary alone; later mounts can become primary", () => {
  const ownership = createAppTabOwnership();
  const old = Symbol(), nested = Symbol(), fresh = Symbol();
  const leaveOld = ownership.mount(old);
  ownership.mount(nested)();
  assert.equal(ownership.isPrimary(old), true);
  leaveOld();
  const leaveFresh = ownership.mount(fresh);
  assert.equal(ownership.isPrimary(fresh), true);
  assert.equal(ownership.isPrimary(old), false);
  leaveFresh();
});
