import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { filterByLocationLock, resolveLocationLock } from "@/lib/location-lock";
import { catchmentMatch, clampRadiusKm, compareProximity, distanceKm, recommendedRank } from "@/lib/proximity";
import { resolveListingTourTimezone } from "@/lib/tour-calendar";
import {
  catalogByIdsGet,
  catalogBySlugGet,
  catalogMonths,
  catalogNamedCityFromJson,
  catalogNear,
  type CatalogDaycare,
} from "@/lib/catalog";
import { hideListingFromPublicPage, isAdminOnlyListing, isPublicListing, publicListings } from "@/lib/listing-visibility";
import { parseAnchorMode, resolveSearchAnchors } from "@/lib/dual-anchor";
import { nearbyListings, nearbyListingsDual, type NearbyListing } from "./nearby";
import { callerIsAdmin } from "./public-listing";
import { upsertDaycare } from "./seed";
import { applyListingReadiness, compareFreshOpenSpots } from "@/lib/listing-readiness";
import { listingAgeUnknown } from "@/lib/now-loops";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { overlayClaimed } from "./claims";
import { overlayParentReviews } from "./reviews";
import { overlayQuality } from "./quality";
import { overlayParentRank } from "./rank";
import { overlayPriority } from "./promos";
import { featuredCentreIdsInLock, overlayFeaturedCity } from "@/lib/server/provider-entitlements";
import { compareWithPaidPins, sortFeaturedCityAfterPriority } from "@/lib/provider-entitlements";
import { compareSmartMatchOrNearest, whyForListing, type RankAge, type SmartMatchQuery } from "@/lib/ranking/score";
import { recordRankingSearch } from "@/lib/server/ranking-market";
import { compareParentMatch } from "@/lib/parent-match";
import { compareParentUrgency } from "@/lib/parent-urgency";
import { parentReviewSummary } from "@/lib/review-gate";
import { hasLicenceEvidence } from "@/lib/approve-live";
import { isPlatformLive } from "@/lib/live";
import { defaultTrustFields, normalizeLicenseStatus, normalizeMatchState } from "@/lib/trust";
import { applyLocalRegistryTrust } from "@/lib/server/license-match";
import { listingThumb } from "@/lib/photo";
import { uniqueById } from "@/lib/utils";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { pageFromSearch, sliceSearchPage } from "@/lib/search-page";
import { rememberSearch, searchMemoKey } from "./search-memo";
import { mergeApprovedCityListings } from "./approved-search";
import { alignSearchOrigin } from "@/lib/search-query";
import { transactionalMailConfigured } from "@/lib/transactional-mail";
import { listingInfoSlaReady } from "@/lib/parent-listing";
import { listedDaycareTypeFromSearch, matchesListedDaycareType } from "@/lib/care-type";
import { CITY_TYPE_LIST_CAP, queryNeonCityHubListings } from "@/lib/server/catalog-neon";
import { applyMasterCareType } from "@/lib/server/master-care-type";
import { resolveSearchDirectory, listingBelongsToHub } from "@/lib/city-directory";
import { cityHubDefBySlug, cityHubMapSearchQuery, normalizeCityKey } from "@/lib/city-hubs";
import { listingsForCityHub } from "@/lib/server/city-directory";
import { geocode } from "@/lib/geo";
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
};

function parseSort(raw: unknown): SearchSort {
  if (
    raw === "price" ||
    raw === "rating" ||
    raw === "availability" ||
    raw === "recommended" ||
    raw === "match" ||
    raw === "urgency" ||
    raw === "best"
  ) {
    return raw;
  }
  return "distance";
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
    agesKnown: d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0,
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
  const km = typeof d.distanceKm === "number" ? d.distanceKm : distanceKm(origin, { lat: d.lat, lng: d.lng });
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
    agesKnown: Boolean(claimed.agesKnown) || Boolean(card.agesKnown),
    hours: claimed.hours || card.hours,
    hoursFr: claimed.hoursFr || card.hoursFr,
    licenseNumber: claimed.licenseNumber || card.licenseNumber,
  });
  const trusted = applyLocalRegistryTrust(next);
  return { ...trusted, spotsTotal: spotsTotal(trusted), fromPrice: fromPrice(trusted) } as T;
}

function mapReviews(
  reviews: Array<Review & { daycare_id: string; body_fr: string; created_at: string }>,
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
  const origin = { lat: data.lat, lng: data.lng };
  const lock = resolveLocationLock({
    lat: origin.lat,
    lng: origin.lng,
    label: data.label,
    q: data.q,
  });
  const listings = await mergeApprovedCityListings([], {
    origin,
    radiusKm: data.radiusKm,
    lock,
    label: data.label || data.q,
  });
  const listed = publicListings(uniqueById(listings.map((row) => toCard(row, origin, data.fsa))));
  return withProvincial(listed).then((rows) => rows.map(slimCard));
}

function unionLiveCards(primary: DaycareCard[], live: DaycareCard[]): DaycareCard[] {
  const seen = new Set(primary.map((card) => card.id));
  const missing = live.filter((card) => card.id && !seen.has(card.id));
  return missing.length ? [...missing, ...primary] : primary;
}

