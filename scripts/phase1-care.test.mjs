import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  allergenConflict,
  audienceCanSee,
  canSeeAllergyBadge,
  emergencyRoll,
  guardianCanEditPickup,
  incidentVisible,
  mediaAllowed,
  pickupAllowed,
  pickupOverrideNotice,
  portfolioVisible,
  redactOtherChildren,
  restrictedListVisible,
  rollAlert,
  ALLERGEN_LABELS,
} from "../src/lib/phase1-care.ts";

test("news and photos stay inside the consented audience", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FAMILY_NEWSFEED, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_MEDIA_CONSENT, false);
  assert.equal(audienceCanSee(["fam-a"], "fam-b"), false);
  assert.equal(mediaAllowed({ taggedChildIds: ["c1", "c2"], consentedChildIds: ["c1"] }), false);
  assert.equal(mediaAllowed({ taggedChildIds: ["c1"], consentedChildIds: ["c1", "c2"] }), true);
});

test("a restricted pickup cannot be chosen and an override is only held", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PICKUP_VERIFY, false);
  assert.equal(pickupAllowed({ contactId: "x", activeIds: ["x"], restrictedIds: ["x"] }).reason, "restricted");
  assert.equal(pickupAllowed({ contactId: "y", activeIds: ["x"], restrictedIds: [] }).reason, "unlisted");
  assert.equal(pickupAllowed({ contactId: "x", activeIds: ["x"], restrictedIds: [] }).ok, true);
  const note = pickupOverrideNotice({
    flagOn: true,
    enabledAt: "2026-11-01T00:00:00.000Z",
    at: "2026-11-11T15:00:00.000Z",
    alreadySent: false,
    quiet: true,
  });
  assert.equal(note.deliver, false);
  assert.equal(note.reason, "quiet");
  assert.equal(guardianCanEditPickup(["g1"], "g2"), false);
  assert.equal(restrictedListVisible("staff"), false);
  assert.equal(restrictedListVisible("director"), true);
});

test("an emergency roll keeps later check-ins and does not auto-clear", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_EMERGENCY_ROLL, false);
  const roll = emergencyRoll({
    opened: [{ id: "a", accounted: false }],
    laterCheckIns: [{ id: "b", accounted: false }],
  });
  assert.equal(roll.length, 2);
  assert.equal(roll.every((person) => person.accounted), false);
  assert.equal(rollAlert(11, 1), true);
  assert.equal(rollAlert(11, 0), false);
});

test("allergens use the priority list and badges hide from guests", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_ALLERGEN_MENU, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_ALLERGY_BADGE, false);
  assert.equal(allergenConflict(["milk"], ["milk"]), "conflict");
  assert.equal(allergenConflict(["mystery"], ["milk"]), "unknown");
  assert.equal(allergenConflict(["soy"], ["milk"]), "clear");
  assert.equal(ALLERGEN_LABELS.wheat.fr, "Blé");
  assert.equal(canSeeAllergyBadge("read_only"), false);
  assert.equal(canSeeAllergyBadge("staff"), true);
});

test("incidents and portfolios stay with that child's guardians", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_INCIDENT_SHARE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_INCIDENT_EXPORT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CHILD_PORTFOLIO, false);
  assert.equal(incidentVisible({ childId: "c1", viewerChildIds: ["c2"] }), false);
  assert.equal(redactOtherChildren("Ava and Sam played", ["Sam"]), "Ava and [other child] played");
  assert.equal(portfolioVisible(["g1"], "g2"), false);
});
