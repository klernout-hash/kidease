/**
 * Quebec recognized home daycares (milieux familiaux reconnus).
 * Stored and shown apart from licensed centres. Law 25: no street, no exact pin,
 * personal names replaced, phone and email not in the public object.
 * This file does not send email or SMS.
 */

import { parseCsvRecords } from "./catalog-master.ts";

export const QC_HOME_PROVIDER_TYPE = "milieu_familial_reconnu" as const;

export type QcHomeProviderType = typeof QC_HOME_PROVIDER_TYPE;

export type QcHomeLocale = "en" | "fr";

/** 24 master columns, then provider_type and source. */
export const QC_HOME_CSV_COLUMNS = [
  "facility_id",
  "name",
  "licence_number",
  "facility_type",
  "care_type",
  "licence_category",
  "program_model",
  "street_address",
  "city",
  "province",
  "postal_code",
  "full_address",
  "phone",
  "email",
  "website",
  "licence_status",
  "ages_served",
  "capacity",
  "fees",
  "fee_unit",
  "source_name",
  "source_url",
  "last_verified",
  "notes",
  "provider_type",
  "source",
] as const;

const ORG_NAME =
  /garderie|milieu familial|cpe\b|centre|center|daycare|enfants|poupon|halte|service de garde|little|academy|acad[eé]mie|coop[eé]rative|\bcoop\b/i;

const NAME_PARTICLE = new Set(["le", "la", "du", "de", "des", "et", "d"]);

