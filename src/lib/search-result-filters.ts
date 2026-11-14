/** Search predicates shared by the paginated list and its full-result map. */
import { cityMislabeledOnCentroid } from "./card-distance.ts";
import { isCareType, isRailAge, matchesCareType, matchesRailAge, type CareType, type RailAge } from "./care-type.ts";
import { commuteMidpoint, commuteQueryRadiusKm, isAlongCommute } from "./commute-route.ts";
import { resolveSearchAnchors, type AnchorMode } from "./dual-anchor.ts";
import { isExploreCategory, listingMatchesExploreFilter, parseExploreRailAges, resolvedExploreCategory, type ExploreCategory } from "./explore-categories.ts";
import { dateAsksForOpenSpot, isIsoDate, matchesDaycareName } from "./explore-search.ts";
import { confirmedFeeProgramBadge } from "./fee-program.ts";
import { haversineKm, type LatLng } from "./geo.ts";
import { matchesDeclaredCare, parseCareKeys } from "./inclusive-search.ts";
import { hasAmenity, opensEarly, staysLate } from "./licensing.ts";
import { vacancyFreshness, vacancyTimestamp } from "./listing-readiness.ts";
import type { MapPin } from "./map-cluster.ts";
import { honestVacancy, listingAgeUnknown, splitSearchResults } from "./now-loops.ts";
import { matchesParentListingFilters, parentSearchActive, parseParentListingSearch, type ParentListingSearch } from "./parent-listing.ts";
import { licenceMatches, LICENCE_BUCKETS, type LicenceBucket } from "./phase1-search.ts";
import { parsePioneerSearch, pioneerFiltersFrom, rowMatchesPioneer, type PioneerSearch } from "./pioneer-filters.ts";
import { isSearchStart, type SearchStart } from "./search-start.ts";
import { isClaimVerified } from "./trust.ts";
import type { DaycareCard } from "./types.ts";

export type SearchResultFilters = {
  pioneer?: PioneerSearch;
  parent?: ParentListingSearch;
  liveOnly?: boolean;
  availability?: "any" | "open" | "waitlist" | "unknown";
  ten?: boolean;
  meals?: boolean;
  outdoor?: boolean;
  inclusive?: boolean;
  diet?: string;
  licence?: LicenceBucket | null;
  extended?: boolean;
  infantOnly?: boolean;
  catchmentOnly?: boolean;
  confirmedOnly?: boolean;
  readyOnly?: boolean;
  claimVerifiedOnly?: boolean;
  favoritesOnly?: boolean;
  careType?: CareType | "any";
  schoolAgeOnly?: boolean;
  category?: ExploreCategory;
  ages?: RailAge[];
  openings?: boolean;
  needBy?: string;
  name?: string;
  start?: SearchStart;
  licensedOnly?: boolean;
  topRatedOnly?: boolean;
};

