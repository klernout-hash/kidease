import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { catchmentMatch, clampRadiusKm, compareProximity, distanceKm, fsaOf } from "@/lib/proximity";
import { getCatalog, catalogBySlugGet, catalogMonths, catalogNear, type CatalogDaycare } from "@/lib/catalog";
import { nearbyListings, type NearbyListing } from "./nearby";
import { upsertDaycare } from "./seed";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { overlayClaimed } from "./claims";
import { overlayPriority, sortPriorityFirst } from "./promos";
import { isPlatformLive } from "@/lib/live";
import { listingThumb } from "@/lib/photo";
import { uniqueById } from "@/lib/utils";
import type { AgeGroup, AvailabilityRow, Daycare, DaycareCard, Review } from "@/lib/types";

type SearchInput = {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: "distance" | "price" | "rating" | "availability";
  ageGroup: "any" | AgeGroup;
  fsa?: string;
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
    feeConfirmed: Boolean(d.feeConfirmed),
    availabilityKnown: false,
    spotsUpdatedAt: null,
    licenseStatus: "active",
    priority: false,
    priorityUntil: null,
    agesKnown: d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0,
  };
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

function slimCard(card: DaycareCard): DaycareCard {
  return {
    ...card,
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    address: "",
    phone: null,
    photos: [listingThumb(card.photos)],
  };
}

export const searchDaycares = createServerFn({ method: "POST" })
  .validator((input: SearchInput) => ({
    ...input,
    radiusKm: clampRadiusKm(Number(input.radiusKm) || 25),
  }))
  .handler(async ({ data }) => {
    const origin = { lat: data.lat, lng: data.lng };
    let cards: DaycareCard[] = [];
    for (const d of await nearbyListings(origin, data.radiusKm)) {
      cards.push(toCard(d, origin, data.fsa));
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
        agesKnown: Boolean(claimed.agesKnown) || Boolean(card.agesKnown),
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
      return compareProximity(a, b);
    });
    return uniqueById(cards).map(slimCard);
  });
