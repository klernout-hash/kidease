import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  STORE_REVIEW_COOLDOWN_MS,
  STORE_REVIEW_LAST_KEY,
  appleAppStoreId,
  appleWriteReviewUrl,
  isAssignedAppleAppStoreId,
  isHappyMomentReason,
  isPlayPackageName,
  playPackageName,
  playWriteReviewUrl,
  parseReviewTimestamp,
  reviewCooldownElapsed,
  writeReviewUrlForPlatform,
} from "../src/lib/store-review.ts";
import { STORE } from "../src/lib/store-listing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("store review IDs stay placeholders", () => {
  it("does not invent an App Store numeric id", () => {
    assert.equal(STORE.appleAppStoreId, "");
    assert.equal(appleAppStoreId(), "");
    assert.equal(isAssignedAppleAppStoreId(""), false);
    assert.equal(isAssignedAppleAppStoreId("APPLE_APP_STORE_ID"), false);
    assert.equal(isAssignedAppleAppStoreId("12345"), false);
    assert.equal(appleWriteReviewUrl(""), null);
    assert.equal(appleWriteReviewUrl("id1234567890"), null);
    assert.equal(writeReviewUrlForPlatform("ios"), null);
    assert.doesNotMatch(src("src/lib/store-listing.ts"), /appleAppStoreId:\s*"[1-9]\d+"/);
    assert.doesNotMatch(src(".env.example"), /VITE_APPLE_APP_STORE_ID=\d+/);
  });

  it("builds Play write-review from the real Capacitor package, not a fake listing id", () => {
    assert.equal(STORE.playPackageName, "ca.daycarenearme.app");
    assert.equal(playPackageName(), "ca.daycarenearme.app");
    assert.equal(isPlayPackageName("ca.daycarenearme.app"), true);
    assert.equal(isPlayPackageName(""), false);
    assert.equal(isPlayPackageName("not-a-package"), false);
    assert.equal(
      playWriteReviewUrl(),
      "https://play.google.com/store/apps/details?id=ca.daycarenearme.app",
    );
    assert.equal(writeReviewUrlForPlatform("android"), playWriteReviewUrl());
    assert.equal(writeReviewUrlForPlatform("web"), null);
  });

  it("builds an Apple write-review URL only for a real numeric id", () => {
    assert.equal(isAssignedAppleAppStoreId("1234567890"), true);
    assert.equal(
      appleWriteReviewUrl("1234567890"),
      "https://apps.apple.com/app/id1234567890?action=write-review",
    );
  });
});

describe("review cooldown and happy moments", () => {
  it("requires 90 days between automatic prompts and never treats launch as a reason", () => {
    assert.equal(STORE_REVIEW_COOLDOWN_MS, 90 * 24 * 60 * 60 * 1000);
    assert.equal(STORE_REVIEW_LAST_KEY, "kidease-store-review-last");
    assert.equal(reviewCooldownElapsed(null, 1_000), true);
    assert.equal(reviewCooldownElapsed(1_000, 1_000 + STORE_REVIEW_COOLDOWN_MS - 1), false);
    assert.equal(reviewCooldownElapsed(1_000, 1_000 + STORE_REVIEW_COOLDOWN_MS), true);
    assert.equal(isHappyMomentReason("saved_search"), true);
    assert.equal(isHappyMomentReason("share"), true);
    assert.equal(isHappyMomentReason("booking"), true);
    assert.equal(isHappyMomentReason("launch"), false);
    assert.equal(parseReviewTimestamp("1700000000000"), 1_700_000_000_000);
    assert.equal(parseReviewTimestamp(""), null);
  });
});

describe("plugin wiring and honest copy", () => {
  it("depends on the Capacitor 8 in-app review plugin and syncs it into native projects", () => {
    const pkg = JSON.parse(src("package.json"));
    assert.equal(pkg.dependencies["@capacitor-community/in-app-review"], "^8.0.0");
    assert.match(src("android/capacitor.settings.gradle"), /capacitor-community-in-app-review/);
    assert.match(src("android/app/capacitor.build.gradle"), /capacitor-community-in-app-review/);
    assert.match(src("ios/App/CapApp-SPM/Package.swift"), /CapacitorCommunityInAppReview/);
    assert.match(src("ios/App/App/capacitor.config.json"), /InAppReviewPlugin/);
    assert.match(src("src/lib/store-review.ts"), /@capacitor-community\/in-app-review/);
    assert.match(src("src/lib/store-review.ts"), /InAppReview\.requestReview/);
    assert.doesNotMatch(src("src/lib/store-review.ts"), /type=["']range["']|star-picker|fakeStars/);
  });

  it("prompts only after happy moments and never from NativeBoot", () => {
    const boot = src("src/components/native-boot.tsx");
    assert.doesNotMatch(boot, /noteHappyMoment|requestInAppReview|InAppReview/);
    assert.match(src("src/routes/search.tsx"), /noteHappyMoment\("saved_search"\)/);
    assert.match(src("src/components/request-spot.tsx"), /noteHappyMoment\("booking"\)/);
    assert.match(src("src/routes/book.$slug.tsx"), /noteHappyMoment\("booking"\)/);
    assert.match(src("src/components/share-button.tsx"), /noteHappyMoment\("share"\)/);
    assert.match(src("src/lib/store-review.ts"), /noteHappyMoment\("share"\)/);
  });

  it("exposes Rate KidEase on guest home, menu, and account; web falls through to get-app", () => {
    const home = src("src/routes/index.tsx");
    const rate = src("src/components/rate-kidease.tsx");
    assert.match(src("src/routes/menu.tsx"), /RateKidEaseMenuRow/);
    assert.match(src("src/routes/account.tsx"), /RateKidEasePrompt/);
    // Guest www homepage: same Account prompt. Not an Account-only hide.
    assert.match(home, /RateKidEasePrompt/);
    assert.match(home, /Guest www homepage/);
    assert.match(home, /!user \? \(/);
    assert.match(src("src/components/site-footer.tsx"), /RateKidEaseControl/);
    assert.match(src("src/components/nav-drawer.tsx"), /RateKidEaseControl/);
    assert.match(rate, /to: "\/get-app"/);
    assert.match(rate, /search: \{ dev: undefined \}/);
    assert.match(rate, /not Account-only/);
    assert.match(src("src/lib/store-review.ts"), /return "get-app"/);
    assert.match(src("src/lib/store-review.ts"), /not Account-only/);
    assert.doesNotMatch(home, /apps\.apple\.com|play\.google\.com|InAppReview/);
    assert.doesNotMatch(rate, /apps\.apple\.com|play\.google\.com/);
    assert.doesNotMatch(home, /CookieConsentBanner|cookie-consent/);
    assert.match(src("src/lib/copy.ts"), /rateKidEase: "Rate KidEase"/);
    assert.match(src("src/lib/copy.ts"), /rateKidEase: "Évaluer KidEase"/);
    assert.match(src("src/lib/copy.ts"), /writeStoreReview: "Write a review"/);
    assert.match(src("docs/store-review.md"), /90-day/);
    assert.match(src("docs/store-review.md"), /Do \*\*not\*\*/);
    assert.match(src("docs/store-review.md"), /guest home/);
    assert.match(src("docs/mobile-builds.md"), /store-review\.md/);
    assert.match(src(".env.example"), /VITE_APPLE_APP_STORE_ID=/);
    assert.doesNotMatch(src(".env.example"), /VITE_APPLE_APP_STORE_ID=\d+/);
  });
});
