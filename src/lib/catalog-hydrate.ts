/**
 * JSON catalogue hydrate + disk loader.
 * Safe to import from Node (`--experimental-strip-types`) via .ts specifiers.
 * Photo maps stay listingPhotosFor(real-storefronts / storefronts).
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { listingPhotosFor } from "./listing-photo.ts";
import {
  isAdminOnlyListing,
  listingVisibilityOf,
  type ListingVisibility,
} from "./listing-visibility.ts";
import { correctCentreNameTypos, normalizeListingSlug } from "./listing-slug.ts";
import {
  classifyFacilityType,
  facilityTypeTagline,
  isGenericCentreTagline,
} from "./facility-type.ts";

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
  licenseStatus?: "unverified" | "matched" | "expired" | "suspended";
  registryMatchState?: "unmatched" | "pending" | "matched" | "mismatch";
  licenseVerificationSource?: string | null;
  languages: string;
  amenities: string;
  photos: string[];
  reviews: Array<{ author: string; rating: number; body: string; bodyFr: string }>;
  googlePlaceId: string | null;
  feeConfirmed?: boolean;
  /** From Neon claimed_at. JSON catalogue rows stay unclaimed — never invented. */
  claimed?: boolean;
  claimedAt?: string | null;
  claimStatus?: string | null;
  listingActive?: boolean;
  visibility: ListingVisibility;
  isTest: boolean;
  contactEmail?: string;
  website?: string;
};

export type RawCentre = {
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
  visibility?: string;
  isTest?: boolean;
  contactEmail?: string;
  email?: string;
  website?: string;
};

type OperatorFact = {
  name?: string;
  ageMinMonths?: number;
  ageMaxMonths?: number;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  hours?: string;
  phone?: string;
  feeConfirmed?: boolean;
};

export const EXTRA_FILES = [
  "centres-extra-1.json",
  "centres-extra-2.json",
  "centres-extra-3.json",
  "centres-extra-4.json",
  "centres-extra-5.json",
  "centres-extra-6.json",
  "centres-extra-7.json",
  "centres-extra-8.json",
  "centres-extra-9.json",
  "centres-extra-10.json",
];

const CATALOG_URL =
  "https://raw.githubusercontent.com/klernout-hash/kidease/main/src/lib/data/centres.json";
const EXTRA_BASE = "https://raw.githubusercontent.com/klernout-hash/kidease/main/src/lib/data/";

