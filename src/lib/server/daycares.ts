import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { catchmentMatch, clampRadiusKm, compareProximity, distanceKm, fsaOf } from "@/lib/proximity";
import { getPublicCatalog, catalogBySlugGet, catalogMonths, catalogNear, type CatalogDaycare } from "@/lib/catalog";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { nearbyListings, type NearbyListing } from "./nearby";
import { callerIsAdmin } from "./public-listing";
import { upsertDaycare } from "./seed";
import { applyListingReadiness, listingQualityScore } from "@/lib/listing-readiness";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { overlayClaimed } from "./claims";
import { overlayParentReviews } from "./reviews";
import { overlayPriority, sortPriorityFirst } from "./promos";
import { parentReviewSummary } from "@/lib/review-gate";
import { isPlatformLive } from "@/lib/live";
import { defaultTrustFields } from "@/lib/trust";
import { listingThumb } from "@/lib/photo";
import { uniqueById } from "@/lib/utils";
import { rememberSearch, searchMemoKey } from "./search-memo";
import type { AgeGroup, AvailabilityRow, Daycare, DaycareCard, Review } from "@/lib/types";

type SearchInput = {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: "distance" | "price" | "rating" | "availability" | "recommended";
  ageGroup: "any" | AgeGroup;
  fsa?: string;
};

function toDaycare(d: CatalogDaycare): Daycare {
  return applyListingReadiness({
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
    hours: d.hours,
    hoursFr: d.hoursFr,
    ageMinMonths: d.ageMinMonths,
    ageMaxMonths: d.ageMaxMonths,
    infantMonthly: d.infantMonthly,
    toddlerMonthly: d.toddlerMonthly,
    preschoolMonthly: d.preschoolMonthly,
    partTimeMonthly: d.partTimeMonthly,
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
    amenities: d.amenities,
    photos: d.photos,
    verified: true,
    claimed: false,
    live: isPlatformLive(d.id, false),
    contactEmail: null,
    feeConfirmed: Boolean(d.feeConfirmed),
    availabilityKnown: false,
    spotsUpdatedAt: null,
    lastVacancyUpdatedAt: null,
    ...defaultTrustFields(),
    licenseVerificationSource: d.licenseNumber ? "catalog" : null,
    priority: false,
    priorityUntil: null,
    agesKnown: d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0,
    visibility: d.visibility,
    isTest: d.isTest,
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
  return { ...next, spotsTotal: spotsTotal(next), fromPrice: fromPrice(next) } as T;
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

function slimCard(card: DaycareCard): DaycareCard {
  return {
    ...card,
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    address: "",
    phone: null,
    hoursFr: "",
    contactEmail: null,
    photos: [listingThumb(card.photos)],
  };
}

async function runSearch(data: SearchInput): Promise<DaycareCard[]> {
  const origin = { lat: data.lat, lng: data.lng };
  let cards: DaycareCard[] = [];
  for (const d of await nearbyListings(origin, data.radiusKm)) {
    cards.push(toCard(d, origin, data.fsa));
  }
  cards = await overlayClaimed(cards, mergeClaimedCard);
  cards = await overlayParentReviews(cards);
  cards = await overlayPriority(cards);
  if (data.ageGroup !== "any") {
    cards = cards.filter((c) => {
      if (!c.agesKnown) return false;
      if (data.ageGroup === "infant") return c.ageMinMonths <= 18;
      if (data.ageGroup === "toddler") return c.ageMinMonths < 36 && c.ageMaxMonths >= 18;
      return c.ageMaxMonths >= 30 && c.ageMinMonths < 72;
    });
  }
  cards.sort((a, b) => {
    if (Boolean(a.priority) !== Boolean(b.priority)) return a.priority ? -1 : 1;
    if (data.sort === "recommended") {
      const delta = listingQualityScore(b) - listingQualityScore(a);
      if (delta !== 0) return delta;
      return a.distanceKm - b.distanceKm;
    }
    if (data.sort === "price") return (a.fromPrice || 9e6) - (b.fromPrice || 9e6);
    if (data.sort === "rating") return b.ratingX10 - a.ratingX10;
    if (data.sort === "availability") return b.spotsTotal - a.spotsTotal || a.distanceKm - b.distanceKm;
    return compareProximity(a, b);
  });
  return uniqueById(cards).map(slimCard);
}

export const searchDaycares = createServerFn({ method: "POST" })
  .validator((input: SearchInput) => ({
    ...input,
    radiusKm: clampRadiusKm(Number(input.radiusKm) || 25),
  }))
  .handler(async ({ data }) => rememberSearch(searchMemoKey(data), () => runSearch(data)));

export const featuredDaycares = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => input)
  .handler(async ({ data }) => {
    const origin = { lat: data.lat, lng: data.lng };
    const nearby: DaycareCard[] = [];
    for (const d of await nearbyListings(origin, 40)) {
      nearby.push(toCard(d, origin));
    }
    nearby.sort(compareProximity);
    const merged = await overlayParentReviews(await overlayClaimed(nearby, mergeClaimedCard));
    const ranked = sortPriorityFirst(await overlayPriority(merged));
    return uniqueById(ranked).slice(0, 12).map(slimCard);
  });

export const getDaycare = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const found = await catalogBySlugGet(slug);
    if (!found) return null;
    if (isAdminOnlyListing(found) && !(await callerIsAdmin())) return null;
    const nearby = uniqueById(
      (await catalogNear({ lat: found.lat, lng: found.lng }, 15))
        .filter((d) => d.id !== found.id)
        .map((d) => toCard(d, { lat: found.lat, lng: found.lng })),
    ).slice(0, 4);
    const catalogDaycare = toDaycare(found);
    catalogDaycare.live = isPlatformLive(catalogDaycare.id, Boolean(catalogDaycare.claimed));
    const catalogPayload = {
      daycare: catalogDaycare,
      reviews: [] as Review[],
      availability: catalogAvailability(found),
      nearby,
    };
    try {
      const sql = await Promise.race([getSql(), rejectAfter(6000, "listing-sql-timeout")]);
      await upsertDaycare(sql, found);
      const claimedRow = await sql<DaycareRow>`
        select * from daycares where id = ${found.id} and claimed_at is not null limit 1
      `.catch(() => [] as DaycareRow[]);
      const daycare = claimedRow[0] ? mapDaycare(claimedRow[0]) : toDaycare(found);
      daycare.live = isPlatformLive(daycare.id, Boolean(daycare.claimed));
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
      return {
        daycare,
        reviews: mapReviews(reviews),
        availability,
        nearby: await overlayParentReviews(nearby),
      };
    } catch {
      return catalogPayload;
    }
  });

export const getDaycaresByIds = createServerFn({ method: "POST" })
  .validator((ids: string[]) => ids)
  .handler(async ({ data: ids }) => {
    const origin = { lat: 49.8951, lng: -97.1384 };
    const catalog = await getPublicCatalog();
    const byId = new Map(catalog.map((d) => [d.id, d]));
    const cards = uniqueById(
      ids
        .map((id) => byId.get(id))
        .filter((d): d is CatalogDaycare => Boolean(d))
        .map((d) => toCard(d, origin)),
    );
    return overlayParentReviews(await overlayClaimed(cards, mergeClaimedCard));
  });