const BUSINESS_START =
  /^(les|le|la|l['’]|chez|aux|au|des|jardin|garderie|service|royaume|soleil|rayon|rsge)\b/i;

const SMALL_PLACE = new Set(["de", "du", "des", "la", "le", "les", "et", "sur", "d", "à", "a", "au", "aux"]);

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."];

/** Municipal reference points only. Rounded. Never a home. Radius is metres. */
const AREA_CENTERS: Record<string, { lat: number; lng: number; radiusM: number }> = {
  alma: { lat: 48.55, lng: -71.65, radiusM: 3000 },
  amqui: { lat: 48.47, lng: -67.43, radiusM: 2500 },
  "ascot corner": { lat: 45.45, lng: -71.76, radiusM: 2500 },
  "ayers cliff": { lat: 45.17, lng: -72.05, radiusM: 2000 },
  beauharnois: { lat: 45.32, lng: -73.87, radiusM: 3000 },
  beaumont: { lat: 46.83, lng: -70.99, radiusM: 2000 },
  bedford: { lat: 45.12, lng: -72.99, radiusM: 2000 },
  beloeil: { lat: 45.57, lng: -73.2, radiusM: 2500 },
  berthierville: { lat: 46.08, lng: -73.18, radiusM: 2500 },
  brigham: { lat: 45.27, lng: -72.85, radiusM: 2000 },
  cacouna: { lat: 47.92, lng: -69.5, radiusM: 2500 },
  "cap sante": { lat: 46.67, lng: -71.78, radiusM: 2000 },
  carignan: { lat: 45.45, lng: -73.3, radiusM: 2500 },
  causapscal: { lat: 48.37, lng: -67.23, radiusM: 2000 },
  chambly: { lat: 45.45, lng: -73.29, radiusM: 2500 },
  "cookshire eaton": { lat: 45.41, lng: -71.63, radiusM: 3000 },
  cowansville: { lat: 45.21, lng: -72.75, radiusM: 2500 },
  degelis: { lat: 47.55, lng: -68.65, radiusM: 2500 },
  donnacona: { lat: 46.67, lng: -71.73, radiusM: 2500 },
  "east angus": { lat: 45.48, lng: -71.66, radiusM: 2500 },
  farnham: { lat: 45.28, lng: -72.98, radiusM: 2500 },
  gatineau: { lat: 45.48, lng: -75.7, radiusM: 6000 },
  "la presentation": { lat: 45.67, lng: -73.05, radiusM: 2000 },
  lasalle: { lat: 45.43, lng: -73.63, radiusM: 2500 },
  "lac brome": { lat: 45.22, lng: -72.51, radiusM: 3000 },
  "lac beauport": { lat: 46.95, lng: -71.3, radiusM: 2500 },
  lachine: { lat: 45.45, lng: -73.68, radiusM: 2500 },
  lanoraie: { lat: 45.96, lng: -73.22, radiusM: 2000 },
  laval: { lat: 45.58, lng: -73.75, radiusM: 7000 },
  lavaltrie: { lat: 45.88, lng: -73.28, radiusM: 2500 },
  lery: { lat: 45.35, lng: -73.8, radiusM: 2000 },
  magog: { lat: 45.27, lng: -72.15, radiusM: 3000 },
  maria: { lat: 48.17, lng: -65.98, radiusM: 2500 },
  mcmasterville: { lat: 45.55, lng: -73.23, radiusM: 2000 },
  montreal: { lat: 45.51, lng: -73.57, radiusM: 8000 },
  neuville: { lat: 46.7, lng: -71.58, radiusM: 2500 },
  "pointe a la croix": { lat: 48.02, lng: -66.74, radiusM: 2500 },
  "pont rouge": { lat: 46.75, lng: -71.7, radiusM: 2500 },
  portneuf: { lat: 46.7, lng: -71.88, radiusM: 2500 },
  ragueneau: { lat: 49.07, lng: -68.54, radiusM: 2500 },
  repentigny: { lat: 45.74, lng: -73.45, radiusM: 3500 },
  "riviere bleue": { lat: 47.44, lng: -69.04, radiusM: 2000 },
  "riviere du loup": { lat: 47.83, lng: -69.53, radiusM: 3500 },
  "saint alban": { lat: 46.72, lng: -72.08, radiusM: 2000 },
  "saint antonin": { lat: 47.76, lng: -69.48, radiusM: 2000 },
  "saint basile": { lat: 46.75, lng: -71.82, radiusM: 2000 },
  "saint bernard": { lat: 46.49, lng: -71.14, radiusM: 2000 },
  "saint dominique": { lat: 45.57, lng: -72.85, radiusM: 2000 },
  "saint hugues": { lat: 45.8, lng: -72.87, radiusM: 2000 },
  "saint lambert": { lat: 45.5, lng: -73.51, radiusM: 2500 },
  "saint lambert de lauzon": { lat: 46.59, lng: -71.23, radiusM: 2000 },
  "saint leonard": { lat: 45.59, lng: -73.6, radiusM: 2500 },
  "saint marc des carrieres": { lat: 46.68, lng: -72.05, radiusM: 2000 },
  "saint raymond": { lat: 46.9, lng: -71.83, radiusM: 2500 },
  "saint ubalde": { lat: 46.75, lng: -72.27, radiusM: 2000 },
  "sainte marie": { lat: 46.45, lng: -71.03, radiusM: 2500 },
  sayabec: { lat: 48.56, lng: -67.69, radiusM: 2000 },
  scott: { lat: 46.51, lng: -71.08, radiusM: 2000 },
  shannon: { lat: 46.88, lng: -71.52, radiusM: 2500 },
  sherbrooke: { lat: 45.4, lng: -71.89, radiusM: 5000 },
  stanstead: { lat: 45.02, lng: -72.09, radiusM: 2500 },
  "stoneham et tewkesbury": { lat: 47.0, lng: -71.37, radiusM: 4000 },
  sutton: { lat: 45.1, lng: -72.62, radiusM: 2500 },
  "temiscouata sur le lac": { lat: 47.68, lng: -68.88, radiusM: 3000 },
  "vallee jonction": { lat: 46.37, lng: -70.92, radiusM: 2000 },
  verdun: { lat: 45.46, lng: -73.57, radiusM: 2500 },
  weedon: { lat: 45.71, lng: -71.46, radiusM: 2000 },
  quebec: { lat: 46.81, lng: -71.21, radiusM: 6000 },
};

export type QcHomeArea = { lat: number; lng: number; radiusM: number };

export type QcHomeImportRow = {
  id: string;
  slug: string;
  providerType: QcHomeProviderType;
  publishedName: string;
  personalName: boolean;
  municipality: string | null;
  neighbourhood: string | null;
  postalFsa: string | null;
  province: "QC";
  phone: string | null;
  email: string | null;
  website: string | null;
  bureauName: string;
  sourceUrl: string;
  sourceLabel: string | null;
  verifiedOn: string | null;
  capacity: number | null;
  openSpots: number | null;
  openSpotsAsOf: string | null;
  agesServed: string | null;
  feesText: string | null;
  feeUnit: string | null;
  areaLat: number | null;
  areaLng: number | null;
  areaRadiusM: number | null;
};

export type QcHomeImportSummary = {
  rows: number;
  accepted: number;
  skipped: number;
  personalNames: number;
  streetDropped: number;
  postalReduced: number;
  withAreaCircle: number;
  skipReasons: Record<string, number>;
};

export type QcHomeParseResult =
  | { ok: true; rows: QcHomeImportRow[]; summary: QcHomeImportSummary }
  | { ok: false; error: string };

export type QcHomeNameInput = {
  publishedName: string;
  personalName: boolean;
  municipality: string | null;
  neighbourhood: string | null;
  postalFsa: string | null;
};

export type QcHomePublicListing = {
  id: string;
  slug: string;
  providerType: QcHomeProviderType;
  displayName: string;
  locationLabel: string;
  municipality: string | null;
  neighbourhood: string | null;
  postalFsa: string | null;
  bureauName: string;
  sourceUrl: string | null;
  verifiedOn: string | null;
  badgeText: string;
  capacity: number | null;
  openSpots: number | null;
  openSpotsAsOf: string | null;
  openSpotsText: string;
  agesServed: string | null;
  feesText: string | null;
  area: QcHomeArea | null;
  hasPhone: boolean;
  hasEmail: boolean;
  website: string | null;
  sample: boolean;
};

const EN_DASH = "\u2013";

export function areaKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titlePlace(raw: string): string {
  const lower = raw.trim().toLocaleLowerCase("fr-CA");
  if (!lower) return "";
  return lower
    .split(/(\s+|-)/)
    .map((part, i) => {
      if (part === "-" || /^\s+$/.test(part)) return part;
      if (i > 0 && SMALL_PLACE.has(part)) return part;
      return part.charAt(0).toLocaleUpperCase("fr-CA") + part.slice(1);
    })
    .join("");
}

export function municipalityArea(name: string | null | undefined): QcHomeArea | null {
  const key = areaKey(name || "");
  if (!key) return null;
  const hit = AREA_CENTERS[key];
  if (!hit || hit.radiusM < 1500) return null;
  return { lat: hit.lat, lng: hit.lng, radiusM: hit.radiusM };
}

export function looksLikeStreet(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/\d/.test(v)) return true;
  return /\b(rue|avenue|ave\.?|chemin|boulevard|boul\.?|street|st\.?|road|rd\.?|route|rang|crescent|croissant|place)\b/i.test(
    v,
  );
}

export function postalFsa(raw: string): { fsa: string | null; reduced: boolean } {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length < 3) return { fsa: null, reduced: false };
  const fsa = compact.slice(0, 3);
  if (!/^[A-Z]\d[A-Z]$/.test(fsa)) return { fsa: null, reduced: false };
  return { fsa, reduced: compact.length > 3 };
}

