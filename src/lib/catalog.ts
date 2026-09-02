import { nextMonths } from "./utils";
import realStorefrontsJson from "./data/real-storefronts.json";
import wpgStorefrontsJson from "./data/storefronts.json";
import { bboxFromRadius, clampRadiusKm, distanceKm, inBbox } from "./proximity";

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

function hydrate(raw: RawCentre, _index: number): CatalogDaycare {
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
const EXTRA_FILES = [
  "centres-extra-1.json",
  "centres-extra-2.json",
  "centres-extra-3.json",
  "centres-extra-4.json",
  "centres-extra-5.json",
];
const EXTRA_BASE =
  "https://raw.githubusercontent.com/klernout-hash/kidease/main/src/lib/data/";

let cachedCatalog: CatalogDaycare[] | null = null;
let catalogBySlugMap = new Map<string, CatalogDaycare>();
let catalogByIdMap = new Map<string, CatalogDaycare>();
let catalogGrid: Map<string, CatalogDaycare[]> | null = null;

/** ~28 km cells. Search only walks cells that intersect the 100 km cap. */
const GRID_DEG = 0.25;

function gridKey(lat: number, lng: number) {
  return `${Math.floor(lat / GRID_DEG)}_${Math.floor(lng / GRID_DEG)}`;
}

function buildCatalogGrid(rows: CatalogDaycare[]) {
  const grid = new Map<string, CatalogDaycare[]>();
  for (const d of rows) {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
    const key = gridKey(d.lat, d.lng);
    const bucket = grid.get(key);
    if (bucket) bucket.push(d);
    else grid.set(key, [d]);
  }
  catalogGrid = grid;
}

async function readLocalJson(rel: string): Promise<unknown | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(new URL(rel, import.meta.url));
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function loadRawCentres(): Promise<RawCentre[]> {
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
  const seen = new Set(main.map((row) => row.id));
  const merged = [...main];
  for (const row of extra) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export async function getCatalog(): Promise<CatalogDaycare[]> {
  if (cachedCatalog) return cachedCatalog;
  const raw = await loadRawCentres();
  cachedCatalog = raw.map(hydrate);
  catalogBySlugMap = new Map(cachedCatalog.map((d) => [d.slug, d]));
  catalogByIdMap = new Map(cachedCatalog.map((d) => [d.id, d]));
  buildCatalogGrid(cachedCatalog);
  return cachedCatalog;
}

/** Only centres inside `radiusKm`, hard-capped at 100 km. Does not scan Canada. */
export async function catalogNear(origin: { lat: number; lng: number }, radiusKm: number) {
  await getCatalog();
  if (!catalogGrid) return [];
  const radius = clampRadiusKm(radiusKm);
  const box = bboxFromRadius(origin, radius);
  const minI = Math.floor(box.minLat / GRID_DEG);
  const maxI = Math.floor(box.maxLat / GRID_DEG);
  const minJ = Math.floor(box.minLng / GRID_DEG);
  const maxJ = Math.floor(box.maxLng / GRID_DEG);
  const out: CatalogDaycare[] = [];
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const bucket = catalogGrid.get(`${i}_${j}`);
      if (!bucket) continue;
      for (const d of bucket) {
        const point = { lat: d.lat, lng: d.lng };
        if (!inBbox(point, box)) continue;
        if (distanceKm(origin, point) > radius) continue;
        out.push(d);
      }
    }
  }
  return out;
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
