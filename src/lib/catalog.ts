import { nextMonths } from "./utils";
import realStorefrontsJson from "./data/real-storefronts.json";
import wpgStorefrontsJson from "./data/storefronts.json";

export type CatalogDaycare = {
  id: string;
  slug: string;
  name: string;
  nameFr: string;
  tagline: string;
  taglineFr: string;
  description: string;
  descriptionFr: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  lat: number;
  lng: number;
  phone: string;
  hours: string;
  hoursFr: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  infantMonthly: number | null;
  toddlerMonthly: number | null;
  preschoolMonthly: number | null;
  partTimeMonthly: number | null;
  spotsInfant: number;
  spotsToddler: number;
  spotsPreschool: number;
  waitlist: number;
  ratingX10: number;
  reviewCount: number;
  licenseNumber: string;
  languages: string;
  amenities: string;
  photos: string[];
  reviews: Array<{ author: string; rating: number; body: string; bodyFr: string }>;
  googlePlaceId: string | null;
};

type RawCentre = {
  id: string;
  slug: string;
  name: string;
  nameFr?: string;
  tagline?: string;
  taglineFr?: string;
  description?: string;
  descriptionFr?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  lat: number;
  lng: number;
  phone?: string;
  hours?: string;
  hoursFr?: string;
  ageMinMonths?: number;
  ageMaxMonths?: number;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  spotsInfant?: number;
  spotsToddler?: number;
  spotsPreschool?: number;
  waitlist?: number;
  ratingX10?: number;
  licenseNumber?: string;
  languages?: string;
  amenities?: string;
  photos?: string[];
  reviews?: CatalogDaycare["reviews"];
  googlePlaceId?: string;
  fee?: number;
};

/* photos-v4: never use Street View */
const PLACEHOLDER = "/photos/storefront-placeholder.jpg";
const BUILDINGS = realStorefrontsJson as Record<string, string>;
const WPG = wpgStorefrontsJson as Record<string, string>;
const BUILDING_ON_DISK = new Set([
  "mb-1150",
  "mb-1252",
  "mb-2169",
  "mb-3096",
  "mb-101384",
  "mb-101850",
  "mb-102137",
]);

function listingPhotos(raw: RawCentre): string[] {
  const logos = (raw.photos ?? []).filter((p) => p.includes("-logo"));
  const building = BUILDING_ON_DISK.has(raw.id) ? BUILDINGS[raw.id] : undefined;
  const storefront = building || WPG[raw.id] || PLACEHOLDER;
  return [storefront, ...logos];
}

function inferAges(raw: RawCentre) {
  if (
    typeof raw.ageMinMonths === "number" &&
    typeof raw.ageMaxMonths === "number" &&
    raw.ageMaxMonths > raw.ageMinMonths
  ) {
    return { min: raw.ageMinMonths, max: raw.ageMaxMonths, known: true };
  }
  return { min: 0, max: 0, known: false };
}

function hydrate(raw: RawCentre, index: number): CatalogDaycare {
  const city = raw.city || "";
  const province = raw.province || "";
  const name = raw.name;
  const nameFr = raw.nameFr || name;
  const amenities = raw.amenities?.includes("licensed") ? raw.amenities : `licensed${raw.amenities ? `,${raw.amenities}` : ""}`;
  const tag =
    raw.tagline ||
    (city ? `Licensed centre in ${city}, ${province}.` : `Licensed centre, ${province}.`);
  const tagFr =
    raw.taglineFr ||
    (city ? `Centre permis à ${city}, ${province}.` : `Centre permis, ${province}.`);
  const address = raw.address || "";
  const postal = raw.postalCode || "";
  const desc =
    raw.description ||
    `${name} is a licensed childcare centre${address ? ` at ${address}` : ""}${city ? `, ${city}` : ""} ${postal} (${province}). Hours and spaces follow the provincial or territorial registry.`.trim();
  const descFr =
    raw.descriptionFr ||
    `${nameFr} est un centre de garde permis${address ? ` au ${address}` : ""}${city ? `, ${city}` : ""} ${postal} (${province}). Heures et places selon le registre provincial.`.trim();
  const ages = inferAges(raw);
  return {
    id: raw.id,
    slug: raw.slug,
    name,
    nameFr,
    tagline: tag,
    taglineFr: tagFr,
    description: desc.slice(0, 480),
    descriptionFr: descFr.slice(0, 480),
    address,
    city,
    province,
    postalCode: postal,
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    phone: raw.phone ?? "",
    hours: raw.hours || "",
    hoursFr: raw.hoursFr || "",
    ageMinMonths: ages.min,
    ageMaxMonths: ages.max,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    waitlist: 0,
    ratingX10: raw.googlePlaceId ? raw.ratingX10 ?? 0 : 0,
    reviewCount: raw.googlePlaceId ? (raw.reviews?.length ?? 0) : 0,
    licenseNumber: raw.licenseNumber || raw.id,
    languages: raw.languages || (province === "QC" ? "fr" : "en"),
    amenities,
    photos: listingPhotos(raw),
    reviews: raw.reviews ?? [],
    googlePlaceId: raw.googlePlaceId ?? null,
  };
}

const CATALOG_URL =
  "https://raw.githubusercontent.com/klernout-hash/kidease/main/src/lib/data/centres.json";

let cachedCatalog: CatalogDaycare[] | null = null;
let catalogBySlugMap = new Map<string, CatalogDaycare>();
let catalogByIdMap = new Map<string, CatalogDaycare>();

async function loadRawCentres(): Promise<RawCentre[]> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(new URL("./data/centres.json", import.meta.url));
    return JSON.parse(await readFile(path, "utf8")) as RawCentre[];
  } catch {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`Catalogue unavailable (${res.status})`);
    return (await res.json()) as RawCentre[];
  }
}

export async function getCatalog(): Promise<CatalogDaycare[]> {
  if (cachedCatalog) return cachedCatalog;
  const raw = await loadRawCentres();
  cachedCatalog = raw.map(hydrate);
  catalogBySlugMap = new Map(cachedCatalog.map((d) => [d.slug, d]));
  catalogByIdMap = new Map(cachedCatalog.map((d) => [d.id, d]));
  return cachedCatalog;
}

export async function catalogBySlugGet(slug: string) {
  await getCatalog();
  return catalogBySlugMap.get(slug);
}

export async function catalogByIdGet(id: string) {
  await getCatalog();
  return catalogByIdMap.get(id);
}

export function catalogMonths() {
  return nextMonths(6);
}

export { amenityLabel } from "./amenities";