async function readLocalJson(rel: string): Promise<unknown | null> {
  try {
    const path = fileURLToPath(new URL(rel, import.meta.url));
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

let facts: Record<string, OperatorFact> | null = null;
let buildings: Record<string, string> | null = null;
let wpg: Record<string, string> | null = null;

async function maps() {
  if (!facts) {
    const raw = (await readLocalJson("./data/operator-facts.json")) as { byLicence?: Record<string, OperatorFact> } | null;
    facts = raw?.byLicence ?? {};
  }
  if (!buildings) {
    buildings = ((await readLocalJson("./data/real-storefronts.json")) as Record<string, string> | null) ?? {};
  }
  if (!wpg) {
    wpg = ((await readLocalJson("./data/storefronts.json")) as Record<string, string> | null) ?? {};
  }
  return { facts, buildings, wpg };
}

function factLookupKeys(raw: RawCentre): string[] {
  const keys = new Set<string>();
  const add = (value?: string | null) => {
    const n = (value || "").trim();
    if (!n) return;
    keys.add(n);
    const stripped = n.replace(/^0+/, "") || n;
    keys.add(stripped);
    if (/^\d+$/.test(n) && n.length < 7) keys.add(n.padStart(7, "0"));
    if (/^\d+$/.test(stripped) && stripped.length < 7) keys.add(stripped.padStart(7, "0"));
  };
  add(raw.licenseNumber);
  add((raw.id || "").split("-").pop());
  return [...keys];
}

function inferAges(min?: number, max?: number) {
  if (typeof min === "number" && typeof max === "number" && max > min) {
    return { min, max, known: true };
  }
  return { min: 0, max: 0, known: false };
}

export function hydrateCentre(
  raw: RawCentre,
  input: {
    facts: Record<string, OperatorFact>;
    buildings: Record<string, string>;
    wpg: Record<string, string>;
  },
): CatalogDaycare {
  let fact: OperatorFact | undefined;
  for (const key of factLookupKeys(raw)) {
    const hit = input.facts[key];
    if (hit) {
      fact = hit;
      break;
    }
  }
  const city = raw.city || "";
  const province = raw.province || "";
  const name = correctCentreNameTypos(raw.name);
  const nameFr = correctCentreNameTypos(raw.nameFr || name);
  const slug = normalizeListingSlug(raw.slug) || raw.slug;
  const amenities = raw.amenities?.includes("licensed") ? raw.amenities : `licensed${raw.amenities ? `,${raw.amenities}` : ""}`;
  const facility = classifyFacilityType({ amenities, name });
  const tag =
    raw.tagline && !isGenericCentreTagline(raw.tagline, city, province)
      ? raw.tagline
      : facilityTypeTagline(facility.type, city, province, "en");
  const tagFr =
    raw.taglineFr && !isGenericCentreTagline(raw.taglineFr, city, province)
      ? raw.taglineFr
      : facilityTypeTagline(facility.type, city, province, "fr");
  const address = raw.address || "";
  const postal = raw.postalCode || "";
  const kindEn =
    facility.type === "nursery" ? "licensed nursery" : facility.type === "home" ? "licensed home" : "licensed childcare centre";
  const kindFr =
    facility.type === "nursery"
      ? "nursery permise"
      : facility.type === "home"
        ? "milieu familial permis"
        : "centre de garde permis";
  const desc =
    raw.description ||
    `${name} is a ${kindEn}${address ? ` at ${address}` : ""}${city ? `, ${city}` : ""} ${postal} (${province}). Hours and spaces follow the provincial or territorial registry.`.trim();
  const descFr =
    raw.descriptionFr ||
    `${nameFr} est un ${kindFr}${address ? ` au ${address}` : ""}${city ? `, ${city}` : ""} ${postal} (${province}). Heures et places selon le registre provincial.`.trim();
  const ages = inferAges(fact?.ageMinMonths ?? raw.ageMinMonths, fact?.ageMaxMonths ?? raw.ageMaxMonths);
  const feeOk = Boolean(fact?.feeConfirmed);
  return {
    id: raw.id,
    slug,
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
    phone: fact?.phone || raw.phone || "",
    hours: fact?.hours || raw.hours || "",
    hoursFr: raw.hoursFr || "",
    ageMinMonths: ages.min,
    ageMaxMonths: ages.max,
    infantMonthly: feeOk ? fact?.infantMonthly ?? null : null,
    toddlerMonthly: feeOk ? fact?.toddlerMonthly ?? null : null,
    preschoolMonthly: feeOk ? fact?.preschoolMonthly ?? null : null,
    partTimeMonthly: feeOk ? fact?.partTimeMonthly ?? null : null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    waitlist: 0,
    ratingX10: raw.googlePlaceId ? raw.ratingX10 ?? 0 : 0,
    reviewCount: raw.googlePlaceId ? (raw.reviews?.length ?? 0) : 0,
    licenseNumber: raw.licenseNumber || raw.id,
    languages: raw.languages || (province === "QC" ? "fr" : "en"),
    amenities,
    photos: listingPhotosFor(raw.id, raw.photos, input.buildings, input.wpg),
    reviews: raw.reviews ?? [],
    googlePlaceId: raw.googlePlaceId ?? null,
    feeConfirmed: feeOk,
    visibility: listingVisibilityOf(raw),
    isTest: Boolean(raw.isTest) || isAdminOnlyListing(raw),
    contactEmail: raw.contactEmail || raw.email || "",
    website: raw.website || "",
  };
}

export function mergeRawCentres(main: RawCentre[], extra: RawCentre[]) {
  const seen = new Set(main.map((row) => row.id));
  const merged = [...main];
  for (const row of extra) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export async function loadRawCentresFromDisk(): Promise<RawCentre[]> {
  let main = (await readLocalJson("./data/centres.json")) as RawCentre[] | null;
  if (!main) {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`Catalogue unavailable (${res.status})`);
    main = (await res.json()) as RawCentre[];
  }
  const extra: RawCentre[] = [];
  for (const file of EXTRA_FILES) {
    let part = (await readLocalJson(`./data/${file}`)) as RawCentre[] | null;
    if (!part) {
      try {
        const res = await fetch(EXTRA_BASE + file);
        part = res.ok ? ((await res.json()) as RawCentre[]) : [];
      } catch {
        part = [];
      }
    }
    extra.push(...(part ?? []));
  }
  return mergeRawCentres(main, extra);
}

export async function loadJsonCatalogFromDisk(): Promise<CatalogDaycare[]> {
  const [raw, photoMaps] = await Promise.all([loadRawCentresFromDisk(), maps()]);
  return raw.map((row) => hydrateCentre(row, photoMaps));
}

export async function hydrateRaw(raw: RawCentre): Promise<CatalogDaycare> {
  return hydrateCentre(raw, await maps());
}
