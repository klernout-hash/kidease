import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { sealPublicHomes } from "@/lib/server/home-address-privacy";
import { eceJobsEnabled, hostListingEnabled, inclusiveFiltersEnabled, reviewReportsEnabled } from "@/lib/features";
import { patchAvailabilityMonth } from "@/lib/host-calendar";
import { filterByLocationLock, resolveLocationLock } from "@/lib/location-lock";
import { cardSortKm, includeCardInRadius } from "@/lib/card-distance";
import { catchmentMatch, clampRadiusKm, compareProximity, recommendedRank } from "@/lib/proximity";
import { resolveListingTourTimezone } from "@/lib/tour-calendar";
import {
  catalogByIdsGet,
  catalogByIdsGetResult,
  catalogBySlugGet,
  catalogMonths,
  catalogNamedCityFromJsonResult,
  catalogNear,
  getPublicCatalogResult,
  type CatalogDaycare,
} from "@/lib/catalog";
import { filterByDaycareName, readLiveSearchFlag } from "@/lib/explore-search";
import { hideListingFromPublicPage, isAdminOnlyListing, isExactSlugDemoListing, isHiddenTestListing, isPublicListing, publicListings } from "@/lib/listing-visibility";
import { parseAnchorMode, resolveSearchAnchors } from "@/lib/dual-anchor";
import { nearbyListings, nearbyListingsAlongResult, nearbyListingsDualResult, nearbyListingsResult, type NearbyListing } from "./nearby";
import { callerIsTestAccount, callerMayViewHiddenListing } from "./public-listing";
import { applyListingReadiness, compareFreshOpenSpots, hasConfirmedAges } from "@/lib/listing-readiness";
import { standardGroupsForRange } from "@/lib/standard-age-groups";
import { listingAgeUnknown } from "@/lib/now-loops";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { overlayClaimed } from "./claims";
import { overlayClaimedSearchResult } from "./search-claim-overlay";
import { parseStoredDimensions } from "@/lib/review-dimensions";
import { overlayParentReviews } from "./reviews";
import { overlayQuality } from "./quality";
import { overlayParentRank } from "./rank";
import { overlayPriority } from "./promos";
import { featuredCentreIdsInLock, featuredCentreIdsInLockResult, overlayFeaturedCity } from "@/lib/server/provider-entitlements";
import { compareWithPaidPins, sortFeaturedCityAfterPriority } from "@/lib/provider-entitlements";
import { sponsoredPinsFirst } from "@/lib/sponsored-flag";
import { collapseAdjacentDuplicates, withJunkLast } from "@/lib/search-result-quality";
import { parseSearchSort } from "@/lib/search-sort";
import { compareSmartMatchOrNearest, whyForListing, type RankAge, type SmartMatchQuery } from "@/lib/ranking/score";
import { excludeRankingV2, rankingV2TieBreak } from "@/lib/ranking/v2";
import { rankingV2Enabled } from "@/lib/features";
import { parseCareKeys } from "@/lib/inclusive-search";
import { listingSubsidy } from "@/lib/fee-program";
import {
  compareParentFit,
  parentFitApplies,
  parentFitCacheKey,
  parentFitScore,
  parseParentFit,
  type ParentFitListing,
  type ParentFitProfile,
} from "@/lib/parent-fit";
import { recordRankingSearch } from "@/lib/server/ranking-market";
import { compareParentMatch } from "@/lib/parent-match";
import { compareParentUrgency } from "@/lib/parent-urgency";
import { parentReviewSummary } from "@/lib/review-gate";
import { hasLicenceEvidence } from "@/lib/approve-live";
import { isPlatformLive } from "@/lib/live";
import { defaultTrustFields, isClaimVerified, normalizeLicenseStatus, normalizeMatchState } from "@/lib/trust";
import { applyLocalRegistryTrust } from "@/lib/server/license-match";
import { listingThumb } from "@/lib/photo";
import { uniqueById } from "@/lib/utils";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { pageFromSearch, sliceSearchPage } from "@/lib/search-page";
import { filterSearchResults, hasSearchCoordinates, normalizeSearchResultFilters, projectSearchMapPins, type SearchResultFilters } from "@/lib/search-result-filters";
import { rememberSearch, searchMemoKey } from "./search-memo";
import { mergeApprovedCityListings, mergeApprovedCityListingsResult } from "./approved-search";
import { mergeSearchEvidence, searchEvidence, withSearchRows, type SearchBatch } from "@/lib/search-evidence";
import { combineSearchReads, settleSearchRead } from "@/lib/search-retrieval";
import { alignSearchOrigin } from "@/lib/search-query";
import { transactionalMailConfigured } from "@/lib/transactional-mail";
import { inspectionHistoryEnabled } from "@/lib/features";
import { readCachedInspections } from "@/lib/server/inspection-history";
import type { PublicInspection } from "@/lib/inspection-history";
import { listingInfoSlaReady } from "@/lib/parent-listing";
import { listedDaycareTypeFromSearch, matchesListedDaycareType } from "@/lib/care-type";
import { CITY_TYPE_LIST_CAP, queryNeonCityHubListingsResult } from "@/lib/server/catalog-neon";
import { applyMasterCareType } from "@/lib/server/master-care-type";
import { resolveSearchDirectory, listingBelongsToHub } from "@/lib/city-directory";
import { cityHubDefBySlug, cityHubMapSearchQuery, normalizeCityKey } from "@/lib/city-hubs";
import { listingsForCityHubResult } from "@/lib/server/city-directory";
import { geocode } from "@/lib/geo";
import { ClientInputError } from "@/lib/observe";
import type { AgeGroup, AvailabilityRow, Daycare, DaycareCard, Review } from "@/lib/types";

export type CentreJobPost = { id: string; role: string; note: string; createdAt: string };

type SearchSort = "distance" | "price" | "rating" | "availability" | "recommended" | "match" | "urgency" | "best";
type SearchSchedule = "full" | "part" | "flexible";

type SearchInput = {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: SearchSort;
  ageGroup: "any" | AgeGroup;
  fsa?: string;
  label?: string;
  q?: string;
  startDate?: string | null;
  lat2?: number;
  lng2?: number;
  mode?: "home" | "work" | "both";
  /** One of the six daycare categories. Filters the city, it does not mix types. */
  facility?: ReturnType<typeof listedDaycareTypeFromSearch>;
  /** `/search?city=Toronto`. Never a default city when this does not geocode. */
  city?: string;
  /** Server-only. Set from the city query, never trusted from the client. */
  directorySlug?: string;
  /** Age the parent picked, including school-age. Not a birthdate. */
  rankAge?: RankAge;
  wantSubsidy?: boolean;
  wantExtendedHours?: boolean;
  schedules?: SearchSchedule[];
  /** Interactive searches only. The first paint does not count demand. */
  countDemand?: boolean;
  /** Signed-in parent only. Guests omit this and keep fresh-first order. */
  parentFit?: ParentFitProfile | null;
  /** Centre name. Public page/map results still obey the selected radius. */
  name?: string;
  /** Live on KidEase. Same centres as Claim verified. Filtered before paging. */
  live?: boolean;
  /** Declared diet and extra support, comma-separated. Ignored while the flag is off. */
  diet?: string;
  /** Public list/map predicates. Applied together before paging. */
  filters?: SearchResultFilters;
  /** Explicit user retry; bypass only the relevant search/read caches. */
  refresh?: boolean;
};