function nameToken(token: string): boolean {
  return /^[\p{L}][\p{L}'’.-]*$/u.test(token);
}

function personalNameTokens(value: string): boolean {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 5) return false;
  if (!tokens.every((token) => nameToken(token))) return false;
  return tokens.some((token) => !NAME_PARTICLE.has(token.toLocaleLowerCase("fr-CA")));
}

export function isPersonalPublishedName(name: string, notes: string): boolean {
  if (/PERSONAL_NAME_FLAG/i.test(notes)) return true;
  if (/name not published/i.test(name)) return true;
  if (/projet-pilote/i.test(name)) return true;
  const stripped = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[«»"]/g, " ")
    .trim();
  if (!stripped) return false;
  if (stripped.includes(",")) {
    const tail = (stripped.split(",").pop() || "").trim();
    if (personalNameTokens(tail)) return true;
  }
  if (ORG_NAME.test(stripped) || BUSINESS_START.test(stripped)) return false;
  return personalNameTokens(stripped);
}

export function publicPlace(input: QcHomeNameInput, locale: QcHomeLocale): string {
  return (
    input.municipality ||
    input.neighbourhood ||
    input.postalFsa ||
    (locale === "fr" ? "Québec" : "Quebec")
  );
}

export function publicDisplayName(input: QcHomeNameInput, locale: QcHomeLocale): string {
  if (!input.personalName) {
    const published = input.publishedName.trim();
    if (published) return published;
  }
  const label = locale === "fr" ? "Milieu familial reconnu" : "Recognized home daycare";
  return `${label} ${EN_DASH} ${publicPlace(input, locale)}`;
}

export function publicLocationLabel(input: QcHomeNameInput): string {
  const parts: string[] = [];
  if (input.municipality) parts.push(input.municipality);
  if (input.neighbourhood && areaKey(input.neighbourhood) !== areaKey(input.municipality || "")) {
    parts.push(input.neighbourhood);
  }
  if (input.postalFsa) parts.push(input.postalFsa);
  return parts.join(", ");
}

export function formatQcDate(iso: string | null | undefined, locale: QcHomeLocale): string | null {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const name = locale === "fr" ? MONTHS_FR[month - 1] : MONTHS_EN[month - 1];
  return `${day} ${name} ${match[1]}`;
}

export function recognitionBadge(
  bureau: string,
  verifiedOn: string | null,
  locale: QcHomeLocale,
): string {
  const name = bureau.trim();
  const when = formatQcDate(verifiedOn, locale);
  if (locale === "fr") {
    return when ? `Reconnu par ${name}, vérifié le ${when}` : `Reconnu par ${name}`;
  }
  return when ? `Recognized by ${name}, verified ${when}` : `Recognized by ${name}`;
}

export function openSpotsText(input: {
  openSpots: number | null;
  openSpotsAsOf: string | null;
  verifiedOn: string | null;
  locale: QcHomeLocale;
}): string {
  const when = formatQcDate(input.openSpots == null ? input.verifiedOn : input.openSpotsAsOf || input.verifiedOn, input.locale);
  if (input.openSpots != null) {
    if (input.locale === "fr") {
      return when
        ? `Places libres : ${input.openSpots}, au ${when}. Ce nombre peut ne plus être à jour.`
        : `Places libres : ${input.openSpots}. Ce nombre peut ne plus être à jour.`;
    }
    return when
      ? `Open spots: ${input.openSpots}, as of ${when}. This number may be out of date.`
      : `Open spots: ${input.openSpots}. This number may be out of date.`;
  }
  if (input.locale === "fr") {
    return when
      ? `Les places libres ne sont pas indiquées. Dernière vérification : ${when}. Cela peut ne plus être à jour.`
      : "Les places libres ne sont pas indiquées. Cela peut ne plus être à jour.";
  }
  return when
    ? `Open spots are not listed. Last check: ${when}. This may be out of date.`
    : "Open spots are not listed. This may be out of date.";
}

export function qcHomeSlug(facilityId: string): string {
  return facilityId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function headerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function cell(record: Record<string, string>, key: string): string {
  return (record[key] || "").trim();
}

function clip(value: string, max: number): string {
  const v = value.trim();
  return v.length > max ? v.slice(0, max) : v;
}

function optionalInt(raw: string): number | null {
  if (!raw.trim()) return null;
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n > 200) return null;
  return n;
}

function httpUrl(raw: string): string | null {
  const v = raw.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const url = new URL(v);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 400);
  } catch {
    return null;
  }
}

