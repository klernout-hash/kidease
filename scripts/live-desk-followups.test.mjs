import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parentPayEmptyKey, parentPayLeadKey, tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const PLAN = /Parent Plus|Plus parents|KidEase plan|forfait|abonnement/i;

test("parent Pay hides plan sentences while subscriptions are off", () => {
  for (const locale of ["en", "fr"]) {
    for (const live of [true, false]) {
      const lead = tx(locale, parentPayLeadKey(false, live));
      const empty = tx(locale, parentPayEmptyKey(false));
      assert.doesNotMatch(lead, PLAN);
      assert.doesNotMatch(empty, PLAN);
    }
    assert.match(tx(locale, parentPayLeadKey(true, true)), PLAN);
  }
  assert.match(tx("en", "ledgerLiveParentBills"), /KidEase’s platform fee comes from the daycare/);
  assert.match(tx("en", "ledgerLiveParent"), /KidEase’s platform fee comes from the daycare/);
  assert.match(tx("fr", "ledgerLiveParentBills"), /Les frais de plateforme KidEase viennent du versement à la garderie/);
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /const plansOn = !storeShell && desks\?\.subscriptionsEnabled === true/);
  assert.match(desk, /plansOn=\{plansOn\}/);
  assert.match(desk, /parentPayEmptyKey\(plansOn\)/);
  const badge = src("src/components/listing-status-badge.tsx");
  assert.match(badge, /const showPlans = !storeShell && subscriptionsOn/);
  assert.match(badge, /parentPayLeadKey\(showPlans, stripeLive\)/);
});

test("unclaimed listings explain tours instead of listing times", () => {
  const tours = src("src/components/listing-tour-times.tsx");
  const fetchAt = tours.indexOf("void listPublicTourSlots");
  const guard = tours.slice(tours.lastIndexOf("if (!canBook)", fetchAt), fetchAt);
  assert.match(guard, /if \(!canBook\) return/);
  assert.match(tours, /data-tour-unclaimed/);
  assert.match(tours, /tourTimesUnclaimed/);
  assert.match(tx("en", "tourTimesUnclaimed"), /can’t book a visit/);
  assert.match(tx("fr", "tourTimesUnclaimed"), /ne pouvez pas réserver une visite/);
  assert.doesNotMatch(tx("en", "tourTimesUnclaimed"), /spots left/i);
});

test("profile bio save ignores a stale load and checks the stored bio", () => {
  const account = src("src/routes/account.tsx");
  assert.match(account, /bioRef/);
  assert.match(account, /contactEpoch/);
  assert.match(account, /contactDirty/);
  assert.match(account, /if \(epoch !== contactEpoch\.current\) return/);
  assert.match(account, /if \(saved\.bio !== nextBio\)/);
  assert.match(account, /bioRef\.current = e\.target\.value/);
  const profile = src("src/lib/server/profile-contact.ts");
  assert.match(profile, /export const getMyContact = createServerFn\(\{ method: "POST" \}\)/);
  const save = profile.slice(profile.indexOf("export const saveMyContact"));
  assert.match(save, /select display_name, phone, bio(?:, created_at)? from profiles where user_id/);
  assert.match(save, /bio: row\?\.bio\?\.trim\(\) \|\| ""/);
});