async function searchIncludingLive(data: SearchInput): Promise<DaycareCard[]> {
  const decision = resolveSearchDirectory({ q: data.q, city: data.city });
  if (decision.kind === "unknown") return [];
  const hub = decision.kind === "hub" ? cityHubDefBySlug(decision.slug) : null;
  const searched = alignedSearchInput(
    hub
      ? { ...data, q: data.q || cityHubMapSearchQuery(hub), directorySlug: hub.slug }
      : data,
  );
  if (hub) return runSearch({ ...searched, directorySlug: hub.slug });
  const livePromise = liveCardsForSearch(searched);
  const full = await withTimeoutFallback(runSearch(searched), LOADER_SETTLE_MS, null);
  const live = await withTimeoutFallback(livePromise, full && full.length > 0 ? 800 : 2500, []);
  const facility = data.facility;
  if (!full || full.length === 0) {
    const liveOnly = uniqueById(live);
    return facility ? liveOnly.filter((card) => matchesListedDaycareType(card, facility)) : liveOnly;
  }
  const rows = unionLiveCards(full, live);
  return facility ? rows.filter((card) => matchesListedDaycareType(card, facility)) : rows;
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

/** Exact city + province rows, even when the stored pin is outside the radius. */
async function withNamedCityListings(
  rows: NearbyListing[],
  lock: ReturnType<typeof resolveLocationLock>,
): Promise<NearbyListing[]> {
  if (!lock?.city || !lock.province) return rows;
  const key = normalizeCityKey(lock.city);
  if (!key) return rows;
  if (rows.some((row) => normalizeCityKey(row.city) === key)) return rows;
  const neon = await queryNeonCityHubListings(lock.province, [key]);
  const extra =
    neon && neon.length > 0 ? neon : await catalogNamedCityFromJson(lock.city, lock.province);
  if (!extra.length) return rows;
  return uniqueById([...rows, ...extra]);
}

async function runSearch(data: SearchInput): Promise<DaycareCard[]> {
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
  const nearby = directory
    ? await listingsForCityHub(directory.slug)
    : await mergeApprovedCityListings(
        filterByLocationLock(
          anchors.intersect && anchors.secondary
            ? await nearbyListingsDual(anchors.primary, anchors.secondary, data.radiusKm)
            : await nearbyListings(origin, data.radiusKm, data.facility ? CITY_TYPE_LIST_CAP : 400),
          lock,
        ),
        { origin, radiusKm: data.radiusKm, lock, label: data.label || data.q },
      );
  const listings = directory ? nearby : await withNamedCityListings(nearby, lock);
  let cards: DaycareCard[] = [];
  for (const d of listings) {
    cards.push(toCard(d, origin, data.fsa));
  }
  cards = filterByLocationLock(cards, lock);
  cards = await mergePinnedCentres(cards, lock, origin, data.fsa);
  cards = await overlayClaimed(cards, mergeClaimedCard);
  cards = await overlayParentReviews(cards);
  cards = await overlayQuality(cards);
  const rankPrefs = {
    ageGroup: data.ageGroup,
    radiusKm: data.radiusKm,
    distanceKnown: true,
    startDate: data.startDate || null,
  };
  cards = await overlayParentRank(cards, rankPrefs);
  cards = await overlayPriority(cards);
  cards = await overlayFeaturedCity(cards);
  if (data.ageGroup !== "any") {
    cards = cards.filter((c) => {
      if (listingAgeUnknown(c)) return true;
      if (data.ageGroup === "infant") return c.ageMinMonths <= 18;
      if (data.ageGroup === "toddler") return c.ageMinMonths < 36 && c.ageMaxMonths >= 18;
      return c.ageMaxMonths >= 30 && c.ageMinMonths < 72;
    });
  }
  const useBest = data.sort === "best";
  const matchQuery = smartQuery(data);
  if (useBest) {
    cards.sort((a, b) => compareSmartMatchOrNearest(a, b, matchQuery));
  } else {
    cards.sort((a, b) =>
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
        return compareProximity(left, right);
      }),
    );
  }
  const facility = data.facility;
  const listed = publicListings(uniqueById(filterByLocationLock(cards, lock)))
    .filter((card) => (facility ? matchesListedDaycareType(card, facility) : true))
    .filter((card) => (directory ? listingBelongsToHub(card, directory) : true));
  if (data.countDemand) {
    await recordRankingSearch({
      city: data.city || data.label || data.q,
      ageGroup: data.rankAge || data.ageGroup,
    });
  }
  const stamped = await withProvincial(listed);
  return stamped.map((card) => {
    const slim = slimCard(card);
    if (!useBest) return slim;
    return { ...slim, smartMatchWhy: whyForListing(card, matchQuery) };
  });
}

function normalizeSearchInput(input: SearchInput): SearchInput {
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
    facility: listedDaycareTypeFromSearch(
      input.facility === "before_after" ? { cat: "before-after" } : { fac: input.facility },
    ),
  };
}

export const searchDaycares = createServerFn({ method: "GET" })
  .validator((input: SearchInput) => normalizeSearchInput(input))
  .handler(async ({ data }) => rememberSearch(searchMemoKey(data), () => searchIncludingLive(data)));