function looseEmail(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 160 || /\s/.test(v) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

function loosePhone(raw: string): string | null {
  const v = clip(raw, 40);
  if (!v || !/\d/.test(v)) return null;
  return v;
}

function bureauFromSource(sourceName: string): string {
  return sourceName.replace(/^bureau coordonnateur\s*:\s*/i, "").trim();
}

function neighbourhoodFromName(name: string): string | null {
  const match = name.match(/\(([^)]+)\)/);
  if (!match) return null;
  const inner = match[1].trim();
  if (!inner || inner.length > 40 || looksLikeStreet(inner)) return null;
  return titlePlace(inner);
}

function municipalityFromFullAddress(full: string): string | null {
  const raw = full.trim();
  if (!raw || /^qc$/i.test(raw) || looksLikeStreet(raw)) return null;
  const first = raw.split(",")[0]?.trim() || "";
  if (!first || /^qc$/i.test(first) || looksLikeStreet(first)) return null;
  return first;
}

function placeFromCommaName(name: string): string | null {
  const parts = name.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const place = parts[0].replace(/\([^)]*\)/g, "").trim();
  if (!place || looksLikeStreet(place) || ORG_NAME.test(place)) return null;
  return place;
}

function bump(reasons: Record<string, number>, key: string) {
  reasons[key] = (reasons[key] || 0) + 1;
}

