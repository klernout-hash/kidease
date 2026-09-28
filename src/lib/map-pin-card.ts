import { haversineKm } from "./geo.ts";
import type { MapPin } from "./map-cluster.ts";
import type { DaycareCard } from "./types.ts";

/**
 * Popup fields we actually know for a viewport pin.
 * Fees, ages, spots, and photos stay empty until the listing page — nothing is filled in.
 */
export function mapPinToCard(pin: MapPin, origin?: { lat: number; lng: number } | null): DaycareCard {
  const distanceKm =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? Math.round(haversineKm(origin, pin) * 10) / 10
      : Number.NaN;
  return {
    id: pin.id,
    slug: pin.slug,
    name: pin.name,
    nameFr: pin.nameFr,
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    address: pin.address,
    city: pin.city,
    province: pin.province,
    postalCode: pin.postalCode,
    lat: pin.lat,
    lng: pin.lng,
    phone: null,
    hours: "",
    hoursFr: "",
    ageMinMonths: 0,
    ageMaxMonths: 0,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    waitlist: 0,
    ratingX10: 0,
    reviewCount: 0,
    licenseNumber: null,
    languages: "",
    amenities: "",
    photos: [],
    verified: false,
    live: false,
    agesKnown: false,
    listingActive: true,
    distanceKm,
    spotsTotal: 0,
    fromPrice: 0,
  };
}
