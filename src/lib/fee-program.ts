/**
 * Sourced parent-fee pills. A pill is a provincial or territorial fact for this
 * centre. It is not a monthly CAD amount, and a harvested "funded" or
 * "ten-a-day" amenity is not a fact.
 *
 * Show "$10/day" for every licensed program the rule covers:
 *   Saskatchewan, children under 6 (school-age-only programs stay off)
 *   Nunavut licensed centres (family and group homes stay off)
 * Show "$10/day" only when this centre is on a sourced list:
 *   British Columbia — official $10 a Day ChildCareBC list (name + city).
 *     CCFRI is a fee reduction, not $10 a day, and gets no pill until confirmed.
 *   Prince Edward Island — stored pe-10-day (designated Early Years Centre)
 *   Newfoundland and Labrador — stored nl-10-day after that centre is confirmed
 * Show "$10/day max" only for Manitoba fee program mb-10-day (funded).
 * Show "$9.65/day subsidized" only for Quebec services marked contribution réduite (subv=CR).
 * Show "Reduced fees" only where the NWT directory says subsidy=Yes or free,
 *   or a stored yt-reduced / nt-reduced code. Never show "$10/day" for NT or YT.
 * Never show a $10, $15, or $22 pill for Ontario, Alberta, New Brunswick,
 * or Nova Scotia until a high-confidence flag exists.
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

export const SUBSIDY_VERIFIED_AT = "2026-09-30" as const;

export type SubsidyType = "ten" | "ten_max" | "qc_965" | "reduced";

/** Pill data stored for one listing. Cards print subsidy_label. They do not pick an amount from the province. */
export type ListingSubsidy = {
  subsidy_type: SubsidyType;
  subsidy_label: string;
  subsidy_label_fr: string;
  subsidy_note: string;
  subsidy_note_fr: string;
  subsidy_source: string;
  verified_at: typeof SUBSIDY_VERIFIED_AT;
};

const QC_SOURCE = "https://www.mfa.gouv.qc.ca/fr/services-de-garde/parents/tarification/Pages/index.aspx";

function subsidyFact(
  subsidy_type: SubsidyType,
  subsidy_label: string,
  subsidy_label_fr: string,
  subsidy_note: string,
  subsidy_note_fr: string,
  subsidy_source: string,
): ListingSubsidy {
  return {
    subsidy_type,
    subsidy_label,
    subsidy_label_fr,
    subsidy_note,
    subsidy_note_fr,
    subsidy_source,
    verified_at: SUBSIDY_VERIFIED_AT,
  };
}

type SubsidyInput = {
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
};

function tenDay(
  note: string,
  noteFr: string,
  source: string,
): ListingSubsidy {
  return subsidyFact("ten", "$10/day", "10 $/jour", note, noteFr, source);
}

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
 * Pill for this centre only. A claimed listing and a harvested amenity do not create one.
 * Québec is never stamped $10. Alberta is never stamped $15. Ontario, Alberta,
 * New Brunswick, and Nova Scotia stay blank until a high-confidence flag exists.
 */
