/**
 * Merge the private Canada licensed-childcare master into the catalogue seed.
 *
 * Existing rows stay. Matched master rows fill blank phone / email / website
 * only. Unmatched Canada rows are appended when a real coordinate can be taken
 * from the catalogue (same postal, FSA, or city) or the built-in city list.
 * Ages, fees, photos, open spots, and Live/claim fields are not invented.
 * Nothing is deleted. Contact values are never logged.
 */

import { createHash } from "node:crypto";
import { parseCsvRecords } from "./catalog-master.ts";
import {
  catalogueAddressKey,
  catalogueLicenceKey,
  catalogueNameKey,
  cataloguePlaceKey,
  cataloguePostalKey,
  decodeImportText,
  formatCataloguePostal,
  splitCityPostalLabel,
} from "./catalog-match.ts";
import { preserveFilledContact, type CatalogUpsertInput } from "./catalog-upsert.ts";
import { isInCanada } from "./canada-origin.ts";
import { facilityTypeTagline, listingFacilityType } from "./facility-type.ts";
import { CITIES, PROVINCES } from "./geo.ts";
import { listingSlugFromName } from "./listing-slug.ts";
import { isAdminOnlyListing } from "./listing-visibility.ts";
import { isSafeSitemapSlug, publicSitemapSlugs } from "./sitemap.ts";

const CANADA = new Set(PROVINCES.map((p) => p.code));

export type CatalogueMatchRow = {
  id: string;
  slug: string;
  name: string;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  licenseNumber?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  address?: string | null;
};

export type MasterSyncSummary = {
  masterRows: number;
  matched: number;
  added: number;
  skippedNoGeo: number;
  skippedNonCanada: number;
  skippedInvalid: number;
  contactsFilled: number;
  catalogueRows: number;
  publicSlugs: number;
};

export type MasterSyncResult<T> = {
  rows: T[];
  summary: MasterSyncSummary;
};

export type MasterFacility = {
  facilityId: string;
  name: string;
  licence: string;
  facilityType: string;
  address: string;
  city: string;
  province: string;
  postal: string;
  phone: string;
  email: string;
  website: string;
  /** Real centre name when `name` is only a city and postal code. */
  facilityName: string;
};

const NAME_ALIASES = new Set([
  "facility_name",
  "centre_name",
  "center_name",
  "site_name",
  "program_name",
  "childcare_name",
  "elcc_name",
]);

const MASTER_FIELDS: Record<string, keyof MasterFacility> = {
  facility_id: "facilityId",
  name: "name",
  licence_number: "licence",
  license_number: "licence",
  facility_type: "facilityType",
  street_address: "address",
  address: "address",
  city: "city",
  province: "province",
  postal_code: "postal",
  postalcode: "postal",
  phone: "phone",
  telephone: "phone",
  email: "email",
  contact_email: "email",
  website: "website",
};

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function fold(value: string | null | undefined) {
  return cataloguePlaceKey(value);
}

function postalKey(value: string | null | undefined) {
  return cataloguePostalKey(value);
}

function licenceKey(value: string | null | undefined) {
  return catalogueLicenceKey(value);
}

function formatPostal(compact: string) {
  return formatCataloguePostal(compact);
}

export function masterListingId(facilityId: string) {
  const hash = createHash("sha256").update(facilityId).digest("hex").slice(0, 12);
  return `mx-${hash}`;
}

function amenitiesFor(facilityType: string) {
  const kind = facilityType.trim().toLowerCase();
  if (kind.includes("agency")) return "licensed";
  if (kind.includes("family")) return "licensed,home";
  if (kind.includes("group")) return "licensed,group-home";
  if (kind.includes("preschool") || kind.includes("nursery")) return "licensed,nursery";
  if (kind.includes("school")) return "licensed,in-school";
  return "licensed";
}

function median(values: number[]) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

type GeoIndex = {
  postal: Map<string, { lat: number[]; lng: number[] }>;
  fsa: Map<string, { lat: number[]; lng: number[] }>;
  city: Map<string, { lat: number[]; lng: number[] }>;
};

function pushGeo(bucket: Map<string, { lat: number[]; lng: number[] }>, key: string, lat: number, lng: number) {
  if (!key) return;
  const hit = bucket.get(key);
  if (hit) {
    hit.lat.push(lat);
    hit.lng.push(lng);
  } else {
    bucket.set(key, { lat: [lat], lng: [lng] });
  }
}

function pointFrom(bucket: Map<string, { lat: number[]; lng: number[] }>, key: string) {
  const hit = bucket.get(key);
  if (!hit || hit.lat.length === 0) return null;
  const lat = median(hit.lat);
  const lng = median(hit.lng);
  if (!isInCanada(lat, lng)) return null;
  return { lat, lng };
}

