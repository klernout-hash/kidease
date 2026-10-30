/**
 * Daycare desk missing-info to-do. Tells a centre exactly what to upload or
 * complete, with a deep link to the field. Desk-only: does not change
 * Listing Verified, public ranking, or quality scores.
 * Relative imports only so Node tests can load this file.
 */
import {
  hasConfirmedAges,
  hasListedCapacity,
  hasListedHours,
  hasRealPhoto,
  hasVacancyConfirm,
  hasVerifiedLicense,
  type ListingCoachHref,
} from "./listing-verified.ts";

export const MISSING_INFO_FIELDS = ["license", "fees", "hours", "spots", "contact", "ages", "photos"] as const;
export type MissingInfoField = (typeof MISSING_INFO_FIELDS)[number];

export type MissingInfoInput = {
  id?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  licensePhotoOnFile?: boolean | null;
  licensedCapacity?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  hours?: string | null;
  lastVacancyUpdatedAt?: string | null;
  spotsUpdatedAt?: string | null;
  phone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  photos?: string[] | null;
};

export type MissingInfoItem = {
  field: MissingInfoField;
  /** Sub-gaps for a precise message, e.g. ["phone", "website"]. */
  detail: string[];
  href: ListingCoachHref;
};

type Locale = "en" | "fr";

const TITLE: Record<MissingInfoField, Record<Locale, string>> = {
  license: { en: "Licence", fr: "Permis" },
  fees: { en: "Fees", fr: "Tarifs" },
  hours: { en: "Hours", fr: "Heures" },
  spots: { en: "Spots and capacity", fr: "Places et capacité" },
  contact: { en: "Contact details", fr: "Coordonnées" },
  ages: { en: "Ages", fr: "Âges" },
  photos: { en: "Photos", fr: "Photos" },
};

const HOW: Record<MissingInfoField, Record<Locale, string>> = {
  license: {
    en: "Upload a photo or PDF of your provincial licence and enter the licence number so we can verify it.",
    fr: "Téléversez une photo ou un PDF de votre permis provincial et inscrivez le numéro de permis pour que nous puissions le vérifier.",
  },
  fees: {
    en: "Enter your monthly fee for each age group you serve (infant, toddler, preschool, part-time).",
    fr: "Inscrivez votre tarif mensuel pour chaque groupe d’âge offert (poupon, bambin, préscolaire, temps partiel).",
  },
  hours: {
    en: "Add your opening hours, for example Mon–Fri 7:00–18:00.",
    fr: "Ajoutez vos heures d’ouverture, par exemple lun.–ven. 7 h–18 h.",
  },
  spots: {
    en: "Enter your licensed capacity and confirm how many spots are open by age group.",
    fr: "Inscrivez votre capacité autorisée et confirmez le nombre de places libres par groupe d’âge.",
  },
  contact: {
    en: "Add a phone number, email and website so parents can reach you.",
    fr: "Ajoutez un numéro de téléphone, un courriel et un site Web pour que les parents puissent vous joindre.",
  },
  ages: {
    en: "Set the youngest and oldest ages you accept.",
    fr: "Indiquez l’âge minimum et maximum que vous acceptez.",
  },
  photos: {
    en: "Upload at least one real photo of your building or entrance. No stock photos or photos showing children’s faces.",
    fr: "Téléversez au moins une vraie photo de votre bâtiment ou de l’entrée. Pas de photos d’archives ni de visages d’enfants.",
  },
};

const DETAIL: Record<string, Record<Locale, string>> = {
  licence_photo: { en: "licence photo", fr: "photo du permis" },
  licence_number: { en: "verified licence number", fr: "numéro de permis vérifié" },
  capacity: { en: "licensed capacity", fr: "capacité autorisée" },
  open_spots: { en: "open spots", fr: "places libres" },
  phone: { en: "phone", fr: "téléphone" },
  email: { en: "email", fr: "courriel" },
  website: { en: "website", fr: "site Web" },
};

function present(v?: string | null) {
  const s = (v || "").trim();
  return Boolean(s && s !== "—" && s !== "-");
}

function hasListedMonthlyFees(d: MissingInfoInput) {
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].some((n) => n != null && n > 0);
}

export function centreMissingInfo(d: MissingInfoInput): MissingInfoItem[] {
  const out: MissingInfoItem[] = [];
  const lic: string[] = [];
  if (!d.licensePhotoOnFile) lic.push("licence_photo");
  if (!hasVerifiedLicense({ id: d.id, licenseNumber: d.licenseNumber, licenseStatus: d.licenseStatus })) lic.push("licence_number");
  if (lic.length) out.push({ field: "license", detail: lic, href: { desk: "licence", focus: "license" } });
  if (!hasListedMonthlyFees(d)) out.push({ field: "fees", detail: [], href: { desk: "listings", focus: "fees" } });
  if (!hasListedHours(d.hours)) out.push({ field: "hours", detail: [], href: { desk: "listings", focus: "hours" } });
  const spots: string[] = [];
  if (!hasListedCapacity(d.licensedCapacity)) spots.push("capacity");
  if (!hasVacancyConfirm(d)) spots.push("open_spots");
  if (spots.length) {
    out.push({
      field: "spots",
      detail: spots,
      href: spots[0] === "capacity" ? { desk: "licence", focus: "capacity" } : { desk: "listings", focus: "vacancy" },
    });
  }
  const contact: string[] = [];
  if (!present(d.phone)) contact.push("phone");
  if (!present(d.contactEmail)) contact.push("email");
  if (!present(d.website)) contact.push("website");
  if (contact.length) out.push({ field: "contact", detail: contact, href: { desk: "listings", focus: "contact" } });
  if (!hasConfirmedAges(d)) out.push({ field: "ages", detail: [], href: { desk: "listings", focus: "ages" } });
  if (!hasRealPhoto(d.photos)) out.push({ field: "photos", detail: [], href: { desk: "listings", focus: "photo" } });
  return out;
}

export function missingInfoTitle(field: MissingInfoField, locale: string) {
  return TITLE[field][locale === "fr" ? "fr" : "en"];
}

/** "What to upload / complete" line, with the exact sub-gaps when known. */
export function missingInfoMessage(item: MissingInfoItem, locale: string) {
  const l: Locale = locale === "fr" ? "fr" : "en";
  const how = HOW[item.field][l];
  if (!item.detail.length) return how;
  const list = item.detail.map((k) => DETAIL[k]?.[l] ?? k).join(", ");
  return l === "fr" ? `Manquant : ${list}. ${how}` : `Missing: ${list}. ${how}`;
}
