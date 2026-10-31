import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { privatePhotoFeedEnabled } from "../src/lib/features.ts";
import {
  classroomPhotoAllowed,
  listingPhotoMayShowChildFace,
  parentSeesPrivateFeed,
  privateFeedCopy,
} from "../src/lib/private-photo-feed.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("the private photo feed defaults off and never allows a child face on a public photo", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PRIVATE_PHOTO_FEED, false);
  assert.equal(privatePhotoFeedEnabled({}), false);
  assert.equal(privatePhotoFeedEnabled({ FEATURE_PRIVATE_PHOTO_FEED: "1" }), true);
  assert.equal(listingPhotoMayShowChildFace(), false);
  assert.equal(parentSeesPrivateFeed({ enabled: false, enrolled: false }), true);
  assert.equal(parentSeesPrivateFeed({ enabled: true, enrolled: false }), false);
  assert.equal(parentSeesPrivateFeed({ enabled: true, enrolled: true }), true);
  assert.deepEqual(classroomPhotoAllowed({ enabled: true, enrolled: true, consentAt: null, photoCount: 1 }), {
    ok: false,
    reason: "consent",
  });
  assert.equal(
    classroomPhotoAllowed({
      enabled: true,
      enrolled: true,
      consentAt: "2026-10-31T00:00:00.000Z",
      photoCount: 1,
    }).ok,
    true,
  );
  assert.equal(classroomPhotoAllowed({ enabled: false, enrolled: false, photoCount: 2 }).ok, true);
  assert.match(privateFeedCopy("en").body, /not on the public listing/);
  assert.match(privateFeedCopy("fr").help, /Aide/);
  assert.match(read(".env.example"), /^FEATURE_PRIVATE_PHOTO_FEED=0$/m);
});

test("journal photos are gated and public pages do not render the feed", () => {
  const server = read("src/lib/server/daily-care.ts");
  const page = read("src/routes/parent.daily-feed.tsx");
  const listing = read("src/routes/daycare.$slug.tsx");
  const home = read("src/routes/index.tsx");
  assert.match(server, /privatePhotoFeedEnabled/);
  assert.match(server, /photo_consent_at/);
  assert.match(server, /accepted', 'active'/);
  assert.match(page, /PhotoConsentCard/);
  assert.match(page, /localePath\("\/help"/);
  assert.match(read("src/components/photo-consent-card.tsx"), /grantPhotoConsent/);
  assert.match(read("migrations/0117_photo_consent.sql"), /photo_consent_at/);
  assert.doesNotMatch(listing, /daily_journals|PhotoConsentCard|journal photos/i);
  assert.doesNotMatch(home, /daily_journals|PhotoConsentCard/);
  assert.doesNotMatch(server, /sendSms/);
});