export function parseQcHomeCsv(csvText: string): QcHomeParseResult {
  const records = parseCsvRecords(csvText);
  if (records.length < 2) return { ok: false, error: "The CSV has no data rows." };
  const headers = records[0].map(headerKey);
  const missing = QC_HOME_CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) {
    return { ok: false, error: `Missing columns: ${missing.join(", ")}` };
  }
  const index = new Map(headers.map((header, i) => [header, i]));
  const rows: QcHomeImportRow[] = [];
  const seen = new Set<string>();
  const skipReasons: Record<string, number> = {};
  let skipped = 0;
  let streetDropped = 0;
  let postalReduced = 0;
  let personalNames = 0;
  let withAreaCircle = 0;

  for (const record of records.slice(1)) {
    const bag: Record<string, string> = {};
    for (const [key, i] of index) bag[key] = record[i] || "";
    const provider = cell(bag, "provider_type");
    if (provider !== QC_HOME_PROVIDER_TYPE) {
      skipped += 1;
      bump(skipReasons, "provider_type");
      continue;
    }
    const province = cell(bag, "province").toUpperCase();
    if (province && province !== "QC") {
      skipped += 1;
      bump(skipReasons, "province");
      continue;
    }
    const id = clip(cell(bag, "facility_id"), 120);
    if (!id || !/^[A-Za-z0-9|._:-]+$/.test(id)) {
      skipped += 1;
      bump(skipReasons, "facility_id");
      continue;
    }
    const publishedName = clip(cell(bag, "name"), 160);
    if (!publishedName) {
      skipped += 1;
      bump(skipReasons, "name");
      continue;
    }
    const sourceUrl = httpUrl(cell(bag, "source_url"));
    const bureauName = clip(bureauFromSource(cell(bag, "source_name")), 180);
    if (!sourceUrl || !bureauName) {
      skipped += 1;
      bump(skipReasons, "source");
      continue;
    }
    const street = cell(bag, "street_address");
    const full = cell(bag, "full_address");
    if (street || looksLikeStreet(full)) streetDropped += 1;
    const cityRaw = cell(bag, "city") || municipalityFromFullAddress(full) || placeFromCommaName(publishedName) || "";
    const municipality = cityRaw ? titlePlace(cityRaw) : null;
    const neighbourhood = neighbourhoodFromName(publishedName);
    const postal = postalFsa(cell(bag, "postal_code"));
    if (postal.reduced) postalReduced += 1;
    const notes = cell(bag, "notes");
    const personalName = isPersonalPublishedName(publishedName, notes);
    if (personalName) personalNames += 1;
    const area = municipalityArea(municipality);
    if (area) withAreaCircle += 1;
    const verifiedOn = cell(bag, "last_verified").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
    const openSpots = optionalInt(cell(bag, "open_spots") || cell(bag, "spots_open") || cell(bag, "openings"));
    const slug = qcHomeSlug(id);
    if (!slug || seen.has(id) || seen.has(slug)) {
      skipped += 1;
      bump(skipReasons, "duplicate");
      continue;
    }
    seen.add(id);
    seen.add(slug);
    rows.push({
      id,
      slug,
      providerType: QC_HOME_PROVIDER_TYPE,
      publishedName,
      personalName,
      municipality,
      neighbourhood,
      postalFsa: postal.fsa,
      province: "QC",
      phone: loosePhone(cell(bag, "phone")),
      email: looseEmail(cell(bag, "email")),
      website: httpUrl(cell(bag, "website")),
      bureauName,
      sourceUrl,
      sourceLabel: clip(cell(bag, "source"), 120) || null,
      verifiedOn,
      capacity: optionalInt(cell(bag, "capacity")),
      openSpots,
      openSpotsAsOf: openSpots == null ? null : verifiedOn,
      agesServed: clip(cell(bag, "ages_served"), 120) || null,
      feesText: clip(cell(bag, "fees"), 200) || null,
      feeUnit: clip(cell(bag, "fee_unit"), 40) || null,
      areaLat: area?.lat ?? null,
      areaLng: area?.lng ?? null,
      areaRadiusM: area?.radiusM ?? null,
    });
  }

  return {
    ok: true,
    rows,
    summary: {
      rows: records.length - 1,
      accepted: rows.length,
      skipped,
      personalNames,
      streetDropped,
      postalReduced,
      withAreaCircle,
      skipReasons,
    },
  };
}

