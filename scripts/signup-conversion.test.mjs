import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { claimProgress } from "../src/lib/claim-progress.ts";
import {
  addGuestShortlist,
  readGuestShortlist,
  takeGuestShortlist,
} from "../src/lib/guest-shortlist.ts";
import { parentLoginSearch, parentSignupSearch } from "../src/lib/auth/parent-login.ts";
import {
  isSignupWhy,
  signupFunnelPayload,
  signupPromptStep,
} from "../src/lib/signup-funnel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage() {
  const bag = new Map();
  return {
    getItem(key) {
      return bag.has(key) ? bag.get(key) : null;
    },
    setItem(key, value) {
      bag.set(key, value);
    },
    removeItem(key) {
      bag.delete(key);
    },
  };
}

test("parent sign-up search keeps the return path and opens create-account", () => {
  assert.deepEqual(parentLoginSearch("/daycare/maple"), {
    role: "parent",
    desk: "parent",
    intent: "in",
    next: "/daycare/maple",
  });
  assert.deepEqual(parentSignupSearch("/search", "alerts"), {
    role: "parent",
    desk: "parent",
    intent: "up",
    next: "/search",
    why: "alerts",
  });
  assert.equal(isSignupWhy("save"), true);
  assert.equal(isSignupWhy("tour"), false);
  assert.equal(signupPromptStep("message"), "prompt_message");
});

test("funnel payload stays coarse", () => {
  const payload = signupFunnelPayload("shortlist_carried", { carried: 3, source: "login" });
  assert.deepEqual(payload, { step: "shortlist_carried", source: "login", carried: 3 });
  assert.equal("email" in payload, false);
});

test("guest shortlist keeps several centres and clears after take", () => {
  const storage = memoryStorage();
  addGuestShortlist({ id: "d_one", name: "One" }, storage);
  addGuestShortlist({ id: "d_two", name: "Two" }, storage);
  addGuestShortlist({ id: "bad id", name: "Nope" }, storage);
  assert.deepEqual(
    readGuestShortlist(storage).map((row) => row.id),
    ["d_two", "d_one"],
  );
  assert.equal(takeGuestShortlist(storage).length, 2);
  assert.deepEqual(readGuestShortlist(storage), []);
});

test("claim progress counts only facts that are on the listing", () => {
  const empty = claimProgress({});
  assert.equal(empty.done, 0);
  assert.equal(empty.total, 4);
  const partial = claimProgress({
    photos: ["/photos/real.jpg"],
    toddlerMonthly: 400,
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 48,
  });
  assert.deepEqual(
    partial.steps.map((step) => step.done),
    [true, true, true, false],
  );
  const answered = claimProgress({ availabilityKnown: true });
  assert.equal(answered.steps.find((step) => step.id === "spots")?.done, true);
});

test("high-intent sign-up and claim CTA are wired", () => {
  const save = src("src/components/save-listing-button.tsx");
  assert.match(save, /parentSignupSearch/);
  assert.match(save, /addGuestShortlist/);
  assert.match(src("src/components/waitlist-opt-in.tsx"), /why: "waitlist"|parentSignupSearch\([\s\S]*waitlist/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /claimFreeListing|ClaimListingCta/);
  assert.match(src("src/components/daycare-card.tsx"), /ClaimListingCta/);
  assert.match(src("src/routes/search.tsx"), /parentSignupSearch\("\/search", "alerts"\)/);
  assert.match(src("src/components/apply-pending-shortlist.tsx"), /takeGuestShortlist/);
  assert.match(src("src/lib/posthog.ts"), /consent === "denied"/);
  assert.match(src("src/routes/provider.tsx"), /ClaimProgressMeter/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /claimFreeListing: "Claim your free listing"/);
  assert.match(copy, /claimFreeListing: "Réclamez votre fiche gratuite"/);
  assert.doesNotMatch(copy, /claimFreeListing:[\s\S]{0,80}free forever/i);
  assert.doesNotMatch(src("src/lib/signup-funnel.ts"), /—/);
});
