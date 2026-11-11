import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  feeDisplayState,
  licenceBucket,
  licenceMatches,
  multiChildMatch,
  showSiblingDiscount,
  vacancyIsStale,
  vacancyReminder,
  FEE_HIDDEN_COPY,
} from "../src/lib/phase1-search.ts";

test("licence filters never guess and never match unknown to a specific type", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_LICENCE_TYPE_FILTER, false);
  assert.equal(licenceBucket("licensed child care centre"), "centre");
  assert.equal(licenceBucket("home child care agency"), "home");
  assert.equal(licenceBucket("something else"), "unknown");
  assert.equal(licenceBucket(""), "unknown");
  assert.equal(licenceMatches("home daycare", "centre"), false);
  assert.equal(licenceMatches("unknown", "centre"), false);
  assert.equal(licenceMatches("garderie", "centre"), true);
  assert.equal(licenceMatches(null, "unknown"), true);
});

test("multi-child search stores no names and groups full versus some", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_MULTI_CHILD_SEARCH, false);
  assert.equal(multiChildMatch(["infant", "toddler"], [10, 24]), "full");
  assert.equal(multiChildMatch(["infant"], [10, 24]), "partial");
  assert.equal(multiChildMatch(["school-age"], [10]), "none");
  assert.equal(showSiblingDiscount({ type: "percent", amount: 10 }), "10%");
  assert.equal(showSiblingDiscount({ type: "unknown", amount: null }), null);
  assert.equal(showSiblingDiscount(null), null);
});

test("vacancy goes stale on the centre calendar and reminds once", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_VACANCY_FRESHNESS, false);
  const confirmedAt = "2026-11-01T15:00:00.000Z";
  assert.equal(
    vacancyIsStale({ confirmedAt, now: new Date("2026-11-16T18:00:00.000Z"), timeZone: "America/Winnipeg", windowDays: 14 }),
    true,
  );
  assert.equal(
    vacancyIsStale({ confirmedAt, now: new Date("2026-11-10T18:00:00.000Z"), timeZone: "America/Winnipeg", windowDays: 14 }),
    false,
  );
  const due = vacancyReminder({
    flagOn: true,
    enabledAt: "2026-11-01T00:00:00.000Z",
    confirmedAt,
    now: new Date("2026-11-13T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    windowDays: 14,
    alreadySent: false,
    quiet: false,
  });
  assert.equal(due.reason, "held");
  assert.equal(due.deliver, false);
  const again = vacancyReminder({
    flagOn: true,
    enabledAt: "2026-11-01T00:00:00.000Z",
    confirmedAt,
    now: new Date("2026-11-14T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    windowDays: 14,
    alreadySent: true,
    quiet: false,
  });
  assert.equal(again.reason, "duplicate");
  const old = vacancyReminder({
    flagOn: true,
    enabledAt: "2026-11-20T00:00:00.000Z",
    confirmedAt,
    now: new Date("2026-11-13T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    windowDays: 14,
    alreadySent: false,
    quiet: false,
  });
  assert.equal(old.reason, "pre_enable");
});

test("unclaimed scraped fees stay hidden", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FEE_DISPLAY_GATE, false);
  assert.equal(
    feeDisplayState({ claimed: false, centreConfirmedAt: null, officialAsOf: null, now: new Date("2026-11-11T00:00:00.000Z") }),
    "hidden",
  );
  assert.equal(
    feeDisplayState({
      claimed: true,
      centreConfirmedAt: "2026-11-01T00:00:00.000Z",
      officialAsOf: null,
      now: new Date("2026-11-11T00:00:00.000Z"),
    }),
    "centre",
  );
  assert.equal(
    feeDisplayState({
      claimed: false,
      centreConfirmedAt: null,
      officialAsOf: "2024-01-01T00:00:00.000Z",
      now: new Date("2026-11-11T00:00:00.000Z"),
    }),
    "hidden",
  );
  assert.match(FEE_HIDDEN_COPY.fr, /tarifs/);
});
