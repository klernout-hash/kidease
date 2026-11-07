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
  assert.doesNotMatch(src("src/components/app-tab-bar.tsx"), /AirbnbDeskPill/);
});

test("guest visual cards are one detail target with an honest fee line", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /data-ke="visual-card"/);
  assert.match(card, /aspect-\[4\/3\]/);
  assert.match(card, /rounded-\[16px\]/);
  assert.match(card, /Provincial fee cap · eligibility varies/);
  assert.match(card, /data-ke="card-source"/);
  assert.match(card, /data-ke="card-age-range"/);
  assert.match(card, /Availability not confirmed/);
  const visual = card.slice(card.indexOf('presentation === "visual"'), card.indexOf("return (\n    <article data-slug"));
  assert.doesNotMatch(visual, /claimFreeListing|ClaimListing/);
  assert.doesNotMatch(visual, /data-ke="card-book-tour"/);
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
  assert.match(editor, /Registry facts stay locked/);
});
