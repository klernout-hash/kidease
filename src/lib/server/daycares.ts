import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { catchmentMatch, compareProximity, distanceKm, fsaOf } from "@/lib/proximity";
import { getCatalog, catalogBySlugGet, catalogMonths, catalogNear, type CatalogDaycare } from "@/lib/catalog";
import { upsertDaycare } from "./seed";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { overlayClaimed } from "./claims";
import { overlayPriority, sortPriorityFirst } from "./promos";
import { isPlatformLive } from "@/lib/live";
import { listingThumb } from "@/lib/photo";
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
