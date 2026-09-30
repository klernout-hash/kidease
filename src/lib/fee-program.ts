/**
 * Sourced parent-fee pills. A pill is a provincial or territorial fact for this
 * centre. It is not a monthly CAD amount, and a harvested "funded" or
 * "ten-a-day" amenity is not a fact.
 *
 * Show $10 / Day for every licensed program:
 *   Saskatchewan, children under 6 (school-age-only programs stay off)
 *   Nunavut licensed centres (family and group homes stay off)
 * Show $10 / Day only when this centre is on a sourced list:
 *   Manitoba — stored fee program mb-10-day (the funded flag). The 2022
 *   directory has no funded column, so an amenity does not count.
 *   British Columbia — official $10 a Day ChildCareBC list (name + city)
 *   Prince Edward Island — stored pe-10-day after the directory star is confirmed
 *   Newfoundland and Labrador — stored nl-10-day after that centre is confirmed
 * Show $9.65 / Day only for Quebec services marked contribution réduite (subv=CR).
 * Show Reduced fees only where the NWT directory says subsidy=Yes or free,
 *   or a stored yt-reduced / nt-reduced code. Yukon has no official extract here.
 * Never show a $10, $15, or $22 pill for Ontario, Alberta, New Brunswick,
 * or Nova Scotia. Those provinces are not at $10.
 */

import { catalogueNameKey, cataloguePlaceKey } from "./catalog-match.ts";
import { classifyFacilityType } from "./facility-type.ts";
import subsidyYes from "./data/subsidy-yes.json" with { type: "json" };

export const MB_FUNDED_10_DAY = "mb-10-day" as const;

export const FEE_PROGRAMS = {
  [MB_FUNDED_10_DAY]: { province: "MB", badge: "badgeTen" },
  "bc-10-day": { province: "BC", badge: "badgeTen" },
  "pe-10-day": { province: "PE", badge: "badgeTen" },
  "nl-10-day": { province: "NL", badge: "badgeTen" },
  "qc-9-65": { province: "QC", badge: "badgeQc965" },
  "nt-reduced": { province: "NT", badge: "badgeReduced" },
  "yt-reduced": { province: "YT", badge: "badgeReduced" },
} as const;

export type FeeProgramCode = keyof typeof FEE_PROGRAMS;
export type FeeProgramBadge = (typeof FEE_PROGRAMS)[FeeProgramCode]["badge"];

export type SubsidyPill = "badgeTen" | "badgeQc965" | "badgeReduced";

const ALIASES: Record<string, FeeProgramCode> = {
  "mb-10-day": MB_FUNDED_10_DAY,
  "mb-funded": MB_FUNDED_10_DAY,
  "mb funded": MB_FUNDED_10_DAY,
  "manitoba-funded": MB_FUNDED_10_DAY,
  "manitoba funded": MB_FUNDED_10_DAY,
  "mb funded / max regulated daily $10/day": MB_FUNDED_10_DAY,
  "manitoba funded / max regulated daily $10/day": MB_FUNDED_10_DAY,
  "max regulated daily $10/day": MB_FUNDED_10_DAY,
  "bc-10-day": "bc-10-day",
  "pe-10-day": "pe-10-day",
  "nl-10-day": "nl-10-day",
  "qc-9-65": "qc-9-65",
  "qc-965": "qc-9-65",
  "nt-reduced": "nt-reduced",
  "yt-reduced": "yt-reduced",
};

const NO_PILL = new Set(["ON", "AB", "NB", "NS"]);

const bcYes = new Set(subsidyYes.bc);
const qcYes = new Set(subsidyYes.qc);
const ntYes = new Set(subsidyYes.nt);

/** Harvested catalogue conversion of a Manitoba $10 day into a fake monthly fee. */
export const CATALOGUE_MONTHLY_FEE_GUESS = 218;

function programKey(raw?: string | null) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeFeeProgram(raw?: string | null): FeeProgramCode | null {
  const key = programKey(raw);
  if (!key) return null;
  return ALIASES[key] ?? null;
}

export function confirmedStoredFeeProgram(d: {
  feeProgram?: string | null;
  province?: string | null;
}): FeeProgramCode | null {
  const code = normalizeFeeProgram(d.feeProgram);
  if (!code) return null;
  const province = (d.province || "").trim().toUpperCase();
  if (province !== FEE_PROGRAMS[code].province) return null;
  return code;
}

