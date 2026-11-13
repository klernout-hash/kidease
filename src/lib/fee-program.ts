/**
 * Sourced parent-fee pills. A pill is a provincial or territorial fact for this
 * centre. It is not a monthly CAD amount, and a harvested "funded" or
 * "ten-a-day" amenity is not a fact.
 *
 * Show "$10 / Day" only when this centre is on a sourced list or has a
 * confirmed stored fee-program code for its province:
 *   Saskatchewan — stored sk-10-day plus known under-six ages
 *   Nunavut — stored nu-10-day plus known preschool ages and facility type
 *   British Columbia — official $10 a Day ChildCareBC list (name + city).
 *     CCFRI is a fee reduction, not $10 a day, and gets no pill until confirmed.
 *   Prince Edward Island — stored pe-10-day (designated Early Years Centre)
 *   Newfoundland and Labrador — stored nl-10-day after that centre is confirmed
 *   Manitoba — stored mb-10-day (funded). The note explains the eligible
 *     schedule's maximum fee; the pill is a program label, not a fee quote.
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
  "sk-10-day": { province: "SK", badge: "badgeTen" },
  "nu-10-day": { province: "NU", badge: "badgeTen" },
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
  "sk-10-day": "sk-10-day",
  "nu-10-day": "nu-10-day",
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
  verified_at: string;
};

const QC_SOURCE =
  "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/tarifs";

function subsidyFact(
  subsidy_type: SubsidyType,
  subsidy_label: string,
  subsidy_label_fr: string,
  subsidy_note: string,
  subsidy_note_fr: string,
  subsidy_source: string,
  verified_at: string = SUBSIDY_VERIFIED_AT,
): ListingSubsidy {
  return {
    subsidy_type,
    subsidy_label,
    subsidy_label_fr,
    subsidy_note,
    subsidy_note_fr,
    subsidy_source,
    verified_at,
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
  verifiedAt: string = SUBSIDY_VERIFIED_AT,
): ListingSubsidy {
  return subsidyFact("ten", "$10 / Day", "10 $ / jour", note, noteFr, source, verifiedAt);
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

function hasAmenity(amenities: string | null | undefined, key: string) {
  return String(amenities ?? "")
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
      "$10 / Day",
      "10 $ / jour",
      "Manitoba funded fee program: parent fee capped at $10/day for eligible 4–10-hour care. Shorter or longer days and school-day schedules differ. Confirm your child’s fee with the centre. Income-tested subsidy is separate.",
      "Programme financé du Manitoba : tarif parental plafonné à 10 $ par jour pour la garde admissible de 4 à 10 heures. Les journées plus courtes, plus longues et scolaires diffèrent. Confirmez le tarif de votre enfant avec le centre. La subvention selon le revenu est distincte.",
      "https://www.gov.mb.ca/education/childcare/families/childcare_fees.html",
      "2026-11-12",
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
  if (stored === "sk-10-day") {
    return skCoversUnderSix(d)
      ? tenDay(
          "Confirmed Saskatchewan regulated fee program for eligible children under 6. Ten or more days cost $217.50 a month; fewer than 10 days cost $10 a day. Confirm eligibility and your child’s schedule with the centre. Income-tested support is separate.",
          "Programme réglementé confirmé de la Saskatchewan pour les enfants admissibles de moins de 6 ans. Dix jours ou plus coûtent 217,50 $ par mois; moins de 10 jours coûtent 10 $ par jour. Confirmez l’admissibilité et l’horaire de votre enfant avec le centre. L’aide selon le revenu est distincte.",
          "https://www.saskatchewan.ca/residents/family-and-social-support/child-care/child-care-in-saskatchewan",
          "2026-11-12",
        )
      : null;
  }
  if (stored === "nu-10-day") {
    return nuPreschoolProgram(d)
      ? tenDay(
          "Confirmed Nunavut participating licensed program for eligible preschool care. Confirm your child’s eligibility, schedule and parent fee with the centre. Other parental subsidies have separate rules.",
          "Programme agréé participant confirmé du Nunavut pour la garde préscolaire admissible. Confirmez l’admissibilité, l’horaire et le tarif parental de votre enfant avec le centre. Les autres subventions parentales ont leurs propres règles.",
          "https://www.gov.nu.ca/en/education-and-schools/affordable-child-care",
          "2026-11-12",
        )
      : null;
  }

  const province = (d.province || "").trim().toUpperCase();
  if (!province || NO_PILL.has(province)) return null;
  if (province === "BC") return listedIn(bcYes, d) ? bcTen() : null;
  if (province === "QC") return listedIn(qcYes, d) ? qcSubsidized() : null;
  if (province === "NT") return listedIn(ntYes, d) ? ntReduced() : null;
  return null;
}

function bcTen() {
  return tenDay(
    "On the British Columbia $10 a Day list published by the province. CCFRI is a separate fee reduction, not $10 a day.",
    "Sur la liste 10 $ par jour publiée par la Colombie-Britannique. Le CCFRI est une réduction distincte, pas un tarif de 10 $ par jour.",
    subsidyYes.bcSource,
  );
}

function qcSubsidized() {
  return subsidyFact(
    "qc_965",
    "$9.65/day subsidized",
    "9,65 $/jour subventionné",
    "Quebec subsidized place (CPE or subsidized garderie). The 2026 reduced contribution is $9.65 a day. Checked 1 November 2026.",
    "Place subventionnée au Québec (CPE ou garderie subventionnée). La contribution réduite de 2026 est de 9,65 $ par jour. Vérifié le 1er novembre 2026.",
    QC_SOURCE,
    "2026-11-01",
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
}):
  "subsidyNoteTen" | "subsidyNoteQc" | "subsidyNoteReduced" | "subsidyNoteQcNo" | "cwelccAskNote" {
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
  return hasKnownPreschoolAges(d);
}

function nuPreschoolProgram(d: {
  amenities?: string | null;
  facilityType?: string | null;
  name?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
}) {
  const facility = classifyFacilityType(d);
  return (
    facility.source !== "fallback" && facility.type !== "school_age" && hasKnownPreschoolAges(d)
  );
}

function hasKnownPreschoolAges(d: {
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
}) {
  const min = d.ageMinMonths;
  const max = d.ageMaxMonths;
  const known =
    d.agesKnown !== false &&
    typeof min === "number" &&
    Number.isFinite(min) &&
    min >= 0 &&
    typeof max === "number" &&
    Number.isFinite(max) &&
    max > min;
  return known && min < 72;
}
