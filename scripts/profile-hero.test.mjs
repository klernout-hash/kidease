import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { earlierJoinedAt, profileRoleId, showProfileStats, yearsOnKidEase } from "../src/lib/profile-hero.ts";

const root = new URL("../", import.meta.url);
const now = new Date(2026, 9, 27, 12);

test("years on KidEase stay hidden without a full year of real history", () => {
  assert.equal(yearsOnKidEase(null, now), null);
  assert.equal(yearsOnKidEase("not-a-date", now), null);
  assert.equal(yearsOnKidEase("2026-10-01T12:00:00.000Z", now), null);
  assert.equal(yearsOnKidEase("2027-01-01T00:00:00.000Z", now), null);
  assert.equal(yearsOnKidEase("2024-10-28T00:00:00.000Z", now), 1);
  assert.equal(yearsOnKidEase("2024-10-27T00:00:00.000Z", now), 2);
  assert.equal(yearsOnKidEase("2020-01-15T00:00:00.000Z", now), 6);
});

test("the earlier account date is the one that counts", () => {
  assert.equal(earlierJoinedAt(null, null), null);
  assert.equal(earlierJoinedAt("nope", "2024-01-02T00:00:00.000Z"), "2024-01-02T00:00:00.000Z");
  assert.equal(
    earlierJoinedAt("2025-05-01T00:00:00.000Z", "2022-03-01T00:00:00.000Z"),
    "2022-03-01T00:00:00.000Z",
  );
});

test("stats belong to a daycare desk, and a parent desk does not borrow them", () => {
  assert.equal(profileRoleId("provider", "parent"), "parent");
  assert.equal(showProfileStats(profileRoleId("provider", "parent")), false);
  assert.equal(profileRoleId("parent", "provider"), "daycare");
  assert.equal(showProfileStats(profileRoleId("parent", "provider")), true);
  assert.equal(profileRoleId("admin", null), "admin");
  assert.equal(profileRoleId("guest", null), null);
  assert.equal(showProfileStats(null), false);
});

test("the profile screen keeps edit and drops the footer stack", () => {
  const account = readFileSync(new URL("src/routes/account.tsx", root), "utf8");
  const hero = readFileSync(new URL("src/components/profile-hero.tsx", root), "utf8");
  assert.match(account, /data-ke="profile-edit"/);
  assert.match(account, /profileEmailVerified|emailVerified/);
  assert.doesNotMatch(account, /FooterMoreLinks/);
  assert.match(hero, /data-ke="profile-stats"/);
  assert.match(hero, /data-ke="profile-facts"/);
  assert.match(hero, /data-ke="profile-verified"/);
  assert.doesNotMatch(hero, /More/);
});
