import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const SEARCH_AGES = ["infant", "toddler", "preschool", "school-age"];
const SEARCH_STARTS = ["now", "this-month", "next-month"];
const VACANCY_STALE_MS = 14 * 24 * 60 * 60 * 1000;

function isSearchAge(raw) {
  return SEARCH_AGES.includes(raw);
}
function isSearchStart(raw) {
  return SEARCH_STARTS.includes(raw);
}
function searchFiltersReady(age, start) {
  return isSearchAge(age) && isSearchStart(start);
}
function hasAmenity(amenities, key) {
  return String(amenities || "")
    .split(",")
    .map((s) => s.trim())
    .includes(key);
}
function hasListedFees(d) {
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].some((n) => n != null && n > 0);
}
function hasConfirmedAges(d) {
  if (d.agesKnown) return true;
  return d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0;
}
function isRealListingPhoto(p) {
  const photo = String(p || "");
  if (!photo) return false;
  if (photo.includes("placeholder")) return false;
  if (photo.includes("-logo")) return false;
  if (photo.includes("/photos/wpg/")) return false;
  return true;
}
function hasConfirmedFeeLine(d) {
  if (hasListedFees(d)) return true;
  if (!d.feeConfirmed) return false;
  return hasAmenity(d.amenities, "ten-a-day") || hasAmenity(d.amenities, "funded");
}
function confirmedFeeProgramBadge(d) {
  if (!d.feeConfirmed) return null;
  const ten = hasAmenity(d.amenities, "ten-a-day");
  const funded = hasAmenity(d.amenities, "funded");
  if (!ten && !funded) return null;
  if (d.province === "QC") return "badgeReducedQc";
  if (d.province === "AB") return "badgeFifteen";
  if (ten) return "badgeTen";
  return null;
}
function liveLookingGaps(d) {
  const gaps = [];
  if (!hasConfirmedAges(d)) gaps.push("ages");
  if (!hasConfirmedFeeLine(d)) gaps.push("fees");
  if (!(d.photos ?? []).some(isRealListingPhoto)) gaps.push("photo");
  return gaps;
}
function isLiveLookingCard(d) {
  return liveLookingGaps(d).length === 0;
}
function canShowMatchScore(d) {
  return hasConfirmedAges(d) && hasConfirmedFeeLine(d);
}
function isLiveOrClaimed(d) {
  if (d.live) return true;
  const status = String(d.claimStatus || "").toLowerCase();
  return Boolean(d.claimed) && ["approved", "live", "active", "published"].includes(status);
}
function vacancyFresh(d, now) {
  const raw = d.lastVacancyUpdatedAt ?? d.spotsUpdatedAt;
  if (!raw) return false;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) && now - ts <= VACANCY_STALE_MS;
}
function honestVacancy(d, now = Date.now()) {
  if (!isLiveOrClaimed(d)) return { kind: "unknown", labelKey: "availabilityUnknown" };
  if (!vacancyFresh(d, now)) return { kind: "confirm", labelKey: "confirmWithCentre" };
  if ((d.spotsTotal ?? 0) > 0) return { kind: "open", labelKey: "spots", spots: d.spotsTotal };
  return { kind: "waitlist", labelKey: "waitlist", spots: 0 };
}
function qualifiesStartWindow(d, start, now = Date.now()) {
  if (start === "this-month") return true;
  return isLiveOrClaimed(d) && vacancyFresh(d, now);
}
function matchesRailAge(d, age) {
  if (age === "school-age") return Boolean(d.agesKnown && d.ageMaxMonths >= 60);
  if (age === "infant") return d.ageMinMonths <= 18;
  if (age === "toddler") return d.ageMinMonths < 36 && d.ageMaxMonths >= 18;
  return d.ageMaxMonths >= 30 && d.ageMinMonths < 72;
}
function splitSearchResults(rows, age, start, now) {
  const primary = [];
  const ageUnknown = [];
  for (const row of rows) {
    if (!hasConfirmedAges(row)) {
      ageUnknown.push(row);
      continue;
    }
    if (!matchesRailAge(row, age)) continue;
    if (!qualifiesStartWindow(row, start, now)) continue;
    primary.push(row);
  }
  return { primary, ageUnknown };
}
function qualityTodoFirst(issues) {
  const first = ["incomplete_ages", "incomplete_fees", "incomplete_photo"];
  return [
    ...first.map((id) => issues.find((issue) => issue.id === id)).filter(Boolean),
    ...issues.filter((issue) => !first.includes(issue.id)),
  ];
}
function parseCompareSlugs(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{2,80}$/i.test(s))
    .slice(0, 5);
}