function locate(row: MasterFacility, geo: GeoIndex) {
  const postal = postalKey(row.postal);
  if (postal.length >= 6) {
    const exact = pointFrom(geo.postal, postal);
    if (exact) return exact;
  }
  if (postal.length >= 3) {
    const fsa = pointFrom(geo.fsa, postal.slice(0, 3));
    if (fsa) return fsa;
  }
  const city = pointFrom(geo.city, `${row.province}|${fold(row.city)}`);
  if (city) return city;
  const wanted = fold(row.city);
  if (!wanted) return null;
  const named = CITIES.find((candidate) => {
    if (candidate.province !== row.province) return false;
    const label = fold(candidate.label.split(",")[0] || "");
    if (label === wanted) return true;
    return candidate.aliases.some((alias) => /^[a-z]{3,}$/i.test(alias) && fold(alias) === wanted);
  });
  if (named && isInCanada(named.lat, named.lng)) return { lat: named.lat, lng: named.lng };
  return null;
}

export function parseMasterFacilities(csvText: string): { rows: MasterFacility[]; invalid: number } {
  const records = parseCsvRecords(csvText);
  if (records.length < 2) return { rows: [], invalid: 0 };
  const headerKeys = records[0].map((cell) => normHeader(cell));
  const headers = headerKeys.map((key) => MASTER_FIELDS[key] ?? null);
  if (!headers.includes("facilityId") && !headers.includes("name") && !headerKeys.some((key) => NAME_ALIASES.has(key))) {
    return { rows: [], invalid: records.length - 1 };
  }
  const seen = new Set<string>();
  const rows: MasterFacility[] = [];
  let invalid = 0;
  for (const cells of records.slice(1)) {
    const row: MasterFacility = {
      facilityId: "",
      name: "",
      licence: "",
      facilityType: "",
      address: "",
      city: "",
      province: "",
      postal: "",
      phone: "",
      email: "",
      website: "",
      facilityName: "",
    };
    headers.forEach((field, i) => {
      const value = decodeImportText((cells[i] || "").replace(/\s+/g, " ").trim());
      if (NAME_ALIASES.has(headerKeys[i]) && value && !row.facilityName) row.facilityName = value;
      if (!field || !value) return;
      row[field] = value;
    });
    row.address = row.address.replace(/^mailing address:\s*/i, "").trim();
    row.province = row.province.toUpperCase();
    const location = splitCityPostalLabel(row.name);
    const alternate = row.facilityName && !splitCityPostalLabel(row.facilityName) ? row.facilityName : "";
    if (location && alternate) {
      row.name = alternate;
      if (!row.city) row.city = location.city;
      if (!row.postal) row.postal = formatPostal(postalKey(location.postal));
      if (!row.province) row.province = location.province;
    } else if (location) {
      invalid += 1;
      continue;
    }
    if (!row.name || !row.facilityId) {
      invalid += 1;
      continue;
    }
    if (seen.has(row.facilityId)) continue;
    seen.add(row.facilityId);
    rows.push(row);
  }
  return { rows, invalid };
}

function pushIndex<T>(map: Map<string, T[]>, key: string, row: T) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
}