const BOOLEAN_FILTERS = [
  "liveOnly", "ten", "meals", "outdoor", "inclusive", "extended", "infantOnly",
  "catchmentOnly", "confirmedOnly", "readyOnly", "claimVerifiedOnly", "favoritesOnly",
  "schoolAgeOnly", "openings", "licensedOnly", "topRatedOnly",
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tokens(value: unknown): string {
  return (typeof value === "string" ? value : Array.isArray(value) ? value.filter((v) => typeof v === "string").slice(0, 24).join(",") : "").slice(0, 500);
}

/** Only supported predicates and values survive the public server boundary. */
export function normalizeSearchResultFilters(value: unknown): SearchResultFilters {
  const input = record(value);
  const out: SearchResultFilters = {};
  for (const key of BOOLEAN_FILTERS) {
    out[key] = input[key] === true || input[key] === 1 || input[key] === "1" || input[key] === "true";
  }
  const pioneer = record(input.pioneer);
  out.pioneer = parsePioneerSearch({ ...pioneer, spoken: tokens(pioneer.spoken) });
  const parent = record(input.parent);
  out.parent = parseParentListingSearch({
    ages: tokens(parent.ages), open: tokens(parent.open), sched: tokens(parent.sched), fac: tokens(parent.fac),
  });
  out.availability = input.availability === "open" || input.availability === "waitlist" || input.availability === "unknown" ? input.availability : "any";
  out.diet = parseCareKeys(tokens(input.diet)).join(",");
  out.licence = LICENCE_BUCKETS.includes(input.licence as LicenceBucket) ? input.licence as LicenceBucket : null;
  out.careType = typeof input.careType === "string" && isCareType(input.careType) ? input.careType : "any";
  out.category = isExploreCategory(input.category) ? input.category : undefined;
  out.ages = [...new Set(tokens(input.ages).split(",").filter(isRailAge))];
  out.needBy = typeof input.needBy === "string" && isIsoDate(input.needBy) ? input.needBy.trim() : undefined;
  out.name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  out.start = isSearchStart(input.start) ? input.start : undefined;
  return out;
}

/** Keep the URL's existing strict school-age gate identical before and after hydration. */
export function schoolAgeOnlyFromSearch(search: { age?: unknown; cat?: unknown; care?: unknown }): boolean {
  const ages = parseExploreRailAges(search);
  const category = resolvedExploreCategory(search);
  const age = ages.length === 1 ? ages[0] : category && isRailAge(category) ? category : undefined;
  return age === "school-age";
}

export function hasSearchCoordinates(point: { lat?: number | null; lng?: number | null }): point is LatLng {
  return typeof point.lat === "number" && typeof point.lng === "number" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && !(point.lat === 0 && point.lng === 0);
}

export type SearchResultScope = {
  origin: LatLng;
  radiusKm: number;
  secondOrigin?: LatLng | null;
  mode?: AnchorMode;
  filters?: SearchResultFilters;
};

/**
 * Keep the search's existing order. Apply all predicates before pagination so
 * cards, totals and map use the same set. Missing pins remain discoverable in
 * the list; a map cannot place them. A centroid is not a radius exemption.
 */
export function filterSearchResults<T extends DaycareCard>(rows: readonly T[], scope: SearchResultScope, now = Date.now()): T[] {
  const filters = normalizeSearchResultFilters(scope.filters);
  const pioneer = pioneerFiltersFrom(filters.pioneer ?? {});
  const care = parseCareKeys(filters.diet);
  const anchors = resolveSearchAnchors({ home: scope.origin, work: scope.secondOrigin, mode: scope.mode });
  const radius = Number.isFinite(scope.radiusKm) && scope.radiusKm > 0 ? scope.radiusKm : 25;
  const parent = filters.parent!;
  const selectedAges = filters.ages ?? [];
  let matched = rows.filter((row) => {
    if (cityMislabeledOnCentroid(row.city, row.lat, row.lng)) return false;
    if (hasSearchCoordinates(row) && hasSearchCoordinates(anchors.primary)) {
      const inPrimary = haversineKm(anchors.primary, row) <= radius;
      if (anchors.intersect && anchors.secondary) {
        const inBoth = inPrimary && haversineKm(anchors.secondary, row) <= radius;
        // Preserve the existing home/work corridor, including its lookup cap.
        const along = isAlongCommute(anchors.primary, anchors.secondary, row) &&
          haversineKm(commuteMidpoint(anchors.primary, anchors.secondary), row) <= commuteQueryRadiusKm(anchors.primary, anchors.secondary, radius);
        if (!inBoth && !along) return false;
      } else if (!inPrimary) return false;
    }
    if (filters.liveOnly && (!row.live || row.isTest)) return false;
    const vacancy = honestVacancy(row, now);
    if (filters.availability === "open" && vacancy.kind !== "open") return false;
    if (filters.availability === "waitlist" && vacancy.kind !== "waitlist") return false;
    if (filters.availability === "unknown" && row.availabilityKnown) return false;
    if ((filters.ten || pioneer.cwelcc) && confirmedFeeProgramBadge(row) == null) return false;
    if (!rowMatchesPioneer(row, { ...pioneer, cwelcc: false, openings: false, inclusive: false, meals: Boolean(filters.meals || pioneer.meals) })) return false;
    if (filters.outdoor && !hasAmenity(row.amenities, "outdoor") && !hasAmenity(row.amenities, "yard")) return false;
    if ((filters.inclusive || pioneer.inclusive) && !hasAmenity(row.amenities, "inclusive")) return false;
    if (care.length && !matchesDeclaredCare(row.amenities, care)) return false;
    if (filters.licence && !licenceMatches((row as T & { licenceType?: string | null }).licenceType, filters.licence)) return false;
    if (filters.extended && !staysLate(row.hours, row.amenities) && !opensEarly(row.hours)) return false;
    if (filters.infantOnly && !matchesRailAge(row, "infant")) return false;
    if (filters.catchmentOnly && !row.inCatchment) return false;
    if (filters.confirmedOnly && vacancyFreshness(vacancyTimestamp(row), now).kind !== "fresh") return false;
    if (filters.readyOnly && row.detailsReady !== true) return false;
    if (filters.claimVerifiedOnly && !isClaimVerified(row)) return false;
    if (filters.favoritesOnly && row.guestFavorite !== true) return false;
    if (filters.careType !== "any" && !matchesCareType(row, filters.careType!)) return false;
    if (filters.schoolAgeOnly && !matchesRailAge(row, "school-age")) return false;
    if (filters.category && !listingMatchesExploreFilter(row, filters.category)) return false;
    if (filters.name && !matchesDaycareName(row, filters.name)) return false;
    if (filters.needBy && dateAsksForOpenSpot(filters.needBy, new Date(now)) && vacancy.kind !== "open") return false;
    if (parentSearchActive(parent) && !matchesParentListingFilters(row, parent, now)) return false;
    if (selectedAges.length && !selectedAges.some((age) => matchesRailAge(row, age) || listingAgeUnknown(row))) return false;
    if ((filters.openings || pioneer.openings) && vacancy.kind !== "open") return false;
    if (filters.licensedOnly && !row.licenseNumber) return false;
    if (filters.topRatedOnly && row.topRated !== true) return false;
    return true;
  });
  const age = selectedAges.length === 1 ? selectedAges[0] : isRailAge(filters.category ?? "") ? filters.category as RailAge : undefined;
  if (age && filters.start) {
    const split = splitSearchResults(matched, age, filters.start, now);
    const ids = new Set([...split.primary, ...split.ageUnknown].map((row) => row.id));
    matched = matched.filter((row) => ids.has(row.id));
  }
  return matched;
}

/** Pass only privacy-sealed rows here, after matching against stored coordinates. */
export function projectSearchMapPins(rows: readonly DaycareCard[]): MapPin[] {
  return rows.filter(hasSearchCoordinates).map((row) => ({
    id: row.id, slug: row.slug, name: row.name, nameFr: row.nameFr,
    lat: row.lat, lng: row.lng, address: row.address, city: row.city,
    province: row.province, postalCode: row.postalCode,
    ...(row.addressProtected ? { protectedHome: true, radiusM: row.mapRadiusM ?? 800 } : {}),
  }));
}
