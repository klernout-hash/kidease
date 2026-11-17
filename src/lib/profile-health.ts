/**
 * Profile health: one score that Admin and the daycare both see.
 * Weighted toward what parents use on the public listing card to decide.
 * Pure, no @/ aliases, so unit tests import it directly.
 */

export const HEALTHY_PHOTO_COUNT = 10;
export const READY_SCORE = 90;
/** Under this many days to expiry the licence shows amber. */
export const LICENCE_EXPIRY_WARN_DAYS = 60;

export type HealthState = "good" | "warn" | "missing";

export type HealthCheckId =
  | "licence"
  | "licence_file"
  | "licence_expiry"
  | "screening"
  | "photos"
  | "fees"
  | "ages"
  | "hours"
  | "contact";

export type HealthCheck = {
  id: HealthCheckId;
  state: HealthState;
  /** Points earned out of `weight`. */
  points: number;
  weight: number;
  /** Short line for the card, e.g. "6 of 10 photos". */
  label: { en: string; fr: string };
};

export type ProfileHealthInput = {
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  registryMatchState?: string | null;
  licensePhoto?: string | null;
  /** YYYY-MM-DD */
  licenseExpiry?: string | null;
  screeningOnFile?: boolean | null;
  staffScreeningAttested?: boolean | null;
  photoCount?: number | null;
  hasFees?: boolean | null;
  hasAges?: boolean | null;
  hasHours?: boolean | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export type ProfileHealth = {
  score: number;
  checks: HealthCheck[];
  /** Green: score at READY_SCORE or more and licence + screening all green. */
  ready: boolean;
  /** What Admin needs before Approve works at all: a photo, a valid licence, fees and ages. */
  minimumMet: boolean;
  /** Plain list of what blocks Approve. */
  blockers: Array<{ en: string; fr: string }>;
  band: "ready" | "almost" | "needs_work";
};

/** Points per check. Sums to 100. Public-card facts weigh the most. */
export const HEALTH_WEIGHTS: Record<HealthCheckId, number> = {
  licence: 15,
  licence_file: 10,
  licence_expiry: 10,
  screening: 10,
  photos: 20,
  fees: 12,
  ages: 10,
  hours: 8,
  contact: 5,
};

const DAY_MS = 86_400_000;

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function monthYear(iso: string, fr: boolean): string {
  const at = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString(fr ? "fr-CA" : "en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function licenceExpiryState(expiry: string | null | undefined, now: Date = new Date()): {
  state: HealthState;
  daysLeft: number | null;
} {
  const iso = clean(expiry).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { state: "missing", daysLeft: null };
  const at = Date.parse(`${iso}T23:59:59Z`);
  if (Number.isNaN(at)) return { state: "missing", daysLeft: null };
  const daysLeft = Math.floor((at - now.getTime()) / DAY_MS);
  if (daysLeft < 0) return { state: "missing", daysLeft };
  if (daysLeft <= LICENCE_EXPIRY_WARN_DAYS) return { state: "warn", daysLeft };
  return { state: "good", daysLeft };
}

function licenceBlocked(status: string | null | undefined): boolean {
  const s = clean(status).toLowerCase();
  return s === "expired" || s === "suspended";
}

export function profileHealth(input: ProfileHealthInput, now: Date = new Date()): ProfileHealth {
  const w = HEALTH_WEIGHTS;
  const checks: HealthCheck[] = [];
  const add = (id: HealthCheckId, state: HealthState, points: number, en: string, fr: string) =>
    checks.push({ id, state, points: Math.max(0, Math.min(w[id], Math.round(points))), weight: w[id], label: { en, fr } });

  const number = clean(input.licenseNumber);
  const matched = clean(input.registryMatchState) === "matched" || clean(input.licenseStatus) === "matched";
  const statusBad = licenceBlocked(input.licenseStatus);
  if (!number || statusBad) {
    add(
      "licence",
      "missing",
      0,
      statusBad ? `Licence ${clean(input.licenseStatus).toLowerCase()}` : "No licence number",
      statusBad ? "Permis non valide" : "Aucun numéro de permis",
    );
  } else if (matched) {
    add("licence", "good", w.licence, `Licence ${number} · registry match`, `Permis ${number} · registre confirmé`);
  } else {
    add("licence", "warn", w.licence * 0.6, `Licence ${number} · not matched yet`, `Permis ${number} · pas encore confirmé`);
  }

  const hasFile = Boolean(clean(input.licensePhoto));
  add("licence_file", hasFile ? "good" : "missing", hasFile ? w.licence_file : 0, hasFile ? "Licence file uploaded" : "Licence file missing", hasFile ? "Permis téléversé" : "Permis à téléverser");

  const expiry = licenceExpiryState(input.licenseExpiry, now);
  const iso = clean(input.licenseExpiry).slice(0, 10);
  if (expiry.state === "good") {
    add("licence_expiry", "good", w.licence_expiry, `Expires ${monthYear(iso, false)}`, `Expire ${monthYear(iso, true)}`);
  } else if (expiry.state === "warn") {
    add(
      "licence_expiry",
      "warn",
      w.licence_expiry * 0.5,
      `Expires in ${expiry.daysLeft} days`,
      `Expire dans ${expiry.daysLeft} jours`,
    );
  } else if (expiry.daysLeft != null) {
    add("licence_expiry", "missing", 0, `Licence expired ${monthYear(iso, false)}`, `Permis expiré ${monthYear(iso, true)}`);
  } else {
    add("licence_expiry", "missing", 0, "No expiry date", "Aucune date d’expiration");
  }

  if (input.screeningOnFile) add("screening", "good", w.screening, "Staff screening on file", "Filtrage du personnel au dossier");
  else if (input.staffScreeningAttested)
    add("screening", "warn", w.screening * 0.5, "Screening declared, no file", "Filtrage déclaré, sans fichier");
  else add("screening", "missing", 0, "No staff screening", "Aucun filtrage du personnel");

  const photos = Math.max(0, Math.floor(Number(input.photoCount) || 0));
  if (photos >= HEALTHY_PHOTO_COUNT) add("photos", "good", w.photos, `${photos} photos`, `${photos} photos`);
  else if (photos > 0)
    add(
      "photos",
      "warn",
      (w.photos * photos) / HEALTHY_PHOTO_COUNT,
      `${photos} of ${HEALTHY_PHOTO_COUNT} photos`,
      `${photos} photos sur ${HEALTHY_PHOTO_COUNT}`,
    );
  else add("photos", "missing", 0, "No photos", "Aucune photo");

  add("fees", input.hasFees ? "good" : "missing", input.hasFees ? w.fees : 0, input.hasFees ? "Monthly fees" : "No fees", input.hasFees ? "Frais mensuels" : "Aucuns frais");
  add("ages", input.hasAges ? "good" : "missing", input.hasAges ? w.ages : 0, input.hasAges ? "Ages they care for" : "Ages not set", input.hasAges ? "Âges accueillis" : "Âges à indiquer");
  add("hours", input.hasHours ? "good" : "missing", input.hasHours ? w.hours : 0, input.hasHours ? "Hours" : "No hours", input.hasHours ? "Heures" : "Aucune heure");

  const reach = Boolean(clean(input.phone) || clean(input.email));
  const place = Boolean(clean(input.address));
  const contactPoints = (reach ? 0.6 : 0) + (place ? 0.4 : 0);
  add(
    "contact",
    reach && place ? "good" : reach || place ? "warn" : "missing",
    w.contact * contactPoints,
    reach && place ? "Contact and address" : !reach ? "No phone or email" : "No street address",
    reach && place ? "Contact et adresse" : !reach ? "Aucun téléphone ni courriel" : "Aucune adresse",
  );

  const score = checks.reduce((sum, c) => sum + c.points, 0);
  const byId = (id: HealthCheckId) => checks.find((c) => c.id === id)!;

  // Valid = a number on file, not marked expired or suspended, and not past its expiry date.
  const licenceValid = Boolean(number) && !statusBad && !(expiry.daysLeft != null && expiry.daysLeft < 0);
  const blockers: Array<{ en: string; fr: string }> = [];
  if (photos < 1) blockers.push({ en: "Add at least 1 photo", fr: "Ajoutez au moins 1 photo" });
  if (!licenceValid)
    blockers.push({ en: "Needs a valid licence (number on file, not expired)", fr: "Un permis valide est requis (numéro au dossier, non expiré)" });
  if (!input.hasFees) blockers.push({ en: "Add monthly fees", fr: "Ajoutez les frais mensuels" });
  if (!input.hasAges) blockers.push({ en: "Add the ages they care for", fr: "Ajoutez les âges accueillis" });
  const minimumMet = blockers.length === 0;

  const coreGreen = (["licence", "licence_file", "licence_expiry", "screening"] as const).every((id) => byId(id).state === "good");
  const ready = minimumMet && coreGreen && score >= READY_SCORE;
  const band: ProfileHealth["band"] = ready ? "ready" : minimumMet && score >= 70 ? "almost" : "needs_work";
  return { score, checks, ready, minimumMet, blockers, band };
}

/** Admin sort: ready first, then by score. */
export function compareHealth(a: ProfileHealth, b: ProfileHealth): number {
  const rank = (h: ProfileHealth) => (h.band === "ready" ? 0 : h.band === "almost" ? 1 : 2);
  return rank(a) - rank(b) || b.score - a.score;
}

/** The daycares columns the score reads. Admin and the daycare desk both pass this exact row. */
export type DaycareHealthRow = {
  photos: string | null;
  license_number: string | null;
  license_status: string | null;
  license_expiry: string | null;
  registry_match_state: string | null;
  license_photo: string | null;
  screening_on_file: boolean | number | null;
  staff_screening_attested: boolean | number | null;
  province: string | null;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
  part_time_monthly: number | null;
  ages_confirmed: number | boolean | null;
  age_min_months: number | null;
  age_max_months: number | null;
  hours: string | null;
  phone: string | null;
  contact_email: string | null;
  address: string | null;
};