export function formatQcHomeDryRun(summary: QcHomeImportSummary): string {
  const lines = [
    "QC home daycare import (dry-run)",
    `Rows read: ${summary.rows}`,
    `Accepted: ${summary.accepted}`,
    `Skipped: ${summary.skipped}`,
    `Personal names masked: ${summary.personalNames}`,
    `Street addresses dropped: ${summary.streetDropped}`,
    `Postal codes kept as first 3 characters: ${summary.postalReduced}`,
    `Area circles (municipality only): ${summary.withAreaCircle}`,
    "No database write. No email. No text.",
  ];
  return lines.join("\n");
}

type PublicSource = {
  id: string;
  slug: string;
  publishedName: string;
  personalName: boolean;
  municipality: string | null;
  neighbourhood: string | null;
  postalFsa: string | null;
  bureauName: string;
  sourceUrl: string | null;
  verifiedOn: string | null;
  capacity: number | null;
  openSpots: number | null;
  openSpotsAsOf: string | null;
  agesServed: string | null;
  feesText: string | null;
  areaLat: number | null;
  areaLng: number | null;
  areaRadiusM: number | null;
  hasPhone: boolean;
  hasEmail: boolean;
  website: string | null;
  sample?: boolean;
};

export function toPublicListing(row: PublicSource, locale: QcHomeLocale): QcHomePublicListing {
  const nameInput: QcHomeNameInput = {
    publishedName: row.publishedName,
    personalName: row.personalName,
    municipality: row.municipality,
    neighbourhood: row.neighbourhood,
    postalFsa: row.postalFsa,
  };
  const storedArea =
    row.areaLat != null && row.areaLng != null && (row.areaRadiusM == null || row.areaRadiusM >= 1500)
      ? { lat: row.areaLat, lng: row.areaLng, radiusM: Math.max(row.areaRadiusM || 2500, 1500) }
      : null;
  return {
    id: row.id,
    slug: row.slug,
    providerType: QC_HOME_PROVIDER_TYPE,
    displayName: publicDisplayName(nameInput, locale),
    locationLabel: publicLocationLabel(nameInput),
    municipality: row.municipality,
    neighbourhood: row.neighbourhood,
    postalFsa: row.postalFsa,
    bureauName: row.bureauName,
    sourceUrl: row.sourceUrl,
    verifiedOn: row.verifiedOn,
    badgeText: recognitionBadge(row.bureauName, row.verifiedOn, locale),
    capacity: row.capacity,
    openSpots: row.openSpots,
    openSpotsAsOf: row.openSpots == null ? null : row.openSpotsAsOf || row.verifiedOn,
    openSpotsText: openSpotsText({
      openSpots: row.openSpots,
      openSpotsAsOf: row.openSpotsAsOf,
      verifiedOn: row.verifiedOn,
      locale,
    }),
    agesServed: row.agesServed,
    feesText: row.feesText,
    area: storedArea || municipalityArea(row.municipality),
    hasPhone: row.hasPhone,
    hasEmail: row.hasEmail,
    website: row.website,
    sample: Boolean(row.sample),
  };
}

