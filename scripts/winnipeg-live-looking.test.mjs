import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  hasConfirmedFeeLine,
  isLiveLookingCard,
  isRealListingPhoto,
  liveLookingGaps,
  parseGapCsv,
  planCompletenessFill,
  summarizeLiveLooking,
  winnipegGapsCsv,
} from "../src/lib/winnipeg-completeness.ts";
import { loadWinnipegCatalogue } from "./winnipeg-live-looking.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function centre(overrides = {}) {
  return {
    id: "mb-1",
    slug: "centre-1",
    name: "Centre",
    city: "Winnipeg",
    province: "MB",
    address: "1 Main",
    licenseNumber: "MB-1",
    ageMinMonths: 0,
    ageMaxMonths: 0,
    agesKnown: false,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    amenities: "licensed,funded,ten-a-day",
    photos: ["/photos/wpg/1.jpg"],
    feeConfirmed: false,
    claimed: false,
    listingActive: true,
    ...overrides,
  };
}

test("harvested Winnipeg fee and aerial photo are not live-looking", () => {
  const row = centre();
  assert.equal(hasConfirmedFeeLine(row), false);
  assert.equal(isRealListingPhoto("/photos/wpg/1.jpg"), false);
  assert.equal(isRealListingPhoto("/photos/buildings/mb-1.jpg"), true);
  assert.deepEqual(liveLookingGaps(row), ["ages", "fees", "photo"]);
  assert.equal(isLiveLookingCard(row), false);
  assert.equal(
    isLiveLookingCard(
      centre({
        agesKnown: true,
        ageMinMonths: 3,
        ageMaxMonths: 60,
        infantMonthly: 400,
        photos: ["/photos/buildings/mb-1.jpg"],
      }),
    ),
    true,
  );
});

test("ten-a-day amenity counts only after this centre confirms fees", () => {
  assert.equal(hasConfirmedFeeLine(centre({ feeConfirmed: false })), false);
  assert.equal(hasConfirmedFeeLine(centre({ feeConfirmed: true })), true);
  assert.equal(hasConfirmedFeeLine(centre({ amenities: "licensed", infantMonthly: 480 })), true);
});

test("sourced fill writes only empty cells and refuses guesses", () => {
  const current = centre();
  assert.equal(planCompletenessFill(current, { id: "mb-1", infantMonthly: 218 }).action, "reject");
  assert.equal(
    planCompletenessFill(current, { id: "mb-1", infantMonthly: 480, source: "catalogue" }).action,
    "reject",
  );
  const planned = planCompletenessFill(current, {
    id: "mb-1",
    ageMinMonths: 3,
    ageMaxMonths: 72,
    infantMonthly: 480,
    photoUrl: "https://example.com/centre-front.jpg",
    source: "Director email 2026-09-26, posted parent rate",
  });
  assert.equal(planned.action, "apply");
  assert.deepEqual(planned.setAges, { min: 3, max: 72 });
  assert.equal(planned.setFees?.infantMonthly, 480);
  assert.equal(planned.setPhoto, "https://example.com/centre-front.jpg");
  const already = planCompletenessFill(
    centre({
      agesKnown: true,
      ageMinMonths: 12,
      ageMaxMonths: 60,
      infantMonthly: 500,
      photos: ["/photos/buildings/mb-1.jpg"],
    }),
    {
      id: "mb-1",
      ageMinMonths: 1,
      ageMaxMonths: 24,
      infantMonthly: 100,
      photoUrl: "https://example.com/other.jpg",
      source: "https://operator.example/fees",
    },
  );
  assert.equal(already.action, "skip");
});

test("gap CSV round-trips blank cells and keeps a filled source", () => {
  const csv = winnipegGapsCsv([centre({ id: "mb-9", name: 'Oak, "North"' })]);
  assert.match(csv, /missing_ages,missing_fees,missing_photo/);
  assert.doesNotMatch(csv, /,218,/);
  const parsed = parseGapCsv(
    `${csv.trim()}
`.replace(
      "\n",
      "\n",
    ),
  );
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.patches[0].id, "mb-9");
  assert.equal(parsed.patches[0].infantMonthly, undefined);
  const filled = parseGapCsv(
    "id,age_min_months,age_max_months,infant_monthly,source\nmb-9,3,60,480,https://operator.example/rates\n",
  );
  assert.equal(filled.patches[0].ageMinMonths, 3);
  assert.equal(filled.patches[0].infantMonthly, 480);
});

test("repo Winnipeg catalogue is not live-looking without invented facts", async () => {
  const rows = await loadWinnipegCatalogue();
  const summary = summarizeLiveLooking(rows);
  assert.ok(summary.searchVisible > 300);
  assert.equal(summary.withAges, 0);
  assert.equal(summary.withFees, 0);
  assert.equal(summary.liveLooking, 0);
  assert.equal(summary.platformLive, 0);
  assert.ok(summary.withRealPhoto > 0);
  assert.ok(summary.withRealPhoto < summary.searchVisible);
  assert.ok(summary.liveLookingShare < 0.8);
});

test("admin desk exposes the Winnipeg gap fill", () => {
  const nav = readFileSync(join(root, "src/lib/desk-nav.ts"), "utf8");
  const tabs = readFileSync(join(root, "src/lib/account-notify.ts"), "utf8");
  const admin = readFileSync(join(root, "src/routes/admin.tsx"), "utf8");
  assert.match(nav, /id: "winnipeg"/);
  assert.match(tabs, /"winnipeg"/);
  assert.match(admin, /tab === "winnipeg"/);
  assert.match(admin, /AdminWinnipegGaps/);
  assert.match(readFileSync(join(root, "migrations/0060_listing_fact_source.sql"), "utf8"), /fact_source/);
  assert.match(readFileSync(join(root, "src/lib/server/winnipeg-gaps.ts"), "utf8"), /fact_source/);
});