function listing(over = {}) {
  return {
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 60,
    infantMonthly: 1200,
    toddlerMonthly: 1100,
    preschoolMonthly: 1000,
    partTimeMonthly: null,
    amenities: "",
    photos: ["/photos/buildings/mb-demo.jpg"],
    province: "MB",
    live: true,
    claimed: true,
    claimStatus: "approved",
    lastVacancyUpdatedAt: new Date().toISOString(),
    spotsTotal: 2,
    ...over,
  };
}

test("age gate refuses a catalogue dump without age + start", () => {
  assert.equal(searchFiltersReady(undefined, undefined), false);
  assert.equal(searchFiltersReady("any", "now"), false);
  assert.equal(searchFiltersReady("toddler", undefined), false);
  assert.equal(searchFiltersReady("toddler", "now"), true);
  assert.equal(searchFiltersReady("school-age", "next-month"), true);
});

test("Winnipeg toddler + now keeps age-eligible live cards and hides others", () => {
  const now = Date.parse("2026-09-09T12:00:00Z");
  const toddler = listing({
    slug: "wpg-toddler",
    ageMinMonths: 18,
    ageMaxMonths: 36,
    lastVacancyUpdatedAt: "2026-09-01T00:00:00Z",
  });
  const infantOnly = listing({
    slug: "wpg-infant",
    ageMinMonths: 0,
    ageMaxMonths: 17,
    lastVacancyUpdatedAt: "2026-09-01T00:00:00Z",
  });
  const unknownAge = listing({
    slug: "wpg-unknown",
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
  });
  const staleLive = listing({
    slug: "wpg-stale",
    lastVacancyUpdatedAt: "2026-01-01T00:00:00Z",
  });
  const { primary, ageUnknown } = splitSearchResults(
    [toddler, infantOnly, unknownAge, staleLive],
    "toddler",
    "now",
    now,
  );
  assert.deepEqual(
    primary.map((r) => r.slug),
    ["wpg-toddler"],
  );
  assert.equal(ageUnknown.some((r) => r.slug === "wpg-unknown"), true);
  assert.equal(primary.some((r) => r.slug === "wpg-infant"), false);
});

test("hollow cards are excluded from home rails", () => {
  const liveLooking = listing();
  const noPhoto = listing({ photos: ["/photos/storefront-placeholder.jpg"] });
  const noFees = listing({
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    amenities: "",
  });
  const noAges = listing({ agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0 });
  assert.equal(isLiveLookingCard(liveLooking), true);
  assert.deepEqual(liveLookingGaps(noPhoto), ["photo"]);
  assert.deepEqual(liveLookingGaps(noFees), ["fees"]);
  assert.deepEqual(liveLookingGaps(noAges), ["ages"]);
  assert.deepEqual(
    [liveLooking, noPhoto, noFees, noAges].filter(isLiveLookingCard).map((r) => r.photos[0]),
    [liveLooking.photos[0]],
  );
});

test("vacancy is unknown on unclaimed rows and never openings now", () => {
  const unclaimed = listing({
    live: false,
    claimed: false,
    claimStatus: "unclaimed",
    spotsTotal: 8,
    lastVacancyUpdatedAt: new Date().toISOString(),
  });
  const vacancy = honestVacancy(unclaimed);
  assert.equal(vacancy.kind, "unknown");
  assert.equal(vacancy.labelKey, "availabilityUnknown");
  assert.equal(qualifiesStartWindow(unclaimed, "now"), false);
});