function buildNewRow(master: MasterFacility, point: { lat: number; lng: number }, usedSlugs: Set<string>): CatalogUpsertInput {
  const id = masterListingId(master.facilityId);
  const province = master.province;
  const city = master.city;
  const amenities = amenitiesFor(master.facilityType);
  const facility = listingFacilityType({ amenities, facilityType: null });
  const name = master.name;
  let slug = listingSlugFromName(name, id.slice(-8));
  if (slug.length > 80) slug = listingSlugFromName("centre", id.slice(-8));
  let n = 2;
  while (usedSlugs.has(slug.toLowerCase()) || !isSafeSitemapSlug(slug)) {
    const base = listingSlugFromName(name, `${id.slice(-6)}${n}`);
    slug = base.length > 80 ? listingSlugFromName("centre", `${id.slice(-6)}${n}`) : base;
    n += 1;
    if (n > 50) {
      slug = `centre-${id.slice(3)}`;
      break;
    }
  }
  usedSlugs.add(slug.toLowerCase());
  const postal = formatPostal(postalKey(master.postal));
  const address = master.address || [city, province, postal].filter(Boolean).join(", ");
  const kindEn =
    facility === "nursery_preschool"
      ? "licensed nursery school"
      : facility === "family_home"
        ? "licensed family child care"
        : facility === "group_home"
          ? "licensed group child care home"
          : facility === "school_age"
            ? "licensed school-age program"
            : "licensed childcare centre";
  const kindFr =
    facility === "nursery_preschool"
      ? "nursery / prématernelle permise"
      : facility === "family_home"
        ? "milieu familial permis"
        : facility === "group_home"
          ? "milieu familial de groupe permis"
          : facility === "school_age"
            ? "service parascolaire permis"
            : "centre de garde permis";
  const description = `${name} is a ${kindEn}${address ? ` at ${address}` : ""}${city ? `, ${city}` : ""} ${postal} (${province}). Hours and spaces follow the provincial or territorial registry.`.trim();
  const descriptionFr = `${name} est un ${kindFr}${address ? ` au ${address}` : ""}${city ? `, ${city}` : ""} ${postal} (${province}). Heures et places selon le registre provincial.`.trim();
  return {
    id,
    slug,
    name,
    nameFr: name,
    tagline: facilityTypeTagline(facility, city, province, "en"),
    taglineFr: facilityTypeTagline(facility, city, province, "fr"),
    description: description.slice(0, 480),
    descriptionFr: descriptionFr.slice(0, 480),
    address,
    city,
    province,
    postalCode: postal,
    lat: point.lat,
    lng: point.lng,
    phone: master.phone,
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
    reviews: [],
    licenseNumber: master.licence || master.facilityId,
    languages: province === "QC" ? "fr" : "en",
    amenities,
    photos: [],
    googlePlaceId: null,
    contactEmail: master.email,
    website: master.website,
    visibility: "public",
    isTest: false,
  };
}

/**
 * Upsert plan: catalogue rows in, catalogue rows out, never fewer.
 * `rows` keeps the input order, then appends new master facilities.
 */
export function syncMasterCatalogue<T extends CatalogueMatchRow>(
  catalog: readonly T[],
  csvText: string,
): MasterSyncResult<T | CatalogUpsertInput> {
  const parsed = parseMasterFacilities(csvText);
  const byLic = new Map<string, T[]>();
  const byNameCityPostal = new Map<string, T[]>();
  const byNamePostal = new Map<string, T[]>();
  const byNameCity = new Map<string, T[]>();
  const byNameAddress = new Map<string, T[]>();
  const geo: GeoIndex = { postal: new Map(), fsa: new Map(), city: new Map() };
  const usedSlugs = new Set<string>();
  const usedIds = new Set<string>();

  for (const row of catalog) {
    usedIds.add(row.id);
    if (row.slug) usedSlugs.add(row.slug.toLowerCase());
    const province = (row.province || "").toUpperCase();
    const name = catalogueNameKey(row.name);
    const city = fold(row.city);
    const postal = postalKey(row.postalCode);
    const address = catalogueAddressKey(row.address);
    const licence = licenceKey(row.licenseNumber);
    pushIndex(byLic, licence ? `${province}|${licence}` : "", row);
    pushIndex(byNameCityPostal, `${province}|${city}|${name}|${postal}`, row);
    if (postal) pushIndex(byNamePostal, `${postal}|${name}`, row);
    if (address) pushIndex(byNameAddress, `${province}|${name}|${address}`, row);
    pushIndex(byNameCity, `${province}|${city}|${name}`, row);
    if (isInCanada(Number(row.lat), Number(row.lng))) {
      pushGeo(geo.postal, postal, Number(row.lat), Number(row.lng));
      if (postal.length >= 3) pushGeo(geo.fsa, postal.slice(0, 3), Number(row.lat), Number(row.lng));
      pushGeo(geo.city, `${province}|${city}`, Number(row.lat), Number(row.lng));
    }
  }

  const fills = new Map<string, { phone: string; email: string; website: string }>();
  const additions: CatalogUpsertInput[] = [];
  let matched = 0;
  let skippedNoGeo = 0;
  let skippedNonCanada = 0;
  let skippedInvalid = parsed.invalid;

  for (const master of parsed.rows) {
    if (!CANADA.has(master.province)) {
      skippedNonCanada += 1;
      continue;
    }
    const province = master.province;
    const name = catalogueNameKey(master.name);
    const city = fold(master.city);
    const postal = postalKey(master.postal);
    const address = catalogueAddressKey(master.address);
    const licence = licenceKey(master.licence);
    const candidates =
      byNameCityPostal.get(`${province}|${city}|${name}|${postal}`) ||
      (postal ? byNamePostal.get(`${postal}|${name}`) : undefined) ||
      (licence ? byLic.get(`${province}|${licence}`) : undefined) ||
      (address ? byNameAddress.get(`${province}|${name}|${address}`) : undefined) ||
      byNameCity.get(`${province}|${city}|${name}`);
    if (candidates && candidates.length > 0) {
      matched += 1;
      if (candidates.length === 1) {
        const hit = candidates[0];
        const prev = fills.get(hit.id) || { phone: "", email: "", website: "" };
        fills.set(hit.id, {
          phone: preserveFilledContact(prev.phone, master.phone),
          email: preserveFilledContact(prev.email, master.email),
          website: preserveFilledContact(prev.website, master.website),
        });
      }
      continue;
    }
    const point = locate(master, geo);
    if (!point) {
      skippedNoGeo += 1;
      continue;
    }
    const created = buildNewRow(master, point, usedSlugs);
    if (usedIds.has(created.id) || isAdminOnlyListing(created)) {
      skippedInvalid += 1;
      continue;
    }
    usedIds.add(created.id);
    additions.push(created);
    pushGeo(geo.postal, postal, point.lat, point.lng);
    if (postal.length >= 3) pushGeo(geo.fsa, postal.slice(0, 3), point.lat, point.lng);
    pushGeo(geo.city, `${province}|${city}`, point.lat, point.lng);
  }

  let contactsFilled = 0;
  const rows: Array<T | CatalogUpsertInput> = catalog.map((row) => {
    const fill = fills.get(row.id);
    if (!fill) return row;
    const phone = preserveFilledContact(fill.phone, row.phone);
    const contactEmail = preserveFilledContact(fill.email, row.contactEmail);
    const website = preserveFilledContact(fill.website, row.website);
    if (phone === (row.phone || "") && contactEmail === (row.contactEmail || "") && website === (row.website || "")) {
      return row;
    }
    contactsFilled += 1;
    return { ...row, phone, contactEmail, website };
  });
  rows.push(...additions);
  if (rows.length < catalog.length) {
    throw new Error("master sync shrank the catalogue");
  }

  const publicSlugs = publicSitemapSlugs(rows, 100_000).length;
  return {
    rows,
    summary: {
      masterRows: parsed.rows.length,
      matched,
      added: additions.length,
      skippedNoGeo,
      skippedNonCanada,
      skippedInvalid,
      contactsFilled,
      catalogueRows: rows.length,
      publicSlugs,
    },
  };
}

