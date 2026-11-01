import assert from "node:assert/strict";
import { test } from "node:test";
import {
  childProfileEnabled,
  daycareMaySeeProfile,
  parseCarePeople,
  pickupAllowed,
  profileChangeAudience,
} from "../src/lib/wiring/child-profile.ts";

test("child profile is parent-owned and checks pickup names", () => {
  assert.equal(childProfileEnabled({}), false);
  assert.equal(daycareMaySeeProfile({ enrolled: true, shared: false }), false);
  assert.equal(daycareMaySeeProfile({ enrolled: true, shared: true }), true);
  const people = parseCarePeople([{ name: "Amina Khan", phone: "2045550100", relationship: "aunt" }]);
  assert.ok(Array.isArray(people));
  if (!Array.isArray(people)) return;
  assert.deepEqual(pickupAllowed("amina  khan", people), { ok: true });
  assert.equal(pickupAllowed("Someone Else", people).ok, false);
  assert.equal(profileChangeAudience("parent"), "provider");
  assert.equal(profileChangeAudience("provider"), "parent");
});