test("stale Live vacancy says confirm with centre", () => {
  const stale = listing({
    lastVacancyUpdatedAt: "2026-01-01T00:00:00Z",
    spotsTotal: 4,
  });
  const vacancy = honestVacancy(stale, Date.parse("2026-09-09T12:00:00Z"));
  assert.equal(vacancy.kind, "confirm");
  assert.equal(vacancy.labelKey, "confirmWithCentre");
});

test("province-typical $10-a-day is not a confirmed fee line", () => {
  const mbGuess = listing({
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    amenities: "ten-a-day,funded",
    feeConfirmed: false,
    province: "MB",
  });
  const qcGuess = listing({
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    amenities: "funded",
    feeConfirmed: false,
    province: "QC",
  });
  const confirmed = listing({
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    amenities: "ten-a-day",
    feeConfirmed: true,
    province: "MB",
  });
  assert.equal(hasConfirmedFeeLine(mbGuess), false);
  assert.equal(confirmedFeeProgramBadge(mbGuess), null);
  assert.equal(confirmedFeeProgramBadge(qcGuess), null);
  assert.equal(hasConfirmedFeeLine(confirmed), true);
  assert.equal(confirmedFeeProgramBadge(confirmed), "badgeTen");
  assert.equal(canShowMatchScore(mbGuess), false);
  assert.equal(canShowMatchScore(listing()), true);
});

test("compare deep-link keeps two slugs", () => {
  assert.deepEqual(parseCompareSlugs("alpha-centre,beta-home"), ["alpha-centre", "beta-home"]);
  assert.equal(`/compare?slugs=${parseCompareSlugs("alpha-centre,beta-home").join(",")}`, "/compare?slugs=alpha-centre,beta-home");
});

test("director quality todos put ages, fees, and photo first", () => {
  const ordered = qualityTodoFirst([
    { id: "vacancy_stale" },
    { id: "incomplete_photo" },
    { id: "reviews_thin" },
    { id: "incomplete_ages" },
    { id: "incomplete_fees" },
  ]);
  assert.deepEqual(
    ordered.map((i) => i.id),
    ["incomplete_ages", "incomplete_fees", "incomplete_photo", "vacancy_stale", "reviews_thin"],
  );
});

test("search, cards, rails, and vacancy wire the shared helper", () => {
  const search = src("src/routes/search.tsx");
  const home = src("src/routes/index.tsx");
  const fr = src("src/routes/fr.search.tsx");
  const card = src("src/components/daycare-card.tsx");
  const rails = src("src/components/explore-rails.tsx");
  const parentRails = src("src/lib/parent-rails.ts");
  const listing = src("src/routes/daycare.$slug.tsx");
  const inbox = src("src/components/daycare-lead-inbox.tsx");
  const quality = src("src/components/quality-issues.tsx");
  const helpers = src("src/lib/now-loops.ts");
  assert.match(helpers, /export function isLiveLookingCard/);
  assert.match(helpers, /export function honestVacancy/);
  assert.match(helpers, /export function searchFiltersReady/);
  assert.match(search, /searchFiltersReady/);
  assert.match(search, /splitSearchResults/);
  assert.match(search, /search_filters_applied/);
  assert.match(search, /search_results_shown/);
  assert.match(home, /isLiveLookingCard/);
  assert.match(home, /SearchAgeGate/);
  assert.match(fr, /isLiveLookingCard|searchFiltersReady/);
  assert.match(card, /liveLookingGaps/);
  assert.match(card, /canShowMatchScore/);
  assert.match(rails, /isLiveLookingCard|liveLookingOnly/);
  assert.match(parentRails, /isLiveLookingCard|liveLookingOnly/);
  assert.match(listing, /unclaimedRequestNote|listing_request_started/);
  assert.match(inbox, /providerRequestsEmpty/);
  assert.match(quality, /qualityTodoFirst/);
  assert.doesNotMatch(helpers, /FEATURE_INAPP_CHAT|FEATURE_SMS|FEATURE_PUSH/);
});