export function listingSubsidy(d: SubsidyInput): ListingSubsidy | null {
  const stored = confirmedStoredFeeProgram(d);
  if (stored === "mb-10-day") {
    return subsidyFact(
      "ten_max",
      "$10/day max",
      "10 $/jour max.",
      "Manitoba funded centre, parent fee capped at $10/day for 4–10 hours.",
      "Centre financé du Manitoba. Le tarif parental est plafonné à 10 $ par jour pour 4 à 10 heures.",
      "https://www.gov.mb.ca/education/childcare/families/childcare_fees.html",
    );
  }
  if (stored === "pe-10-day") {
    return tenDay(
      "Designated Prince Edward Island Early Years Centre. Parent fee is $10 a day from birth to school entry.",
      "Centre de la petite enfance désigné de l’Île-du-Prince-Édouard. Tarif parental de 10 $ par jour, de la naissance à l’entrée à l’école.",
      "https://www.princeedwardisland.ca/en/information/education-and-early-years/licensed-early-learning-and-child-care",
    );
  }
  if (stored === "nl-10-day") {
    return tenDay(
      "Confirmed in Newfoundland and Labrador’s operating grant. The parent fee is $10 a day.",
      "Confirmé dans la subvention de fonctionnement de Terre-Neuve-et-Labrador. Le tarif parental est de 10 $ par jour.",
      "https://www.gov.nl.ca/education/childcare/",
    );
  }
  if (stored === "bc-10-day") return bcTen();
  if (stored === "qc-9-65") return qcSubsidized();
  if (stored === "nt-reduced") return ntReduced();
  if (stored === "yt-reduced") return ytReduced();

  const province = (d.province || "").trim().toUpperCase();
  if (!province || NO_PILL.has(province)) return null;
  if (province === "SK") {
    return skCoversUnderSix(d)
      ? tenDay(
          "Saskatchewan licensed child care for children under 6. The parent fee is $10 a day.",
          "Garde permise en Saskatchewan pour les enfants de moins de 6 ans. Le tarif parental est de 10 $ par jour.",
          "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
        )
      : null;
  }
  if (province === "NU") {
    return nuLicensedCentre(d)
      ? tenDay(
          "Nunavut licensed child care centre. The parent fee is $10 a day.",
          "Centre de garde permis du Nunavut. Le tarif parental est de 10 $ par jour.",
          "https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care",
        )
      : null;
  }
  if (province === "BC") return listedIn(bcYes, d) ? bcTen() : null;
  if (province === "QC") return listedIn(qcYes, d) ? qcSubsidized() : null;
  if (province === "NT") return listedIn(ntYes, d) ? ntReduced() : null;
  return null;
}

function bcTen() {
  return tenDay(
    "On the official British Columbia $10 a Day list. CCFRI is a separate fee reduction, not $10 a day.",
    "Sur la liste officielle 10 $ par jour de la Colombie-Britannique. Le CCFRI est une réduction distincte, pas un tarif de 10 $ par jour.",
    subsidyYes.bcSource,
  );
}

function qcSubsidized() {
  return subsidyFact(
    "qc_965",
    "$9.65/day subsidized",
    "9,65 $/jour subventionné",
    "Quebec subsidized place (CPE or subsidized garderie). The 2026 reduced contribution is $9.65 a day.",
    "Place subventionnée au Québec (CPE ou garderie subventionnée). La contribution réduite de 2026 est de 9,65 $ par jour.",
    QC_SOURCE,
  );
}

function ntReduced() {
  return subsidyFact(
    "reduced",
    "Reduced fees",
    "Frais réduits",
    "Northwest Territories fee reduction. $10 a day is a territory average, not a cap.",
    "Réduction des frais des Territoires du Nord-Ouest. 10 $ par jour est une moyenne territoriale, pas un plafond.",
    "https://www.ece.gov.nt.ca/en/average-10-day-child-care",
  );
}

function ytReduced() {
  return subsidyFact(
    "reduced",
    "Reduced fees",
    "Frais réduits",
    "Yukon fee reduction. $10 a day is a territory average, not a cap.",
    "Réduction des frais du Yukon. 10 $ par jour est une moyenne territoriale, pas un plafond.",
    "https://yukon.ca/en/universal-child-care",
  );
}

export function subsidyLabel(subsidy: ListingSubsidy, locale: string) {
  return locale === "fr" ? subsidy.subsidy_label_fr : subsidy.subsidy_label;
}

export function subsidyNote(subsidy: ListingSubsidy, locale: string) {
  return locale === "fr" ? subsidy.subsidy_note_fr : subsidy.subsidy_note;
}

/**
 * Badge key kept for search filters. The words on the card come from listingSubsidy.
 */
export function confirmedFeeProgramBadge(d: SubsidyInput): SubsidyPill | null {
  const subsidy = listingSubsidy(d);
  if (!subsidy) return null;
  if (subsidy.subsidy_type === "qc_965") return "badgeQc965";
  if (subsidy.subsidy_type === "reduced") return "badgeReduced";
  return "badgeTen";
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