function hasAmenity(amenities: string, key: string) {
  return amenities
    .split(",")
    .map((part) => part.trim())
    .includes(key);
}

export function hasListedMonthlyFees(d: {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
}) {
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].some(
    (n) => n != null && n > 0,
  );
}

/**
 * Listed monthly fee, a sourced fee program, or a per-centre program amenity
 * after this centre confirmed fees. A province-typical $10-a-day guess is not enough.
 */
export function hasConfirmedFeeLine(d: {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  amenities?: string | null;
  feeConfirmed?: boolean | null;
  feeProgram?: string | null;
  province?: string | null;
}): boolean {
  if (hasListedMonthlyFees(d)) return true;
  if (confirmedStoredFeeProgram(d)) return true;
  if (!d.feeConfirmed) return false;
  const amenities = d.amenities || "";
  return hasAmenity(amenities, "ten-a-day") || hasAmenity(amenities, "funded");
}

/**
 * $10 / Day, $9.65 / Day, or Reduced fees for this centre only.
 * A claimed listing and a harvested amenity do not create a pill.
 * Québec is never stamped $10-a-day. Alberta is never stamped $15-a-day.
 */
export function confirmedFeeProgramBadge(d: {
  province?: string | null;
  city?: string | null;
  name?: string | null;
  amenities?: string | null;
  facilityType?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  feeConfirmed?: boolean | null;
  feeProgram?: string | null;
}): SubsidyPill | null {
  const stored = confirmedStoredFeeProgram(d);
  if (stored) return FEE_PROGRAMS[stored].badge;
  const province = (d.province || "").trim().toUpperCase();
  if (!province || NO_PILL.has(province)) return null;
  if (province === "SK") return skCoversUnderSix(d) ? "badgeTen" : null;
  if (province === "NU") return nuLicensedCentre(d) ? "badgeTen" : null;
  if (province === "BC") return listedIn(bcYes, d) ? "badgeTen" : null;
  if (province === "QC") return listedIn(qcYes, d) ? "badgeQc965" : null;
  if (province === "NT") return listedIn(ntYes, d) ? "badgeReduced" : null;
  return null;
}

/** Listing subsidies paragraph. One sentence for the pill this centre earned. */
export function subsidyNoteKey(d: {
  province?: string | null;
  city?: string | null;
  name?: string | null;
  amenities?: string | null;
  facilityType?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  feeProgram?: string | null;
}): "subsidyNoteTen" | "subsidyNoteQc" | "subsidyNoteReduced" | "subsidyNoteQcNo" | "cwelccAskNote" {
  const pill = confirmedFeeProgramBadge(d);
  if (pill === "badgeTen") return "subsidyNoteTen";
  if (pill === "badgeQc965") return "subsidyNoteQc";
  if (pill === "badgeReduced") return "subsidyNoteReduced";
  if ((d.province || "").trim().toUpperCase() === "QC") return "subsidyNoteQcNo";
  return "cwelccAskNote";
}

function listedIn(yes: Set<string>, d: { city?: string | null; name?: string | null }) {
  const city = cataloguePlaceKey(d.city);
  const name = catalogueNameKey(d.name);
  if (!city || !name) return false;
  return yes.has(`${city}|${name}`);
}

function skCoversUnderSix(d: {
  amenities?: string | null;
  facilityType?: string | null;
  name?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
}) {
  const facility = classifyFacilityType(d);
  if (facility.type === "school_age" && facility.source !== "fallback") return false;
  if (schoolAgeOnlyAges(d)) return false;
  return true;
}

function nuLicensedCentre(d: {
  amenities?: string | null;
  facilityType?: string | null;
  name?: string | null;
}) {
  const facility = classifyFacilityType(d);
  if (facility.source === "fallback") return true;
  return (
    facility.type === "child_care_centre" ||
    facility.type === "nursery_preschool" ||
    facility.type === "school_age"
  );
}

function schoolAgeOnlyAges(d: {
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
}) {
  const min = Number(d.ageMinMonths);
  const max = Number(d.ageMaxMonths);
  const known =
    d.agesKnown === true ||
    (d.agesKnown !== false && Number.isFinite(min) && Number.isFinite(max) && max > min && max > 0);
  if (!known || !Number.isFinite(min)) return false;
  return min >= 72;
}