/** Local UI check only. Never used on Vercel. Not a real daycare. */
export function qcHomePreviewFixtureAllowed(env: Record<string, string | undefined>): boolean {
  if (env.VERCEL || env.VERCEL_ENV) return false;
  return env.QC_HOME_PREVIEW_FIXTURE === "1";
}

export function qcHomePreviewSource(): PublicSource {
  return {
    id: "preview-qc-home",
    slug: "preview-qc-home",
    publishedName: "PREVIEW PERSON",
    personalName: true,
    municipality: "Montréal",
    neighbourhood: null,
    postalFsa: "H2X",
    bureauName: "Preview bureau coordonnateur",
    sourceUrl: "https://www.quebec.ca/",
    verifiedOn: "2026-10-03",
    capacity: null,
    openSpots: null,
    openSpotsAsOf: null,
    agesServed: null,
    feesText: null,
    areaLat: 45.51,
    areaLng: -73.57,
    areaRadiusM: 8000,
    hasPhone: true,
    hasEmail: true,
    website: null,
    sample: true,
  };
}

export const QC_HOME_COPY = {
  en: {
    directoryTitle: "Recognized home daycares in Quebec",
    directoryLead:
      "KidEase is a Canadian company. This page lists milieux familiaux reconnus. You see the town and the bureau that recognizes them, not a street address.",
    directoryNext: "Search by town, neighbourhood, or the first 3 characters of the postal code.",
    searchLabel: "Town or postal code",
    searchButton: "Search",
    closedTitle: "Recognized home daycares in Quebec",
    closedLead:
      "KidEase is a Canadian company. This list of recognized home daycares is not published yet. You can still search licensed daycares.",
    closedButton: "Search licensed daycares",
    emptyTitle: "No match for that place",
    emptyBody: "Try another town, or search licensed daycares.",
    emptySearch: "Search again",
    emptyLicensed: "Search licensed daycares",
    home: "Go home",
    areaNote: "The circle is the area, not the home.",
    areaMap: "Area map for {place}. This is not a street address.",
    showPhone: "Show phone number",
    showEmail: "Show email",
    hidePhone: "Hide phone number",
    hideEmail: "Hide email",
    phoneLabel: "Phone",
    emailLabel: "Email",
    website: "Website",
    capacity: "The source lists room for up to {n} children.",
    ages: "Ages listed by the source",
    fees: "Fee listed by the source",
    correctLink: "This is my daycare. Correct or remove it",
    correctTitle: "Correct or remove this listing",
    correctLead:
      "Tell KidEase what to change, or ask us to remove the listing. We save your note for an admin to review. We do not email or text this daycare.",
    kindCorrection: "Correct something",
    kindRemoval: "Remove this listing",
    yourName: "Your name",
    yourEmail: "Your email",
    message: "What should we change?",
    send: "Save for review",
    saved: "Saved. An admin will review it. KidEase will not email or text this daycare.",
    sample: "Sample listing for layout checks. Not a real daycare.",
    notFoundTitle: "We can't find this daycare",
    notFoundBody: "It may have been removed. Search again, or go home.",
    loadError: "We could not load this list. Search licensed daycares, or try again.",
    revealError: "We could not show that contact. Try again.",
    formError: "Check the form and try again.",
    privacyPath: "Privacy",
  },
  fr: {
    directoryTitle: "Milieux familiaux reconnus au Québec",
    directoryLead:
      "KidEase est une entreprise canadienne. Cette page liste des milieux familiaux reconnus. Vous voyez la municipalité et le bureau qui les reconnaît, pas une adresse de rue.",
    directoryNext: "Cherchez par municipalité, quartier, ou les 3 premiers caractères du code postal.",
    searchLabel: "Municipalité ou code postal",
    searchButton: "Chercher",
    closedTitle: "Milieux familiaux reconnus au Québec",
    closedLead:
      "KidEase est une entreprise canadienne. Cette liste de milieux familiaux reconnus n'est pas encore publiée. Vous pouvez chercher des garderies permises.",
    closedButton: "Chercher des garderies permises",
    emptyTitle: "Aucun résultat pour cet endroit",
    emptyBody: "Essayez une autre municipalité, ou cherchez des garderies permises.",
    emptySearch: "Chercher encore",
    emptyLicensed: "Chercher des garderies permises",
    home: "Accueil",
    areaNote: "Le cercle montre le secteur, pas le domicile.",
    areaMap: "Carte du secteur de {place}. Ce n'est pas une adresse de rue.",
    showPhone: "Afficher le téléphone",
    showEmail: "Afficher le courriel",
    hidePhone: "Masquer le téléphone",
    hideEmail: "Masquer le courriel",
    phoneLabel: "Téléphone",
    emailLabel: "Courriel",
    website: "Site web",
    capacity: "La source indique une capacité d'au plus {n} enfants.",
    ages: "Âges indiqués par la source",
    fees: "Tarif indiqué par la source",
    correctLink: "C'est mon service de garde – corriger ou retirer",
    correctTitle: "Corriger ou retirer cette fiche",
    correctLead:
      "Dites à KidEase quoi changer, ou demandez le retrait. Nous gardons votre note pour qu'un admin la révise. Nous n'envoyons pas de courriel ni de texto à ce service.",
    kindCorrection: "Corriger un détail",
    kindRemoval: "Retirer cette fiche",
    yourName: "Votre nom",
    yourEmail: "Votre courriel",
    message: "Que faut-il changer?",
    send: "Enregistrer pour révision",
    saved: "Enregistré. Un admin va réviser la demande. KidEase n'enverra pas de courriel ni de texto à ce service.",
    sample: "Fiche d'exemple pour la mise en page. Ce n'est pas un vrai service.",
    notFoundTitle: "Nous ne trouvons pas ce service",
    notFoundBody: "Il a peut-être été retiré. Cherchez encore, ou retournez à l'accueil.",
    loadError: "Nous n'avons pas pu charger cette liste. Cherchez des garderies permises, ou réessayez.",
    revealError: "Nous n'avons pas pu afficher ce contact. Réessayez.",
    formError: "Vérifiez le formulaire et réessayez.",
    privacyPath: "Confidentialité",
  },
} as const;

export type QcHomeCopy = { [K in keyof (typeof QC_HOME_COPY)["en"]]: string };

export function qcHomeCopy(locale: QcHomeLocale): QcHomeCopy {
  return QC_HOME_COPY[locale];
}

export function collectCopyStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectCopyStrings(item, out));
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectCopyStrings(item, out);
  }
  return out;
}