/**
 * Drop brand-new seed rows that already exist in Neon under a different id
 * (claimed Live centres such as Kids World). Rows that share an id are kept
 * so the upsert can refresh them. Stored rows are never deleted.
 */
export function dropStoredDuplicateAdditions<T extends CatalogueMatchRow>(
  seedRows: readonly T[],
  stored: readonly CatalogueMatchRow[],
): { rows: T[]; dropped: number } {
  const storedIds = new Set(stored.map((row) => row.id).filter(Boolean));
  const byLic = new Map<string, CatalogueMatchRow[]>();
  const byNameCityPostal = new Map<string, CatalogueMatchRow[]>();
  const byNamePostal = new Map<string, CatalogueMatchRow[]>();
  const byNameCity = new Map<string, CatalogueMatchRow[]>();
  const byNameAddress = new Map<string, CatalogueMatchRow[]>();
  for (const row of stored) {
    const province = (row.province || "").toUpperCase();
    const name = catalogueNameKey(row.name);
    const city = fold(row.city);
    const postal = postalKey(row.postalCode);
    const address = catalogueAddressKey(row.address);
    const licence = licenceKey(row.licenseNumber);
    pushIndex(byLic, licence ? `${province}|${licence}` : "", row);
    pushIndex(byNameCityPostal, `${province}|${city}|${name}|${postal}`, row);
    if (postal) pushIndex(byNamePostal, `${postal}|${name}`, row);
    if (address) pushIndex(byNameAddress, `${province}|${name}|${address}`, row);
    pushIndex(byNameCity, `${province}|${city}|${name}`, row);
  }
  const rows: T[] = [];
  let dropped = 0;
  for (const row of seedRows) {
    if (storedIds.has(row.id)) {
      rows.push(row);
      continue;
    }
    const province = (row.province || "").toUpperCase();
    const name = catalogueNameKey(row.name);
    const city = fold(row.city);
    const postal = postalKey(row.postalCode);
    const address = catalogueAddressKey(row.address);
    const licence = licenceKey(row.licenseNumber);
    const hit =
      byNameCityPostal.get(`${province}|${city}|${name}|${postal}`) ||
      (postal ? byNamePostal.get(`${postal}|${name}`) : undefined) ||
      (licence ? byLic.get(`${province}|${licence}`) : undefined) ||
      (address ? byNameAddress.get(`${province}|${name}|${address}`) : undefined) ||
      byNameCity.get(`${province}|${city}|${name}`);
    if (hit && hit.length > 0) {
      dropped += 1;
      continue;
    }
    rows.push(row);
  }
  return { rows, dropped };
}
