/**
 * Provincial opening counts from official public sources only.
 * Manitoba: childcaresearch.gov.mb.ca vacancy fields by age.
 * New Brunswick open data publishes licensed capacity, not current openings.
 * Never invent a centre or a spot count. Never overwrite listing facts.
 */

export const VACANCY_EVENTS = ["vacancy_imported", "vacancy_import_failed"] as const;

export const MB_SOURCE_URL = "https://childcaresearch.gov.mb.ca/en/Home/SearchedChildCareLocations";
export const NB_SOURCE_URL = "https://gnb.socrata.com/api/views/q6ky-jc7a/rows.csv?accessType=DOWNLOAD";
export const NB_SOURCE_PAGE = "https://gnb.socrata.com/Education-Early-Childhood/Licensed-Early-Learning-and-Childcare-Facilities/q6ky-jc7a";

export const VACANCY_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export type ProvinceCode = "MB" | "NB";

export type SourceVacancy = {
  province: ProvinceCode;
  sourceUrl: string;
  licence: string;
  name: string;
  address: string;
  city: string;
  asOf: string | null;
  fetchedAt: string;
  infant: number | null;
  nursery: number | null;
  preschool: number | null;
  schoolAge: number | null;
  total: number | null;
  ageLabel: string;
};

export type ListingMatch = {
  id: string;
  province: string;
  licence: string;
  name: string;
  address: string;
  city: string;
  claimed: boolean;
  ownVacancy: boolean;
};

export type MatchedVacancy = SourceVacancy & {
  daycareId: string | null;
  method: "licence" | "name_address" | "unmatched";
};

export type ProvincialOpening = {
  total: number;
  asOf: string;
  sourceUrl: string;
  ageLabel: string;
};

const VACANCY_HEADER = /^(openings|vacancies|available[\s_-]*spaces|vacant[\s_-]*spaces)$/i;

export function provinceCode(raw: unknown): ProvinceCode | "" {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "mb" || value === "manitoba") return "MB";
  if (value === "nb" || value === "new brunswick" || value === "nouveau-brunswick") return "NB";
  return "";
}

function countOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return Math.round(n);
}

function clean(value: unknown, max: number): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function decodeName(value: unknown): string {
  const amp = String.fromCharCode(38);
  return clean(value, 160)
    .split(amp + "quot;").join('"')
    .split(amp + "#39;").join("'")
    .split(amp + "apos;").join("'")
    .split(amp + "lt;").join("<")
    .split(amp + "gt;").join(">")
    .split(amp + "amp;").join(amp);
}

function bandLabel(infant: number | null, nursery: number | null, preschool: number | null, schoolAge: number | null): string {
  const parts = [
    infant != null ? "infant" : "",
    nursery != null ? "nursery" : "",
    preschool != null ? "preschool" : "",
    schoolAge != null ? "school-age" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "All ages";
}

function totalOf(bands: Array<number | null>): number | null {
  const nums = bands.filter((n): n is number => n != null);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0);
}

export function normLicence(value: unknown): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function licenceKeys(value: unknown, province: ProvinceCode): Set<string> {
  const raw = normLicence(value);
  const keys = new Set<string>();
  if (!raw) return keys;
  keys.add(raw);
  if (raw.startsWith(province)) {
    const rest = raw.slice(province.length);
    if (rest) keys.add(rest);
  } else if (/^\d+$/.test(raw)) {
    keys.add(province + raw);
  }
  return keys;
}

export function licencesMatch(a: unknown, b: unknown, province: ProvinceCode): boolean {
  const left = licenceKeys(a, province);
  if (!left.size) return false;
  for (const key of licenceKeys(b, province)) {
    if (left.has(key)) return true;
  }
  return false;
}