/** Same ranking as searchDaycares, then one page of 96 cards. */
export const searchDaycarePage = createServerFn({ method: "GET" })
  .validator((input: SearchInput & { page?: unknown }) => {
    const page = pageFromSearch({ page: input.page });
    return { ...normalizeSearchInput(input), page };
  })
  .handler(async ({ data }) => {
    const { page, ...query } = data;
    const all = await rememberSearch(searchMemoKey(query), () => searchIncludingLive(query));
    return sliceSearchPage(all, page);
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
  pinned.sort(compareProximity);
  const merged = await overlayQuality(await overlayParentReviews(await overlayClaimed(pinned, mergeClaimedCard)));
  const scored = await overlayParentRank(merged, { distanceKnown: true, radiusKm: radius, ageGroup: "any" });
  const ranked = sortFeaturedCityAfterPriority(
    await overlayFeaturedCity(await overlayPriority(scored)),
  );
  return withProvincial(publicListings(uniqueById(filterByLocationLock(ranked, lock))).slice(0, HOME_TYPE_POOL)).then((rows) => rows.map(slimCard));
}

export const featuredDaycares = createServerFn({ method: "GET" })
  .validator((input: { lat: number; lng: number; label?: string; radiusKm?: number }) => ({
    ...input,
    radiusKm: clampRadiusKm(Number(input.radiusKm) || 25),
  }))
  .handler(async ({ data }) => {
    const radiusKm = data.radiusKm;
    const aligned = alignSearchOrigin({
      lat: data.lat,
      lng: data.lng,
      radiusKm,
      q: data.label,
      label: data.label,
    });
    const origin = { lat: aligned.lat, lng: aligned.lng, label: aligned.label || data.label };
    const full = await withTimeoutFallback(loadFeatured(origin, radiusKm), LOADER_SETTLE_MS, null);
    if (full && full.length > 0) return full;
    return liveCardsForSearch({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm,
      sort: "distance",
      ageGroup: "any",
      label: origin.label,
      q: origin.label,
    });
  });

export const getDaycare = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const found = await catalogBySlugGet(slug);
    if (!found) return null;
    if (hideListingFromPublicPage(found, await callerIsAdmin())) return null;
    const origin = { lat: found.lat, lng: found.lng };
    const nearby = uniqueById(
      (await catalogNear(origin, 15))
        .filter((d) => d.id !== found.id)
        .map((d) => toCard(d, origin)),
    ).slice(0, 4);
    const metroPeers = uniqueById(
      (await catalogNear(origin, 40))
        .filter((d) => d.id !== found.id)
        .map((d) => toCard(d, origin)),
    );
    const catalogDaycare = toDaycare(found);
    const catalogScored = await overlayQuality([catalogDaycare, ...metroPeers]);
    const catalogPayload = {
      daycare: withInboxReady(catalogScored[0] ?? catalogDaycare),
      reviews: [] as Review[],
      availability: catalogAvailability(found),
      nearby: withQualityCards(nearby, catalogScored),
      jobs: [] as CentreJobPost[],
    };
    try {
      const sql = await Promise.race([getSql(), rejectAfter(6000, "listing-sql-timeout")]);
      await upsertDaycare(sql, found);
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
      const reviews = await sql<Review & { daycare_id: string; body_fr: string; created_at: string; status?: string }>`
        select id, daycare_id, author, rating, body, body_fr, created_at, status
        from reviews
        where daycare_id = ${daycare.id}
          and status in ('published', 'approved')
          and coalesce(user_id, '') <> ''
        order by created_at desc
        limit 20
      `.catch(() => [] as Array<Review & { daycare_id: string; body_fr: string; created_at: string; status?: string }>);
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
      const mainStamped = await withProvincial([overlayed[0] ?? daycare]);
      const nearbyStamped = await withProvincial(withQualityCards(nearby, overlayed));
      return {
        daycare: withInboxReady(mainStamped[0] ?? daycare),
        reviews: mapReviews(reviews),
        availability,
        nearby: nearbyStamped,
        jobs,
      };
    } catch {
      return catalogPayload;
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
    if (hideListingFromPublicPage(found, await callerIsAdmin())) return null;
    return {
      slug: found.slug,
      name: found.name,
      nameFr: found.nameFr,
      city: found.city,
      province: found.province,
      address: found.address,
      postalCode: found.postalCode,
      phone: found.phone || null,
      agesKnown: found.ageMaxMonths > found.ageMinMonths && found.ageMaxMonths > 0,
      ageMinMonths: found.ageMinMonths,
      ageMaxMonths: found.ageMaxMonths,
      photos: found.photos,
      amenities: found.amenities,
      feeProgram: found.feeProgram || null,
      description: found.description || "",
      descriptionFr: found.descriptionFr || "",
      hours: found.hours || "",
      hoursFr: found.hoursFr || "",
    };
  });

export const getDaycaresByIds = createServerFn({ method: "GET" })
  .validator((ids: string[]) => ids)
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
    return overlayParentRank(claimed, { distanceKnown: false, ageGroup: "any" });
  });
