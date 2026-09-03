import { nextMonths } from "./utils";
import realStorefrontsJson from "./data/real-storefronts.json";
import wpgStorefrontsJson from "./data/storefronts.json";
import operatorFactsJson from "./data/operator-facts.json";
import { listingPhotosFor } from "./listing-photo";
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
  feeConfirmed?: boolean;
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

type OperatorFactsFile = {
  byLicence?: Record<string, OperatorFact>;
};

const FACTS: Record<string, OperatorFact> =
  (operatorFactsJson as OperatorFactsFile).byLicence ?? {};

/** Match operator-facts keys to a centre via licence # or id tail (0005238 / 5238 / on-0005238). */
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

function operatorFactFor(raw: RawCentre): OperatorFact | undefined {
  for (const key of factLookupKeys(raw)) {
    const fact = FACTS[key];
    if (fact) return fact;
  }
  return undefined;
}

/* photos-v4: never use Street View. Official operator photos live in real-storefronts.json. */
const BUILDINGS = realStorefrontsJson as Record<string, string>;
const WPG = wpgStorefrontsJson as Record<string, string>;

function listingPhotos(raw: RawCentre): string[] {
  return listingPhotosFor(raw.id, raw.photos, BUILDINGS, WPG);
}

function inferAges(min?: number, max?: number) {
  if (typeof min === "number" && typeof max === "number" && max > min) {
    return { min, max, known: true };
  }
  return { min: 0, max: 0, known: false };
}

function hydrate(raw: RawCentre): CatalogDaycare {
  const fact = operatorFactFor(raw);
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
  const ages = inferAges(fact?.ageMinMonths ?? raw.ageMinMonths, fact?.ageMaxMonths ?? raw.ageMaxMonths);
  const feeOk = Boolean(fact?.feeConfirmed);
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
    photos: listingPhotos(raw),
    reviews: raw.reviews ?? [],
    googlePlaceId: raw.googlePlaceId ?? null,
    feeConfirmed: feeOk,
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
  "centres-extra-6.json",
  "centres-extra-7.json",
  "centres-extra-8.json",
  "centres-extra-9.json",
  "centres-extra-10.json",
];
const EXTRA_BASE =
  "https://raw.githubusercontent.com/klernout-hash/kidease/main/src/lib/data/";

let rawCentres: RawCentre[] | null = null;
let rawBySlug = new Map<string, RawCentre>();
let rawById = new Map<string, RawCentre>();
let rawGrid: Map<string, RawCentre[]> | null = null;
let cachedCatalog: CatalogDaycare[] | null = null;
let catalogBySlugMap = new Map<string, CatalogDaycare>();
let catalogByIdMap = new Map<string, CatalogDaycare>();

/** ~28 km cells. Search only walks cells that intersect the 50 km cap. */
const GRID_DEG = 0.25;

function gridKey(lat: number, lng: number) {
  return `${Math.floor(lat / GRID_DEG)}_${Math.floor(lng / GRID_DEG)}`;
}

function buildRawGrid(rows: RawCentre[]) {
  const grid = new Map<string, RawCentre[]>();
  for (const d of rows) {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
    const key = gridKey(d.lat, d.lng);
    const bucket = grid.get(key);
    if (bucket) bucket.push(d);
    else grid.set(key, [d]);
  }
  rawGrid = grid;
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

async function ensureRaw() {
  if (rawCentres) return rawCentres;
  rawCentres = await loadRawCentres();
  rawBySlug = new Map(rawCentres.map((d) => [d.slug, d]));
  rawById = new Map(rawCentres.map((d) => [d.id, d]));
  buildRawGrid(rawCentres);
  return rawCentres;
}

export async function getCatalog(): Promise<CatalogDaycare[]> {
  if (cachedCatalog) return cachedCatalog;
  const raw = await ensureRaw();
  cachedCatalog = raw.map(hydrate);
  catalogBySlugMap = new Map(cachedCatalog.map((d) => [d.slug, d]));
  catalogByIdMap = new Map(cachedCatalog.map((d) => [d.id, d]));
  return cachedCatalog;
}

/** Only centres inside `radiusKm`, hard-capped at 50 km. Hydrates matches only. */
export async function catalogNear(origin: { lat: number; lng: number }, radiusKm: number) {
  await ensureRaw();
  if (!rawGrid) return [];
  const radius = clampRadiusKm(radiusKm);
  const box = bboxFromRadius(origin, radius);
  const minI = Math.floor(box.minLat / GRID_DEG);
  const maxI = Math.floor(box.maxLat / GRID_DEG);
  const minJ = Math.floor(box.minLng / GRID_DEG);
  const maxJ = Math.floor(box.maxLng / GRID_DEG);
  const out: CatalogDaycare[] = [];
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const bucket = rawGrid.get(`${i}_${j}`);
      if (!bucket) continue;
      for (const d of bucket) {
        const point = { lat: d.lat, lng: d.lng };
        if (!inBbox(point, box)) continue;
        if (distanceKm(origin, point) > radius) continue;
        out.push(hydrate(d));
      }
    }
  }
  return out;
}

export async function catalogBySlugGet(slug: string) {
  if (catalogBySlugMap.has(slug)) return catalogBySlugMap.get(slug);
  await ensureRaw();
  const raw = rawBySlug.get(slug);
  return raw ? hydrate(raw) : undefined;
}

export async function catalogByIdGet(id: string) {
  if (catalogByIdMap.has(id)) return catalogByIdMap.get(id);
  await ensureRaw();
  const raw = rawById.get(id);
  return raw ? hydrate(raw) : undefined;
}

export function catalogMonths() {
  return nextMonths(6);
}

export { amenityLabel } from "./amenities";
