import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { haversineKm } from "@/lib/geo";
import { CATALOG, catalogBySlug, catalogById, catalogMonths, type CatalogDaycare } from "@/lib/catalog";
import { upsertDaycare } from "./seed";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { overlayClaimed } from "./claims";
import { overlayPriority, sortPriorityFirst } from "./promos";
import { isPlatformLive } from "@/lib/live";
import type { AgeGroup, AvailabilityRow, Daycare, DaycareCard, Review } from "@/lib/types";

type SearchInput = {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: "distance" | "price" | "rating" | "availability";
  ageGroup: "any" | AgeGroup;
};

function toDaycare(d: CatalogDaycare): Daycare {
  return {
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
    googlePlaceId: d.googlePlaceId,
    licenseNumber: d.licenseNumber,
    languages: d.languages,
    amenities: d.amenities,
    photos: d.photos,
    verified: true,
    claimed: false,
    live: isPlatformLive(d.id, false),
    contactEmail: null,
    feeConfirmed: false,
    availabilityKnown: false,
    spotsUpdatedAt: null,
    licenseStatus: "active",
    priority: false,
    priorityUntil: null,
    agesKnown: false,
  };
}

function toCard(d: CatalogDaycare, origin: { lat: number; lng: number }): DaycareCard {
  const daycare = toDaycare(d);
  return {
    ...daycare,
    distanceKm: Math.round(haversineKm(origin, { lat: d.lat, lng: d.lng }) * 10) / 10,
    spotsTotal: spotsTotal(daycare),
    fromPrice: fromPrice(daycare),
  };
}

export const searchDaycares = createServerFn({ method: "POST" })
  .validator((input: SearchInput) => input)
  .handler(async ({ data }) => {
    const origin = { lat: data.lat, lng: data.lng };
    let cards: DaycareCard[] = [];
    for (const d of CATALOG) {
      const km = haversineKm(origin, { lat: d.lat, lng: d.lng });
      if (km > data.radiusKm) continue;
      cards.push(toCard(d, origin));
    }
    cards = await overlayClaimed(cards, (card, claimed) => {
      const next = {
        ...card,
        ...claimed,
        claimed: true,
        live: true,
        feeConfirmed: true,
        availabilityKnown: true,
        ratingX10: claimed.ratingX10 || card.ratingX10,
        reviewCount: claimed.reviewCount || card.reviewCount,
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
        agesKnown: Boolean(claimed.agesKnown),
      };
      return { ...next, spotsTotal: spotsTotal(next), fromPrice: fromPrice(next) };
    });
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
      if (data.sort === "price") return (a.fromPrice || 9e6) - (b.fromPrice || 9e6);
      if (data.sort === "rating") return b.ratingX10 - a.ratingX10;
      if (data.sort === "availability") return b.spotsTotal - a.spotsTotal || a.distanceKm - b.distanceKm;
      return a.distanceKm - b.distanceKm;
    });
    return cards.slice(0, 80);
  });

export const featuredDaycares = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => input)
  .handler(async ({ data }) => {
    const origin = { lat: data.lat, lng: data.lng };
    const nearby: DaycareCard[] = [];
    for (const d of CATALOG) {
      const km = haversineKm(origin, { lat: d.lat, lng: d.lng });
      if (km > 40) continue;
      const card = toCard(d, origin);
      nearby.push(card);
    }
    nearby.sort((a, b) => a.distanceKm - b.distanceKm);
    const merged = await overlayClaimed(nearby, (card, claimed) => {
      const next = {
        ...card,
        ...claimed,
        claimed: true,
        live: true,
        feeConfirmed: true,
        availabilityKnown: true,
        ratingX10: claimed.ratingX10 || card.ratingX10,
        reviewCount: claimed.reviewCount || card.reviewCount,
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
        agesKnown: Boolean(claimed.agesKnown),
      };
      return { ...next, spotsTotal: spotsTotal(next), fromPrice: fromPrice(next) };
    });
    const ranked = sortPriorityFirst(await overlayPriority(merged));
    return ranked.slice(0, 6);
  });

export const getDaycare = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const found = catalogBySlug.get(slug);
    if (!found) return null;
    const sql = await getSql();
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
    const reviews = await sql<Review & { daycare_id: string; body_fr: string; created_at: string }>`
      select id, daycare_id, author, rating, body, body_fr, created_at
      from reviews where daycare_id = ${daycare.id} order by created_at desc
    `;
    let availability = await sql<AvailabilityRow>`
      select month, infant, toddler, preschool from availability
      where daycare_id = ${daycare.id} order by month
    `;
    if (availability.length === 0) {
      availability = catalogMonths().map((month) => ({
        month,
        infant: found.spotsInfant,
        toddler: found.spotsToddler,
        preschool: found.spotsPreschool,
      }));
    }
    const day = new Date().toISOString().slice(0, 10);
    await sql`
      insert into daycare_views (daycare_id, viewed_on, count)
      values (${daycare.id}, ${day}, 1)
      on conflict (daycare_id, viewed_on)
      do update set count = daycare_views.count + 1
    `;
    const nearby = CATALOG.filter((d) => d.id !== found.id && d.city === found.city)
      .slice(0, 4)
      .map((d) => toCard(d, { lat: found.lat, lng: found.lng }));
    return {
      daycare,
      reviews: reviews.map((r) => ({
        id: r.id,
        daycareId: r.daycare_id,
        author: r.author,
        rating: r.rating,
        body: r.body,
        bodyFr: r.body_fr,
        createdAt: String(r.created_at),
      })),
      availability,
      nearby,
    };
  });

export const getDaycaresByIds = createServerFn({ method: "POST" })
  .validator((ids: string[]) => ids)
  .handler(async ({ data: ids }) => {
    const origin = { lat: 49.8951, lng: -97.1384 };
    const cards = ids
      .map((id) => catalogById.get(id))
      .filter((d): d is CatalogDaycare => Boolean(d))
      .map((d) => toCard(d, origin));
    return overlayClaimed(cards, (card, claimed) => {
      const next = {
        ...card,
        ...claimed,
        claimed: true,
        live: true,
        feeConfirmed: true,
        availabilityKnown: true,
        distanceKm: card.distanceKm,
        spotsInfant: claimed.spotsInfant,
        spotsToddler: claimed.spotsToddler,
        spotsPreschool: claimed.spotsPreschool,
        infantMonthly: claimed.infantMonthly,
        toddlerMonthly: claimed.toddlerMonthly,
        preschoolMonthly: claimed.preschoolMonthly,
        partTimeMonthly: claimed.partTimeMonthly,
      };
      return { ...next, spotsTotal: spotsTotal(next), fromPrice: fromPrice(next) };
    });
  });
