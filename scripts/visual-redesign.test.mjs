import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { homeLandPath, shouldHoldHomeDiscovery } from "../src/lib/desks.ts";

const root = new URL("..", import.meta.url);

function src(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("launch hold hides discovery only while a role desk is still resolving", () => {
  assert.equal(homeLandPath({ role: "government" }), "/gov");
  assert.equal(homeLandPath({ role: "parent" }), null);
  assert.equal(
    shouldHoldHomeDiscovery({
      pending: true,
      signedIn: false,
      remembered: "provider",
    }),
    true,
  );
  assert.equal(
    shouldHoldHomeDiscovery({
      pending: false,
      signedIn: true,
      role: "provider",
      remembered: "provider",
    }),
    true,
  );
  assert.equal(
    shouldHoldHomeDiscovery({
      pending: false,
      signedIn: false,
      remembered: "provider",
    }),
    false,
  );
  assert.equal(
    shouldHoldHomeDiscovery({
      pending: true,
      signedIn: true,
      role: "parent",
    }),
    false,
  );
  assert.equal(
    shouldHoldHomeDiscovery({
      pending: false,
      signedIn: true,
      role: null,
    }),
    true,
  );
  assert.equal(
    shouldHoldHomeDiscovery({
      landed: true,
      pending: true,
      signedIn: true,
      role: "provider",
    }),
    false,
  );
  assert.equal(
    shouldHoldHomeDiscovery({
      guestView: true,
      pending: false,
      signedIn: true,
      role: "provider",
    }),
    false,
  );
  assert.match(src("src/routes/index.tsx"), /data-ke="launch-shell"/);
  assert.match(src("src/routes/index.tsx"), /data-ke="home-discovery-surface"/);
  assert.match(src("src/routes/__root.tsx"), /data-ke-launch-hold/);
  assert.doesNotMatch(src("src/routes/index.tsx"), /homeLandPath/);
  assert.doesNotMatch(src("src/routes/__root.tsx"), /launch-hold-boot/);
  assert.doesNotMatch(src("src/components/app-tab-bar.tsx"), /AirbnbDeskPill/);
});

test("guest visual cards use the compact photo layout with live, fee, and claim", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /data-ke="visual-card"/);
  assert.match(card, /aspect-\[4\/3\]/);
  assert.match(card, /rounded-\[14px\]/);
  assert.match(card, /data-ke="card-live-pill"/);
  assert.match(card, /SubsidyPill/);
  assert.match(card, /publicBrowseClaim/);
  assert.match(card, /ClaimListingCta/);
  assert.match(card, /data-ke="card-age-range"/);
  assert.doesNotMatch(card, /Provincial fee cap · eligibility varies/);
  assert.doesNotMatch(card, /data-ke="card-source"/);
  assert.doesNotMatch(card, /Availability not confirmed/);
  const visual = card.slice(card.indexOf('presentation === "visual"'), card.indexOf("return (\n    <article data-slug"));
  assert.match(visual, /ClaimListingCta/);
  assert.match(visual, /showLivePill=\{showLivePill\}/);
  assert.match(visual, /data-ke="card-book-tour"/);
  assert.match(card, /data-ke="card-request-info"/);
});

test("guest detail drops the dominant claim, repeated unknown table, and floating role pill", () => {
  const page = src("src/routes/daycare.$slug.tsx");
  assert.match(page, /data-ke="fees-and-support"/);
  assert.match(page, /Fees and support/);
  assert.match(page, /data-ke="listing-claim-button"/);
  assert.match(page, /bg-transparent/);
  assert.match(page, /compact/);
  assert.match(page, /hidden flex-wrap/);
  assert.match(src("src/components/listing-parent-pack.tsx"), /data-ke="programs-unknown-once"/);
  assert.match(src("src/components/inspection-trust-card.tsx"), /data-compact="1"/);
  assert.match(src("src/styles.css"), /display: none !important/);
});

test("provider editor is photo-led with a published preview", () => {
  const editor = src("src/components/host-listing-desk.tsx");
  assert.match(editor, /data-ke="host-cover"/);
  assert.match(editor, /data-ke="host-cover-empty"/);
  assert.match(editor, /Photo not available/);
  assert.match(editor, /Listed/);
  assert.match(editor, /Preview published listing/);
  assert.match(editor, /Manage photos/);
  assert.match(editor, /data-ke="host-section-card"/);
  assert.match(editor, /data-ke="host-section-group"/);
  assert.match(editor, /Registry facts stay locked/);
  assert.match(editor, /not a draft/);
  const fields = src("src/components/provider-parent-fields.tsx");
  assert.match(fields, /data-ke="editor-meals"/);
  assert.match(fields, /data-ke="editor-amenities"/);
  assert.match(fields, /Leave blank if unknown/);
  assert.doesNotMatch(fields, /part === "meals" \? DESK_AMENITIES/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /data-ke="photo-tour-preview"/);
  assert.match(src("src/components/gov/gov-login.tsx"), /forgot-password\?from=gov/);
  assert.match(src("src/components/gov/gov-dashboard.tsx"), /data-ke="gov-task"/);
  assert.match(src("src/components/gov/gov-dashboard.tsx"), /data-ke="gov-expiries"/);
  assert.match(src("src/lib/server/gov-portal.ts"), /cannot widen/);
  assert.match(src("src/lib/server/gov-portal.ts"), /province: actor\.province/);
  assert.match(src("src/lib/desks.ts"), /kidease-session-hint/);
  assert.doesNotMatch(src("src/routes/__root.tsx"), /kidease-session-hint/);
});