/** Internal only: one successful read must not be undone by a stale fallback. */
type SearchCandidates = SearchBatch<DaycareCard> & { excludedIds?: string[] };

function parseSort(raw: unknown): SearchSort {
  return parseSearchSort(raw);
}

function parseRankAge(raw: unknown): RankAge {
  if (raw === "infant" || raw === "toddler" || raw === "preschool" || raw === "school-age") return raw;
  return "any";
}

function parseSchedules(raw: unknown): SearchSchedule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SearchSchedule => item === "full" || item === "part" || item === "flexible");
}

function smartQuery(data: SearchInput): SmartMatchQuery {
  const work =
    typeof data.lat2 === "number" && typeof data.lng2 === "number" ? { lat: data.lat2, lng: data.lng2 } : null;
  return {
    home: { lat: data.lat, lng: data.lng },
    work,
    radiusKm: data.radiusKm,
    ageGroup: data.rankAge && data.rankAge !== "any" ? data.rankAge : data.ageGroup,
    wantSubsidy: Boolean(data.wantSubsidy),
    wantExtendedHours: Boolean(data.wantExtendedHours),
    schedules: data.schedules,
  };
}

function optionalCoord(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fitListing(card: DaycareCard): ParentFitListing {
  return {
    lat: card.lat,
    lng: card.lng,
    agesKnown: card.agesKnown,
    ageMinMonths: card.ageMinMonths,
    ageMaxMonths: card.ageMaxMonths,
    spotsInfant: card.spotsInfant,
    spotsToddler: card.spotsToddler,
    spotsPreschool: card.spotsPreschool,
    lastVacancyUpdatedAt: card.lastVacancyUpdatedAt,
    spotsUpdatedAt: card.spotsUpdatedAt,
    infantMonthly: card.infantMonthly,
    toddlerMonthly: card.toddlerMonthly,
    preschoolMonthly: card.preschoolMonthly,
    languages: card.languages,
    amenities: card.amenities,
    subsidy: listingSubsidy(card)?.subsidy_type ?? null,
  };
}

function usesParentFitSort(sort: SearchSort) {
  return sort === "distance" || sort === "recommended" || sort === "match";
}

function toDaycare(d: CatalogDaycare): Daycare {
  const mapped = applyLocalRegistryTrust(applyListingReadiness({
    id: d.id,
    slug: d.slug,
    name: d.name,
    nameFr: d.nameFr,
    tagline: d.tagline,
    taglineFr: d.taglineFr,
    description: d.description,
    descriptionFr: d.descriptionFr,
    address: d.address,
    city: d.city,
    province: d.province,
    postalCode: d.postalCode,
    lat: d.lat,
    lng: d.lng,
    phone: d.phone || null,
    website: d.website || null,
    hours: d.hours,
    hoursFr: d.hoursFr,
    ageMinMonths: d.ageMinMonths,
    ageMaxMonths: d.ageMaxMonths,
    infantMonthly: d.infantMonthly,
    toddlerMonthly: d.toddlerMonthly,
    preschoolMonthly: d.preschoolMonthly,
    partTimeMonthly: d.partTimeMonthly,
    factSource: d.factSource || null,
    spotsInfant: d.spotsInfant,
    spotsToddler: d.spotsToddler,
    spotsPreschool: d.spotsPreschool,
    waitlist: d.waitlist,
    ratingX10: d.ratingX10,
    reviewCount: d.reviewCount || d.reviews.length,
    parentRatingX10: 0,
    parentReviewCount: 0,
    googlePlaceId: d.googlePlaceId,
    licenseNumber: d.licenseNumber,
    languages: d.languages,
    staffLanguages: d.staffLanguages ?? [],
    culturalPrograms: d.culturalPrograms ?? [],
    culturalTeamNote: d.culturalTeamNote ?? null,
    amenities: d.amenities,
    photos: d.photos,
    verified: true,
    claimed: Boolean(d.claimed || d.claimedAt),
    claimedAt: d.claimedAt ?? null,
    claimStatus: d.claimStatus ?? null,
    listingActive: d.listingActive !== false,
    live: isPlatformLive(d.id, Boolean(d.claimed || d.claimedAt), {
      listingActive: d.listingActive,
      ratingX10: d.ratingX10,
      reviewCount: d.reviewCount,
      claimStatus: d.claimStatus,
      claimedAt: d.claimedAt,
    }) && !isAdminOnlyListing(d),
    contactEmail: null,
    feeConfirmed: Boolean(d.feeConfirmed),
    feeProgram: d.feeProgram || null,
    availabilityKnown: false,
    spotsUpdatedAt: null,
    lastVacancyUpdatedAt: null,
    ...defaultTrustFields(),
    staffScreeningAttested: Boolean(d.staffScreeningAttested),
    screeningOnFile: Boolean(d.screeningOnFile),
    licenseStatus: normalizeLicenseStatus(d.licenseStatus),
    registryMatchState: normalizeMatchState(d.registryMatchState),
    licenseVerificationSource: d.licenseVerificationSource ?? null,
    priority: false,
    priorityUntil: null,
    featuredCity: false,
    agesKnown: hasConfirmedAges({
      agesKnown: d.agesKnown,
      ageMinMonths: d.ageMinMonths,
      ageMaxMonths: d.ageMaxMonths,
    }),
    agesSource: d.agesSource || null,
    agesSourceUrl: d.agesSourceUrl || null,
    visibility: d.visibility,
    isTest: d.isTest,
    timezone: resolveListingTourTimezone(null, d.province),
  }));
  return applyMasterCareType({
    ...mapped,
    live: Boolean(mapped.live) && hasLicenceEvidence(mapped) && !isAdminOnlyListing(mapped),
  });
}

function toCard(d: NearbyListing, origin: { lat: number; lng: number }, originFsa?: string): DaycareCard {
  const daycare = toDaycare(d);
  const km = cardSortKm(origin, { lat: d.lat, lng: d.lng });
  const catchm = catchmentMatch(origin, { lat: d.lat, lng: d.lng, postalCode: d.postalCode }, km, originFsa);
  return {
    ...daycare,
    distanceKm: km,
    spotsTotal: spotsTotal(daycare),
    fromPrice: fromPrice(daycare),
    catchmentKm: catchm.catchmentKm,
    inCatchment: catchm.inCatchment,
  };
}

function withInboxReady(daycare: Daycare): Daycare {
  return {
    ...daycare,
    inboxMailReady: listingInfoSlaReady(daycare) && transactionalMailConfigured(),
  };
}

function rejectAfter(ms: number, message: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function catalogAvailability(found: CatalogDaycare): AvailabilityRow[] {
  return catalogMonths().map((month) => ({
    month,
    infant: found.spotsInfant,
    toddler: found.spotsToddler,
    preschool: found.spotsPreschool,
  }));
}

function mergeClaimedCard<T extends DaycareCard>(card: T, claimed: Daycare): T {
  const next = applyListingReadiness({
    ...card,
    ...claimed,
    claimed: true,
    live: claimed.live,
    feeConfirmed: claimed.feeConfirmed,
    availabilityKnown: claimed.availabilityKnown,
    lastVacancyUpdatedAt: claimed.lastVacancyUpdatedAt,
    spotsUpdatedAt: claimed.spotsUpdatedAt,
    ratingX10: claimed.ratingX10 || card.ratingX10,
    reviewCount: claimed.reviewCount || card.reviewCount,
    parentRatingX10: card.parentRatingX10 ?? claimed.parentRatingX10 ?? 0,
    parentReviewCount: card.parentReviewCount ?? claimed.parentReviewCount ?? 0,
    googlePlaceId: claimed.googlePlaceId || card.googlePlaceId,
    distanceKm: card.distanceKm,
    spotsInfant: claimed.spotsInfant,
    spotsToddler: claimed.spotsToddler,
    spotsPreschool: claimed.spotsPreschool,
    waitlist: claimed.waitlist,
    infantMonthly: claimed.infantMonthly,
    toddlerMonthly: claimed.toddlerMonthly,
    preschoolMonthly: claimed.preschoolMonthly,
    partTimeMonthly: claimed.partTimeMonthly,
    photos: claimed.photos?.length ? claimed.photos : card.photos,
    priority: claimed.priority,
    priorityUntil: claimed.priorityUntil,
    ageMinMonths: claimed.agesKnown ? claimed.ageMinMonths : card.ageMinMonths,
    ageMaxMonths: claimed.agesKnown ? claimed.ageMaxMonths : card.ageMaxMonths,
    agesKnown: claimed.agesKnown === true || (claimed.agesKnown !== false && Boolean(card.agesKnown)),
    agesSource: claimed.agesSource || card.agesSource || null,
    agesSourceUrl: claimed.agesSourceUrl || card.agesSourceUrl || null,
    hours: claimed.hours || card.hours,
    hoursFr: claimed.hoursFr || card.hoursFr,
    licenseNumber: claimed.licenseNumber || card.licenseNumber,
  });
  const trusted = applyLocalRegistryTrust(next);
  return { ...trusted, spotsTotal: spotsTotal(trusted), fromPrice: fromPrice(trusted) } as T;
}

function mapReviews(
  reviews: Array<
    Review & {
      daycare_id: string;
      body_fr: string;
      created_at: string;
      owner_reply?: string | null;
      owner_reply_at?: string | null;
      dimensions?: string | null;
    }
  >,
): Review[] {
  return reviews.map((r) => ({
    id: r.id,
    daycareId: r.daycare_id,
    author: r.author,
    rating: r.rating,
    body: r.body,
    bodyFr: r.body_fr,
    createdAt: String(r.created_at),
    status: r.status && r.status !== "approved" ? r.status : "published",
    ownerReply: r.owner_reply ? String(r.owner_reply).trim() : null,
    ownerReplyAt: r.owner_reply_at ? String(r.owner_reply_at) : null,
    dimensions: parseStoredDimensions(r.dimensions),
  }));
}

function withQualityCards<T extends { id: string; qualityScore?: number; guestFavorite?: boolean }>(
  cards: DaycareCard[],
  scored: T[],
): DaycareCard[] {
  const byId = new Map(scored.map((item) => [item.id, item]));
  return cards.map((card) => {
    const hit = byId.get(card.id);
    if (!hit) return card;
    return {
      ...card,
      ...hit,
      distanceKm: card.distanceKm,
      spotsTotal: card.spotsTotal,
      fromPrice: card.fromPrice,
      qualityScore: hit.qualityScore,
      guestFavorite: hit.guestFavorite,
    };
  });
}

/**
 * Search and featured cards drop long copy and contact fields.
 * The street stays so a map pin can open the same directions as the listing page.
 */
async function withProvincial<T extends { id: string; claimed?: boolean; lastVacancyUpdatedAt?: string | null }>(rows: T[]): Promise<T[]> {
  try {
    const { stampProvincialOpenings } = await import("@/lib/server/provincial-vacancy");
    return await stampProvincialOpenings(rows);
  } catch {
    return rows;
  }
}

async function stampPaidPlacement<T extends { id: string; priority?: boolean; priorityUntil?: string | null; featuredCity?: boolean }>(
  items: T[],
): Promise<T[]> {
  const placed = sponsoredPinsFirst() ? await overlayPriority(items) : items;
  return overlayFeaturedCity(placed);
}

function slimCard(card: DaycareCard): DaycareCard {
  return {
    ...card,
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    phone: null,
    hoursFr: "",
    contactEmail: null,
    photos: [listingThumb(card.photos)],
  };
}

function alignedSearchInput(data: SearchInput): SearchInput {
  const aligned = alignSearchOrigin({
    lat: data.lat,
    lng: data.lng,
    radiusKm: data.radiusKm,
    q: data.q,
    label: data.label,
  });
  return {
    ...data,
    lat: aligned.lat,
    lng: aligned.lng,
    label: aligned.label || data.label,
  };
}

/** Live + licence rows only. Used when the full catalogue search times out or returns nothing. */
async function liveCardsForSearch(data: SearchInput): Promise<DaycareCard[]> {
  return (await liveCardsForSearchResult(data)).rows;
}

async function liveCardsForSearchResult(data: SearchInput): Promise<SearchCandidates> {
  const origin = { lat: data.lat, lng: data.lng };
  const lock = resolveLocationLock({
    lat: origin.lat,
    lng: origin.lng,
    label: data.label,
    q: data.q,
  });
  const batch = await mergeApprovedCityListingsResult({ rows: [], evidence: searchEvidence({ status: "complete", source: "primary" }) }, {
    origin,
    radiusKm: data.radiusKm,
    lock,
    label: data.label || data.q,
  }, { refresh: data.refresh });
  const listed = publicListings(uniqueById(batch.rows.map((row) => toCard(row, origin, data.fsa)))).filter((card) =>
    includeCardInRadius(card, origin, data.radiusKm),
  );
  const claimed = await overlayClaimedSearchResult(listed, mergeClaimedCard);
  const pinned = await stampPaidPlacement(publicListings(claimed.rows));
  return {
    rows: (await withProvincial(pinned)).map(slimCard),
    evidence: mergeSearchEvidence(batch.evidence, claimed.evidence),
    excludedIds: claimed.rows.filter((card) => !isPublicListing(card)).map((card) => card.id),
  };
}

/** Public catalogue matches for a centre name. Distance is display-only. */
async function searchByName(data: SearchInput): Promise<SearchCandidates> {
  const q = (data.name || "").trim();
  if (q.length < 2) return { rows: [], evidence: searchEvidence({ status: "complete", source: "primary" }) };
  const origin = { lat: data.lat, lng: data.lng };
  let matched: SearchBatch<CatalogDaycare> | null = null;
  try {
    const { queryNeonListingsByIdsResult, queryNeonPublicNameIndexResult } = await import("@/lib/server/catalog-neon");
    const options = { refresh: data.refresh };
    const index = await queryNeonPublicNameIndexResult(options);
    if (index) {
      const hits = filterByDaycareName(
        index.rows.map((row) => ({ id: row.id, name: row.name, nameFr: row.name_fr || "" })),
        q,
      );
      const found = hits.length === 0 ? { rows: [], evidence: index.evidence }
        : await queryNeonListingsByIdsResult(hits.map((row) => row.id), options);
      if (found) matched = { rows: found.rows, evidence: mergeSearchEvidence(index.evidence, found.evidence) };
    }
  } catch {
    matched = null;
  }
  if (!matched) {
    const catalog = await getPublicCatalogResult({ refresh: data.refresh });
    matched = withSearchRows(catalog, filterByDaycareName(catalog.rows, q));
  }
  const mapped = matched.rows.map((row) => toCard(row, origin, data.fsa));
  // Name results need the same claimed vacancy proof before public predicates run.
  const claimed = await overlayClaimedSearchResult(mapped, mergeClaimedCard);
  const cards = await stampPaidPlacement(publicListings(claimed.rows).map(slimCard));
  cards.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  return {
    rows: cards, evidence: mergeSearchEvidence(matched.evidence, claimed.evidence),
    excludedIds: claimed.rows.filter((card) => !isPublicListing(card)).map((card) => card.id),
  };
}

async function searchIncludingLive(data: SearchInput): Promise<SearchCandidates> {
  if ((data.name || "").trim().length >= 2) return searchByName(data);
  const decision = resolveSearchDirectory({ q: data.q, city: data.city });
  if (decision.kind === "unknown") return { rows: [], evidence: searchEvidence() };
  const hub = decision.kind === "hub" ? cityHubDefBySlug(decision.slug) : null;
  const searched = alignedSearchInput(
    hub
      ? { ...data, q: data.q || cityHubMapSearchQuery(hub), directorySlug: hub.slug }
      : data,
  );
  if (hub) return runSearch({ ...searched, directorySlug: hub.slug });
  const livePromise = liveCardsForSearchResult(searched);
  void livePromise.catch(() => undefined);
  const full = await settleSearchRead(runSearch(searched), LOADER_SETTLE_MS);
  const live = await settleSearchRead(livePromise, full.kind === "result" && full.batch.rows.length > 0 ? 80 : 400);
  const facility = data.facility;
  const combined = combineSearchReads(full, live);
  const excludedIds = new Set([
    ...(full.kind === "result" ? (full.batch as SearchCandidates).excludedIds ?? [] : []),
    ...(live.kind === "result" ? (live.batch as SearchCandidates).excludedIds ?? [] : []),
  ]);
  const rows = uniqueById(combined.rows).filter((card) => !excludedIds.has(card.id));
  return {
    ...withSearchRows(combined, facility ? rows.filter((card) => matchesListedDaycareType(card, facility)) : rows),
    excludedIds: [...excludedIds],
  };
}

async function mergePinnedCentres(
  cards: DaycareCard[],
  lock: ReturnType<typeof resolveLocationLock>,
  origin: { lat: number; lng: number },
  fsa?: string,
): Promise<DaycareCard[]> {
  const ids = await featuredCentreIdsInLock(lock);
  const have = new Set(cards.map((card) => card.id));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return cards;
  const found = await catalogByIdsGet(missing);
  const extra = found
    .map((row) => toCard(row, origin, fsa))
    .filter((card) => filterByLocationLock([card], lock).length > 0);
  return extra.length ? [...cards, ...extra] : cards;
}

async function mergePinnedSearchCentres(
  batch: SearchBatch<DaycareCard>, lock: ReturnType<typeof resolveLocationLock>,
  origin: { lat: number; lng: number }, data: SearchInput,
): Promise<SearchBatch<DaycareCard>> {
  const ids = await featuredCentreIdsInLockResult(lock);
  const have = new Set(batch.rows.map((card) => card.id));
  const missing = ids.rows.filter((id) => !have.has(id));
  const evidence = mergeSearchEvidence(batch.evidence, ids.evidence);
  if (!missing.length) return { rows: batch.rows, evidence };
  const found = await catalogByIdsGetResult(missing, { refresh: data.refresh });
  const extra = found.rows.map((row) => toCard(row, origin, data.fsa))
    .filter((card) => filterByLocationLock([card], lock).length > 0);
  return { rows: extra.length ? [...batch.rows, ...extra] : batch.rows,
    evidence: mergeSearchEvidence(evidence, found.evidence) };
}

/** Exact city + province rows, even when the stored pin is outside the radius. */
async function withNamedCityListings(
  batch: SearchBatch<NearbyListing>,
  lock: ReturnType<typeof resolveLocationLock>,
  data: SearchInput,
): Promise<SearchBatch<NearbyListing>> {
  const rows = batch.rows;
  if (!lock?.city || !lock.province) return batch;
  const key = normalizeCityKey(lock.city);
  if (!key) return batch;
  if (rows.some((row) => normalizeCityKey(row.city) === key)) return batch;
  const options = { refresh: data.refresh };
  const neon = await queryNeonCityHubListingsResult(lock.province, [key], options);
  const extra =
    neon && neon.rows.length > 0 ? neon : await catalogNamedCityFromJsonResult(lock.city, lock.province, options);
  return { rows: uniqueById([...rows, ...extra.rows]), evidence: mergeSearchEvidence(batch.evidence, extra.evidence) };
}

async function runSearch(data: SearchInput): Promise<SearchCandidates> {
  const work =
    typeof data.lat2 === "number" && typeof data.lng2 === "number"
      ? { lat: data.lat2, lng: data.lng2 }
      : null;
  const anchors = resolveSearchAnchors({
    home: { lat: data.lat, lng: data.lng },
    work,
    mode: data.mode,
  });
  const origin = anchors.primary;
  const lock = resolveLocationLock({
    lat: origin.lat,
    lng: origin.lng,
    label: data.label,
    q: data.q,
  });
  const directory = data.directorySlug ? cityHubDefBySlug(data.directorySlug) : null;
  const corridor =
    !directory && anchors.intersect && anchors.secondary
      ? await nearbyListingsAlongResult(anchors.primary, anchors.secondary, data.radiusKm, { refresh: data.refresh })
      : null;
  const pool = directory
    ? await listingsForCityHubResult(directory.slug, { refresh: data.refresh })
    : (
        anchors.intersect && anchors.secondary
          ? await nearbyListingsDualResult(anchors.primary, anchors.secondary, data.radiusKm, { refresh: data.refresh })
          : await nearbyListingsResult(origin, data.radiusKm, data.facility ? CITY_TYPE_LIST_CAP : 400, { refresh: data.refresh })
      );
  const lockedPool = directory ? pool : withSearchRows(pool, filterByLocationLock(pool.rows, lock));
  const merged = await mergeApprovedCityListingsResult(lockedPool, {
    origin,
    radiusKm: data.radiusKm,
    lock,
    label: data.label || data.q,
  }, { refresh: data.refresh });
  const listings = directory ? merged : await withNamedCityListings(merged, lock, data);
  let cards: DaycareCard[] = [];
  for (const d of listings.rows) {
    cards.push(toCard(d, origin, data.fsa));
  }
  cards = filterByLocationLock(cards, lock);
  if (corridor?.rows.length) {
    const kept = new Set(cards.map((card) => card.id));
    for (const row of corridor.rows) {
      if (!kept.has(row.id)) cards.push(toCard(row, origin, data.fsa));
    }
  }
  const candidateBatch = await mergePinnedSearchCentres({ rows: cards,
    evidence: corridor ? mergeSearchEvidence(listings.evidence, corridor.evidence) : listings.evidence }, lock, origin, data);
  cards = candidateBatch.rows;
  const overlayCap = 192;
  const rankSort =
    data.sort === "best" || data.sort === "match" || data.sort === "recommended" || data.sort === "urgency";
  if (!rankSort && cards.length > overlayCap) {
    cards.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  }
  const headLength = rankSort ? cards.length : Math.min(cards.length, overlayCap);
  const claimed = await overlayClaimedSearchResult(cards, mergeClaimedCard);
  const enrichedBatch = {
    rows: claimed.rows,
    evidence: mergeSearchEvidence(candidateBatch.evidence, claimed.evidence),
  };
  // Keep the same prefix for expensive overlays; claimed facts also cover its tail.
  const distanceTail = claimed.rows.slice(headLength);
  cards = claimed.rows.slice(0, headLength);
  cards = await overlayParentReviews(cards);
  cards = await overlayQuality(cards);
  const rankPrefs = {
    ageGroup: data.ageGroup,
    radiusKm: data.radiusKm,
    distanceKnown: true,
    startDate: data.startDate || null,
  };
  cards = await overlayParentRank(cards, rankPrefs);
  cards = sponsoredPinsFirst() ? await overlayPriority(cards) : cards;
  cards = await overlayFeaturedCity(cards);
  if (distanceTail.length) cards = cards.concat(distanceTail);
  const ageGroup = data.ageGroup;
  if (ageGroup !== "any") {
    cards = cards.filter((c) => {
      if (listingAgeUnknown(c)) return true;
      return standardGroupsForRange(c.ageMinMonths, c.ageMaxMonths).includes(ageGroup);
    });
  }
  const fit = parentFitApplies(data.parentFit) ? data.parentFit : null;
  if (fit) {
    cards = cards.map((card) => ({ ...card, parentFitChips: parentFitScore(fitListing(card), fit).chips }));
  }
  cards = collapseAdjacentDuplicates(cards);
  const rankingV2 = rankingV2Enabled();
  if (rankingV2) cards = excludeRankingV2(cards, true);
  const pinsOn = sponsoredPinsFirst();
  const useBest = data.sort === "best";
  const matchQuery = smartQuery(data);
  if (fit && usesParentFitSort(data.sort)) {
    cards.sort(
      withJunkLast((a, b) => {
        const delta = compareParentFit(fitListing(a), fitListing(b), fit);
        if (delta !== 0) return delta;
        const fresh = compareFreshOpenSpots(a, b);
        if (fresh !== 0) return fresh;
        return a.distanceKm - b.distanceKm;
      }),
    );
  } else if (useBest) {
    cards.sort(withJunkLast((a, b) => rankingV2TieBreak(a, b, (left, right) => compareSmartMatchOrNearest(left, right, matchQuery), { enabled: rankingV2, now: Date.now(), ageGroup })));
  } else {
    cards.sort(
      withJunkLast((a, b) =>
        compareWithPaidPins(a, b, (left, right) => {
          if (data.sort === "match") return compareParentMatch(left, right, rankPrefs);
          if (data.sort === "urgency") return compareParentUrgency(left, right, rankPrefs);
          if (data.sort === "recommended") {
            const delta = recommendedRank(right) - recommendedRank(left);
            if (Math.abs(delta) > 1e-6) return delta;
            const fresh = compareFreshOpenSpots(left, right);
            if (fresh !== 0) return fresh;
            return left.distanceKm - right.distanceKm;
          }
          if (data.sort === "price") {
            const price = (left.fromPrice || 9e6) - (right.fromPrice || 9e6);
            if (price !== 0) return price;
            const fresh = compareFreshOpenSpots(left, right);
            if (fresh !== 0) return fresh;
            return left.distanceKm - right.distanceKm;
          }
          if (data.sort === "rating") {
            const rating = right.ratingX10 - left.ratingX10;
            if (rating !== 0) return rating;
            const fresh = compareFreshOpenSpots(left, right);
            if (fresh !== 0) return fresh;
            return left.distanceKm - right.distanceKm;
          }
          if (data.sort === "availability") {
            const spots = right.spotsTotal - left.spotsTotal;
            if (spots !== 0) return spots;
            const fresh = compareFreshOpenSpots(left, right);
            if (fresh !== 0) return fresh;
            return left.distanceKm - right.distanceKm;
          }
          return compareProximity(left, right, Date.now(), { paidPinBoost: pinsOn });
        }, { enabled: pinsOn }),
      ),
    );
  }
  const facility = data.facility;
  const listed = publicListings(uniqueById(filterByLocationLock(cards, lock)))
    .filter((card) => (facility ? matchesListedDaycareType(card, facility) : true))
    .filter((card) => {
      if (!directory) return true;
      if (listingBelongsToHub(card, directory)) return true;
      // Approved centres can sit outside the hub city string and still belong in Live search.
      return isClaimVerified(card);
    });
  if (data.countDemand) {
    await recordRankingSearch({
      city: data.city || data.label || data.q,
      ageGroup: data.rankAge || data.ageGroup,
    });
  }
  const stamped = await withProvincial(listed);
  const resultRows = stamped.map((card) => {
    const slim = slimCard(card);
    if (!useBest) return slim;
    return { ...slim, smartMatchWhy: whyForListing(card, matchQuery) };
  });
  return {
    ...withSearchRows(enrichedBatch, resultRows),
    excludedIds: claimed.rows.filter((card) => !isPublicListing(card)).map((card) => card.id),
  };
}

function normalizeSearchInput(input: SearchInput | null | undefined): SearchInput {
  if (!input || typeof input !== "object") throw new ClientInputError();
  const city = typeof input.city === "string" ? input.city.trim().slice(0, 80) : "";
  const located = city ? geocode(city) : null;
  return {
    ...input,
    directorySlug: undefined,
    city,
    q: (typeof input.q === "string" && input.q.trim()) || located?.label || input.q,
    radiusKm: clampRadiusKm(Number(input.radiusKm) || 25),
    lat2: optionalCoord(input.lat2),
    lng2: optionalCoord(input.lng2),
    mode: parseAnchorMode(input.mode),
    sort: parseSort(input.sort),
    rankAge: parseRankAge(input.rankAge),
    wantSubsidy: input.wantSubsidy === true,
    wantExtendedHours: input.wantExtendedHours === true,
    schedules: parseSchedules(input.schedules),
    countDemand: input.countDemand === true,
    refresh: input.refresh === true,
    parentFit: parseParentFit(input.parentFit),
    name: typeof input.name === "string" ? input.name.trim().slice(0, 80) : "",
    live: readLiveSearchFlag(input.live),
    diet: parseCareKeys(input.diet).join(","),
    filters: normalizeSearchResultFilters(input.filters),
    facility: listedDaycareTypeFromSearch(
      input.facility === "before_after" ? { cat: "before-after" } : { fac: input.facility },
    ),
  };
}

/** Hidden QA fixtures for a flagged test account. Never written into the public search memo. */
async function loadTestFixtureCards(data: SearchInput): Promise<DaycareCard[]> {
  try {
    const sql = await getSql();
    const rows = await sql<DaycareRow>`
      select * from daycares d
      where d.is_test = 1
         or d.slug ilike 'qa-%'
         or d.slug ilike 'qa\\_%'
         or d.name ilike '%qa test%'
      limit 40
    `;
    const origin = { lat: data.lat, lng: data.lng };
    const nameQ = (data.name || "").trim().toLowerCase();
    const radius = clampRadiusKm(data.radiusKm);
    const cards: DaycareCard[] = [];
    for (const row of rows) {
      const daycare = mapDaycare(row);
      if (!isHiddenTestListing(daycare)) continue;
      const km = cardSortKm(origin, { lat: daycare.lat, lng: daycare.lng });
      if (nameQ.length >= 2) {
        const blob = `${daycare.name} ${daycare.slug}`.toLowerCase();
        if (!blob.includes(nameQ)) continue;
      } else if (km > radius) {
        continue;
      }
      cards.push({
        ...daycare,
        distanceKm: km,
        spotsTotal: spotsTotal(daycare),
        fromPrice: fromPrice(daycare),
      });
    }
    return cards;
  } catch {
    return [];
  }
}

async function appendTestAccountFixtures(data: SearchInput, cards: DaycareCard[]): Promise<DaycareCard[]> {
  if (!(await callerIsTestAccount())) return cards;
  const extra = await loadTestFixtureCards(data);
  if (!extra.length) return cards;
  return uniqueById([...extra, ...cards]);
}

function rankedSearchMemoKey(data: SearchInput): string {
  return `coverage1:${searchMemoKey(data)}:${parentFitCacheKey(data.parentFit ?? null)}:rank=${JSON.stringify({
    age: data.rankAge,
    subsidy: data.wantSubsidy,
    extended: data.wantExtendedHours,
    schedules: data.schedules,
  })}`;
}

export const searchDaycares = createServerFn({ method: "GET" })
  .validator((input: SearchInput) => normalizeSearchInput(input))
  .handler(async ({ data }) => {
    const found = await rememberSearch(
      rankedSearchMemoKey(data),
      () => searchIncludingLive(data),
      { refresh: data.refresh, cacheIf: (batch) => !batch.evidence.retryable },
    );
    return sealPublicHomes(await appendTestAccountFixtures(data, found.rows));
  });

/** Shared matched set. Ranking stays in searchIncludingLive; filters never reorder it. */
async function filteredSearchRows(query: SearchInput): Promise<SearchBatch<DaycareCard>> {
  const found = await rememberSearch(
    rankedSearchMemoKey(query),
    () => searchIncludingLive(query),
    { refresh: query.refresh, cacheIf: (batch) => !batch.evidence.retryable },
  );
  const listed = query.live ? found.rows.filter((card) => isClaimVerified(card) && !card.isTest) : found.rows;
  const all = await appendTestAccountFixtures(query, listed);
  const filters = normalizeSearchResultFilters(query.filters);
  // Preserve the existing feature gate for declared dietary/support predicates.
  filters.diet = inclusiveFiltersEnabled() ? parseCareKeys([query.diet, filters.diet].filter(Boolean).join(",")).join(",") : "";
  // The top-level name is authoritative, including loader calls without filters.
  filters.name = query.name || filters.name;
  const aligned = alignedSearchInput(query);
  return withSearchRows(found, filterSearchResults(all, {
    origin: { lat: aligned.lat, lng: aligned.lng },
    secondOrigin: typeof query.lat2 === "number" && typeof query.lng2 === "number" ? { lat: query.lat2, lng: query.lng2 } : null,
    mode: query.mode,
    radiusKm: query.radiusKm,
    filters,
  }));
}

/** Same ranking as searchDaycares, filtered before one page of 96 cards. */
export const searchDaycarePage = createServerFn({ method: "GET" })
  .validator((input: (SearchInput & { page?: unknown }) | undefined) => {
    if (!input || typeof input !== "object") throw new ClientInputError();
    const page = pageFromSearch({ page: input.page });
    return { ...normalizeSearchInput(input), page };
  })
  .handler(async ({ data }) => {
    const { page, ...query } = data;
    const narrowed = await filteredSearchRows(query);
    return sealPublicHomes({ ...sliceSearchPage(narrowed.rows, page), evidence: narrowed.evidence });
  });

/** Full matching map set, with the same predicates and total as every list page. */
export const searchDaycareMap = createServerFn({ method: "GET" })
  .validator((input: SearchInput) => normalizeSearchInput(input))
  .handler(async ({ data }) => {
    const matched = await filteredSearchRows({ ...data, countDemand: false });
    // Seal homes while full privacy signals still exist, before the slim pin projection.
    const sealed = await sealPublicHomes(matched.rows.filter(hasSearchCoordinates));
    return { pins: projectSearchMapPins(sealed), total: matched.rows.length, evidence: matched.evidence };
  });

/** Home type rows page 12 at a time. Keep a few pages of each nearby type. */
const HOME_TYPE_POOL = 72;

async function loadFeatured(
  origin: { lat: number; lng: number; label?: string },
  radiusKm: number,
): Promise<DaycareCard[]> {
  const radius = clampRadiusKm(radiusKm);
  const lock = resolveLocationLock(origin);
  const nearby: DaycareCard[] = [];
  for (const d of await mergeApprovedCityListings(filterByLocationLock(await nearbyListings(origin, radius), lock), {
    origin,
    radiusKm: radius,
    lock,
    label: origin.label,
  })) {
    nearby.push(toCard(d, origin));
  }
  const pinned = await mergePinnedCentres(nearby, lock, origin);
  const pinsOn = sponsoredPinsFirst();
  pinned.sort((a, b) => compareProximity(a, b, Date.now(), { paidPinBoost: pinsOn }));
  const merged = await overlayQuality(await overlayParentReviews(await overlayClaimed(pinned, mergeClaimedCard)));
  const scored = await overlayParentRank(merged, { distanceKnown: true, radiusKm: radius, ageGroup: "any" });
  const withPins = pinsOn
    ? await overlayFeaturedCity(await overlayPriority(scored))
    : await overlayFeaturedCity(scored);
  const ranked = (sponsoredPinsFirst() ? sortFeaturedCityAfterPriority(withPins) : withPins).filter((card) =>
    includeCardInRadius(card, origin, radius),
  );
  return withProvincial(publicListings(uniqueById(filterByLocationLock(ranked, lock))).slice(0, HOME_TYPE_POOL)).then((rows) => rows.map(slimCard));
}

export const featuredDaycares = createServerFn({ method: "GET" })
  .validator((input: { lat: number; lng: number; label?: string; radiusKm?: number } | undefined) => {
    if (!input || typeof input !== "object") throw new ClientInputError();
    return {
      ...input,
      radiusKm: clampRadiusKm(Number(input.radiusKm) || 25),
    };
  })
  .handler(async ({ data }) => {
    const radiusKm = data.radiusKm;
    // Keep the parent's coordinates. A city label must not snap the pin to
    // that city's downtown and invent "1.1 km away".
    const origin = {
      lat: Number(data.lat),
      lng: Number(data.lng),
      label: (data.label || "").trim(),
    };
    const full = await withTimeoutFallback(loadFeatured(origin, radiusKm), LOADER_SETTLE_MS, null);
    if (full && full.length > 0) return sealPublicHomes(full);
    return sealPublicHomes(await liveCardsForSearch({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm,
      sort: "best",
      ageGroup: "any",
      label: origin.label,
    }));
  });

export const getDaycare = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const found = await catalogBySlugGet(slug);
    if (!found) return null;
    const [adminView, testAccount] = await Promise.all([
      callerMayViewHiddenListing(found.id),
      callerIsTestAccount(),
    ]);
    if (hideListingFromPublicPage(found, { admin: adminView, testAccount })) return null;
    const origin = { lat: found.lat, lng: found.lng };
    // The nearest 400 within 40 km include every centre the 15 km query would return.
    const metroPeers = uniqueById(
      (await catalogNear(origin, 40))
        .filter((d) => d.id !== found.id)
        .map((d) => toCard(d, origin)),
    );
    const nearby = metroPeers.filter((card) => card.distanceKm <= 15).slice(0, 4);
    const catalogDaycare = toDaycare(found);
    const stampHidden = <T extends { visibility?: "public" | "admin_only"; isTest?: boolean }>(daycare: T): T => ({
      ...daycare,
      visibility: found.visibility,
      isTest: found.isTest,
    });
    try {
      const sql = await Promise.race([getSql(), rejectAfter(6000, "listing-sql-timeout")]);
      const claimedRow = await sql<DaycareRow>`
        select * from daycares d
        where d.id = ${found.id}
          and (
            d.claimed_at is not null
            or exists (select 1 from provider_daycares pd where pd.daycare_id = d.id)
            or exists (select 1 from listing_claims lc where lc.daycare_id = d.id)
          )
        limit 1
      `.catch(() => [] as DaycareRow[]);
      const daycare = claimedRow[0] ? mapDaycare(claimedRow[0]) : toDaycare(found);
      if (!daycare.reviewCount) {
        daycare.ratingX10 = found.ratingX10;
        daycare.reviewCount = found.reviewCount;
      }
      daycare.googlePlaceId = found.googlePlaceId ?? daycare.googlePlaceId;
      type PublicReviewRow = Review & {
        daycare_id: string;
        body_fr: string;
        created_at: string;
        status?: string;
        owner_reply?: string | null;
        owner_reply_at?: string | null;
        dimensions?: string | null;
      };
      const reviews = await sql<PublicReviewRow>`
        select id, daycare_id, author, rating, body, body_fr, created_at, status, owner_reply, owner_reply_at, dimensions
        from reviews
        where daycare_id = ${daycare.id}
          and status in ('published', 'approved')
          and coalesce(user_id, '') <> ''
        order by created_at desc
        limit 20
      `.catch(() =>
        sql<PublicReviewRow>`
          select id, daycare_id, author, rating, body, body_fr, created_at, status
          from reviews
          where daycare_id = ${daycare.id}
            and status in ('published', 'approved')
            and coalesce(user_id, '') <> ''
          order by created_at desc
          limit 20
        `.catch(() => [] as PublicReviewRow[]),
      );
      const parent = parentReviewSummary(reviews);
      daycare.parentRatingX10 = parent.ratingX10;
      daycare.parentReviewCount = parent.count;
      let availability = await sql<AvailabilityRow>`
        select month, infant, toddler, preschool from availability
        where daycare_id = ${daycare.id} order by month
      `.catch(() => [] as AvailabilityRow[]);
      if (availability.length === 0) availability = catalogAvailability(found);
      const day = new Date().toISOString().slice(0, 10);
      await sql`
        insert into daycare_views (daycare_id, viewed_on, count)
        values (${daycare.id}, ${day}, 1)
        on conflict (daycare_id, viewed_on)
        do update set count = daycare_views.count + 1
      `.catch(() => undefined);
      const overlayed = await overlayQuality([daycare, ...metroPeers], {
        persist: true,
        persistIds: [daycare.id],
      });
      const jobRows = await sql<{ id: string; role: string; note: string; created_at: string }>`
        select id, role, note, created_at
        from centre_job_posts
        where daycare_id = ${daycare.id}
        order by created_at desc
        limit 8
      `.catch(() => [] as { id: string; role: string; note: string; created_at: string }[]);
      const jobs: CentreJobPost[] = jobRows.map((row) => ({
        id: row.id,
        role: row.role,
        note: row.note,
        createdAt: String(row.created_at),
      }));
      const inspections: PublicInspection[] = inspectionHistoryEnabled()
        ? await readCachedInspections(sql, daycare.province, daycare.licenseNumber)
        : [];
      const { inspectionSummaryForLicence } = await import("@/lib/server/wiring/inspection-sync");
      const inspectionSync = daycare.licenseNumber
        ? await inspectionSummaryForLicence(daycare.province, daycare.licenseNumber)
        : null;
      const mainStamped = await withProvincial([overlayed[0] ?? daycare]);
      const nearbyStamped = await withProvincial(withQualityCards(nearby, overlayed));
      const mainReady = stampHidden(withInboxReady(mainStamped[0] ?? daycare));
      const [mainPinned] = await stampPaidPlacement([mainReady]);
      const nearbyPinned = await stampPaidPlacement(nearbyStamped);
      let publicDaycare = mainPinned ?? mainReady;
      let familyGuide: { dropoff: string; bring: string; handbook: string } | null = null;
      if (hostListingEnabled()) {
        const { readPublicHostDay } = await import("@/lib/server/host-calendar");
        const extra = await readPublicHostDay(sql, publicDaycare).catch(() => null);
        if (extra?.spots) {
          publicDaycare = {
            ...publicDaycare,
            spotsInfant: extra.spots.infant,
            spotsToddler: extra.spots.toddler,
            spotsPreschool: extra.spots.preschool,
            lastVacancyUpdatedAt: extra.spots.updatedAt || publicDaycare.lastVacancyUpdatedAt,
            spotsUpdatedAt: extra.spots.updatedAt || publicDaycare.spotsUpdatedAt,
          };
          if (extra.spots.updatedAt) publicDaycare.availabilityKnown = Boolean(extra.spots.updatedAt);
          availability = patchAvailabilityMonth(availability, extra.month, extra.spots);
        }
        familyGuide = extra?.familyGuide ?? null;
      }
      const { readPublicListingSpaces } = await import("@/lib/listing-spaces-store");
      const spaces = await readPublicListingSpaces(sql, publicDaycare.id, publicDaycare.photos).catch(() => null);
      return sealPublicHomes({
        daycare: publicDaycare,
        reviews: mapReviews(reviews),
        availability,
        familyGuide,
        spaces,
        nearby: nearbyPinned,
        jobs,
        inspections,
        inspectionSync,
        reviewReports: reviewReportsEnabled(),
        eceJobs: eceJobsEnabled(),
      });
    } catch {
      const catalogScored = await overlayQuality([catalogDaycare, ...metroPeers]);
      const catalogDaycareOut = stampHidden(withInboxReady(catalogScored[0] ?? catalogDaycare));
      const [catalogPinned] = await stampPaidPlacement([catalogDaycareOut]);
      const catalogNearby = await stampPaidPlacement(withQualityCards(nearby, catalogScored));
      return sealPublicHomes({
        daycare: catalogPinned ?? catalogDaycareOut,
        reviews: [] as Review[],
        availability: catalogAvailability(found),
        familyGuide: null,
        spaces: null,
        nearby: catalogNearby,
        jobs: [] as CentreJobPost[],
        inspections: [] as PublicInspection[],
        inspectionSync: null,
        reviewReports: reviewReportsEnabled(),
        eceJobs: eceJobsEnabled(),
      });
    }
  });