function normText(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function samePlace(row: { name: string; address: string; city: string }, listing: ListingMatch): boolean {
  if (!normText(row.name) || normText(row.name) !== normText(listing.name)) return false;
  const left = normText(`${row.address} ${row.city}`);
  const right = normText(`${listing.address} ${listing.city}`);
  if (!left || !right) return false;
  const numLeft = left.match(/\d+/)?.[0];
  const numRight = right.match(/\d+/)?.[0];
  if (!numLeft || numLeft !== numRight) return false;
  const words = (text: string) => text.split(" ").filter((word) => word.length > 3 && !/^\d+$/.test(word));
  const rightWords = new Set(words(right));
  return words(left).some((word) => rightWords.has(word));
}

export function parseMbLocations(payload: unknown, fetchedAt: string): { ok: true; rows: SourceVacancy[] } | { ok: false; reason: string } {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { childCareFacilities?: unknown }).childCareFacilities)
      ? (payload as { childCareFacilities: unknown[] }).childCareFacilities
      : null;
  if (!list) return { ok: false, reason: "bad_payload" };
  const rows: SourceVacancy[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const cap = row.capacity && typeof row.capacity === "object" ? (row.capacity as Record<string, unknown>) : null;
    const addr = row.facilityAddress && typeof row.facilityAddress === "object" ? (row.facilityAddress as Record<string, unknown>) : {};
    const infant = countOrNull(cap ? cap.age0To2Vacancy : row.age0To2Vacancy);
    const nursery = countOrNull(cap ? cap.age2To6NurseryVacancy : row.age2To6NurseryVacancy);
    const preschool = countOrNull(cap ? cap.age2To6PreschoolVacancy : row.age2To6PreschoolVacancy);
    const schoolAge = countOrNull(cap ? cap.age6To12Vacancy : row.age6To12Vacancy);
    const name = decodeName(row.name);
    if (!name) continue;
    const asOfRaw = clean(row.lastModifiedDate, 40);
    const asOf = Number.isFinite(Date.parse(asOfRaw)) ? new Date(asOfRaw).toISOString() : null;
    rows.push({
      province: "MB",
      sourceUrl: MB_SOURCE_URL,
      licence: clean(row.facilityIdNumber || row.facilityIdNum, 40),
      name,
      address: clean(addr.address, 160),
      city: clean(addr.city, 80),
      asOf,
      fetchedAt,
      infant,
      nursery,
      preschool,
      schoolAge,
      total: totalOf([infant, nursery, preschool, schoolAge]),
      ageLabel: bandLabel(infant, nursery, preschool, schoolAge),
    });
  }
  return { ok: true, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseNbCsv(text: string, fetchedAt: string): { ok: true; rows: SourceVacancy[] } | { ok: false; reason: "empty" | "no_vacancy_field" } {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { ok: false, reason: "empty" };
  const headers = splitCsvLine(lines[0] || "").map((header) => header.trim());
  const vacancyIdx = headers.findIndex((header) => VACANCY_HEADER.test(header));
  if (vacancyIdx < 0) return { ok: false, reason: "no_vacancy_field" };
  const idx = (name: RegExp) => headers.findIndex((header) => name.test(header.trim()));
  const licenceIdx = idx(/licen[cs]e/i);
  const nameIdx = idx(/facility[\s_-]*name|name/i);
  const addressIdx = idx(/address/i);
  const cityIdx = idx(/city|municipality/i);
  const rows: SourceVacancy[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const total = countOrNull(cols[vacancyIdx]);
    const name = clean(nameIdx >= 0 ? cols[nameIdx] : "", 160);
    if (!name || total == null) continue;
    rows.push({
      province: "NB",
      sourceUrl: NB_SOURCE_URL,
      licence: clean(licenceIdx >= 0 ? cols[licenceIdx] : "", 40),
      name,
      address: clean(addressIdx >= 0 ? cols[addressIdx] : "", 160),
      city: clean(cityIdx >= 0 ? cols[cityIdx] : "", 80),
      asOf: null,
      fetchedAt,
      infant: null,
      nursery: null,
      preschool: null,
      schoolAge: null,
      total,
      ageLabel: "All ages",
    });
  }
  return { ok: true, rows };
}

export function matchVacancyRows(rows: SourceVacancy[], listings: ListingMatch[]): MatchedVacancy[] {
  return rows.map((row) => {
    const pool = listings.filter((listing) => provinceCode(listing.province) === row.province);
    const byLicence = row.licence ? pool.filter((listing) => licencesMatch(row.licence, listing.licence, row.province)) : [];
    if (byLicence.length === 1) return { ...row, daycareId: byLicence[0]!.id, method: "licence" as const };
    if (byLicence.length > 1) return { ...row, daycareId: null, method: "unmatched" as const };
    const byPlace = pool.filter((listing) => samePlace(row, listing));
    if (byPlace.length === 1) return { ...row, daycareId: byPlace[0]!.id, method: "name_address" as const };
    return { ...row, daycareId: null, method: "unmatched" as const };
  });
}

export function provincialOpeningLine(input: {
  total: number | null;
  asOf: string | null;
  fetchedAt: string;
  sourceUrl: string;
  ageLabel: string;
  claimedOwnVacancy: boolean;
  now?: number;
}): ProvincialOpening | null {
  if (input.claimedOwnVacancy) return null;
  if (input.total == null) return null;
  const stamp = input.asOf || input.fetchedAt;
  const ts = Date.parse(stamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(ts) || now - ts > VACANCY_STALE_MS) return null;
  return {
    total: input.total,
    asOf: new Date(ts).toISOString(),
    sourceUrl: input.sourceUrl,
    ageLabel: input.ageLabel || "All ages",
  };
}

export function mergeVacancyImport<T extends MatchedVacancy>(prev: T[], incoming: T[], failed: boolean): { rows: T[]; changed: T[]; event: (typeof VACANCY_EVENTS)[number] } {
  if (failed) return { rows: prev, changed: [], event: "vacancy_import_failed" };
  const keyOf = (row: MatchedVacancy) => `${row.province}|${normLicence(row.licence)}|${normText(row.name)}|${normText(row.address)}`;
  const next = prev.slice();
  const index = new Map(next.map((row, i) => [keyOf(row), i]));
  const changed: T[] = [];
  for (const row of incoming) {
    const key = keyOf(row);
    const at = index.get(key);
    if (at == null) {
      index.set(key, next.length);
      next.push(row);
      if (row.total != null) changed.push(row);
      continue;
    }
    const old = next[at]!;
    if (old.total !== row.total) changed.push(row);
    next[at] = { ...old, ...row, daycareId: row.daycareId ?? old.daycareId };
  }
  return { rows: next, changed, event: "vacancy_imported" };
}

export function vacancyEventProps(input: { province: string; matched: number; unmatched: number; changed: number; reason?: string }) {
  const props: Record<string, string | number> = {
    province: input.province === "NB" ? "NB" : "MB",
    matched: Math.max(0, Math.round(input.matched)),
    unmatched: Math.max(0, Math.round(input.unmatched)),
    changed: Math.max(0, Math.round(input.changed)),
  };
  const reason = String(input.reason || "").trim();
  if (reason && !reason.includes("@")) props.reason = reason.slice(0, 40);
  return props;
}