/**
 * Old URL of a hidden possible-second-site row.
 * 301s to that city's hub or search page. Never to the live sibling.
 */
export const getHiddenReviewRedirect = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const { neonHiddenReviewPlace } = await import("@/lib/server/catalog-neon");
    const { hiddenReviewRedirectTarget } = await import("@/lib/hidden-review");
    const place = await neonHiddenReviewPlace(slug);
    if (!place) return null;
    return hiddenReviewRedirectTarget(place.city, place.province);
  });

/** Slim catalogue snapshot for listing <head> / JSON-LD. No view increment. */
export const getListingSeo = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const found = await catalogBySlugGet(slug);
    if (!found) return null;
    const [adminView, testAccount] = await Promise.all([
      callerMayViewHiddenListing(found.id),
      callerIsTestAccount(),
    ]);
    if (hideListingFromPublicPage(found, { admin: adminView, testAccount })) return null;
    const sealed = await sealPublicHomes(toDaycare(found));
    return {
      noindex: isExactSlugDemoListing(found),
      slug: sealed.slug,
      name: sealed.name,
      nameFr: sealed.nameFr,
      city: sealed.city,
      province: sealed.province,
      address: sealed.address,
      postalCode: sealed.postalCode,
      addressProtected: sealed.addressProtected === true,
      phone: sealed.phone || null,
      agesKnown: hasConfirmedAges({
        agesKnown: sealed.agesKnown,
        ageMinMonths: sealed.ageMinMonths,
        ageMaxMonths: sealed.ageMaxMonths,
      }),
      ageMinMonths: sealed.ageMinMonths,
      ageMaxMonths: sealed.ageMaxMonths,
      photos: sealed.photos,
      amenities: sealed.amenities,
      facilityType: sealed.facilityType,
      feeProgram: sealed.feeProgram || null,
      description: sealed.description || "",
      descriptionFr: sealed.descriptionFr || "",
      hours: sealed.hours || "",
      hoursFr: sealed.hoursFr || "",
    };
  });

export const getDaycaresByIds = createServerFn({ method: "GET" })
  .validator((ids: string[] | undefined) => {
    if (!Array.isArray(ids)) throw new ClientInputError();
    return ids.filter((id) => typeof id === "string" && id.length > 0);
  })
  .handler(async ({ data: keys }) => {
    const origin = { lat: 49.8951, lng: -97.1384 };
    const byId = await catalogByIdsGet(keys);
    const foundIds = new Set(byId.map((d) => d.id));
    const extras = [];
    for (const key of keys) {
      if (foundIds.has(key)) continue;
      const row = await catalogBySlugGet(key);
      if (row) extras.push(row);
    }
    const found = [...byId, ...extras].filter(isPublicListing);
    const cards = uniqueById(found.map((d) => toCard(d, origin)));
    const claimed = await overlayQuality(await overlayParentReviews(await overlayClaimed(cards, mergeClaimedCard)));
    return sealPublicHomes(await stampPaidPlacement(await overlayParentRank(claimed, { distanceKnown: false, ageGroup: "any" })));
  });
