/**
 * Gap-feature rules. No database and no @/ imports.
 * Flags stay off until Kyle sets them. No fees and no checkout.
 */

export const JOB_DESKS = ["public", "parent", "staff", "daycare", "org", "gov"] as const;
export type JobDesk = (typeof JOB_DESKS)[number];

export type JobDeskPowers = {
  browse: boolean;
  apply: boolean;
  post: boolean;
  manage: boolean;
  shortage: boolean;
};

/** Who can do what. Government is counts only. No applicant names. */
export function jobDeskPowers(desk: JobDesk): JobDeskPowers {
  if (desk === "daycare" || desk === "org") {
    return { browse: false, apply: false, post: true, manage: true, shortage: false };
  }
  if (desk === "gov") {
    return { browse: false, apply: false, post: false, manage: false, shortage: true };
  }
  return { browse: true, apply: true, post: false, manage: false, shortage: false };
}

export const CANADA_PROVINCE_CODES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

export type CanadaProvinceCode = (typeof CANADA_PROVINCE_CODES)[number];

const PROVINCE_NAMES: Record<string, CanadaProvinceCode> = {
  alberta: "AB",
  "british columbia": "BC",
  "colombie-britannique": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "nouveau-brunswick": "NB",
  "newfoundland and labrador": "NL",
  "terre-neuve-et-labrador": "NL",
  "nova scotia": "NS",
  "nouvelle-écosse": "NS",
  "northwest territories": "NT",
  "territoires du nord-ouest": "NT",
  nunavut: "NU",
  ontario: "ON",
  "prince edward island": "PE",
  "île-du-prince-édouard": "PE",
  quebec: "QC",
  québec: "QC",
  saskatchewan: "SK",
  yukon: "YT",
};

/** Licence files use a code or a province name. Anything else is left out. */
export function provinceBucket(raw: unknown): string {
  const code = canadaProvinceCode(raw);
  if (code) return code;
  return PROVINCE_NAMES[String(raw ?? "").trim().toLowerCase()] ?? "";
}

export function canadaProvinceCode(raw: unknown): CanadaProvinceCode | null {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  return (CANADA_PROVINCE_CODES as readonly string[]).includes(code) ? (code as CanadaProvinceCode) : null;
}

export type ShortageRow = { province: string; openJobs: number; centres: number };

/** Open ECE postings in one province. A missing row is zero posts, not a guess. */
export function staffingShortage(rows: readonly ShortageRow[], province: string): ShortageRow {
  const code = canadaProvinceCode(province) ?? "";
  const hit = rows.find((row) => row.province.toUpperCase() === code);
  return {
    province: code,
    openJobs: hit ? Math.max(0, Math.floor(hit.openJobs)) : 0,
    centres: hit ? Math.max(0, Math.floor(hit.centres)) : 0,
  };
}

export const JOB_POST_STATUSES = ["open", "closed"] as const;
export type JobPostStatus = (typeof JOB_POST_STATUSES)[number];
export const JOB_APP_STATUSES = ["new", "reviewed", "declined"] as const;
export type JobAppStatus = (typeof JOB_APP_STATUSES)[number];

export function jobPostStatus(raw: unknown): JobPostStatus {
  return raw === "closed" ? "closed" : "open";
}

export function jobAppStatus(raw: unknown): JobAppStatus {
  if (raw === "reviewed" || raw === "declined") return raw;
  return "new";
}

export type RankRow = { id: string; rank: number | null; joinedAt: string; status?: string };

function inLine(row: RankRow): boolean {
  return !row.status || row.status === "waiting" || row.status === "offered";
}

export function orderedByRank(rows: readonly RankRow[]): RankRow[] {
  return rows.filter(inLine).slice().sort((a, b) => {
    const ar = a.rank == null ? 1_000_000 : a.rank;
    const br = b.rank == null ? 1_000_000 : b.rank;
    if (ar !== br) return ar - br;
    const joined = a.joinedAt.localeCompare(b.joinedAt);
    if (joined !== 0) return joined;
    return a.id.localeCompare(b.id);
  });
}

export function placeFromRank(rows: readonly RankRow[], id: string): number | null {
  const index = orderedByRank(rows).findIndex((row) => row.id === id);
  return index < 0 ? null : index + 1;
}

/** Move one waiting family. Returns the full line with ranks 1..n, or null at the end. */
export function moveInLine(rows: readonly RankRow[], id: string, direction: "up" | "down"): RankRow[] | null {
  const ordered = orderedByRank(rows);
  const index = ordered.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const next = direction === "up" ? index - 1 : index + 1;
  if (next < 0 || next >= ordered.length) return null;
  const swapped = ordered.slice();
  const [item] = swapped.splice(index, 1);
  swapped.splice(next, 0, item!);
  return swapped.map((row, i) => ({ ...row, rank: i + 1 }));
}

export const POST_AGES = ["infant", "toddler", "preschool"] as const;
export type PostAge = (typeof POST_AGES)[number];

export function parsePostAge(raw: unknown): PostAge | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (POST_AGES as readonly string[]).includes(value) ? (value as PostAge) : null;
}

export function cleanSpotCount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

/** School-age does not match an infant, toddler, or preschool spot. Blank or any does. */
export function ageFitsSpot(spot: PostAge, personAge: string | null | undefined): boolean {
  const age = String(personAge ?? "")
    .trim()
    .toLowerCase();
  if (!age || age === "any") return true;
  if (age === "school-age" || age === "schoolage") return false;
  return age === spot;
}

export type SpotParent = {
  userId: string;
  waitlistAge: string | null;
  interestAge: string | null;
  saved: boolean;
  searchAges: string[];
};

export function matchOpenSpotParent(spot: PostAge, person: SpotParent): "waitlist" | "saved" | null {
  if (person.waitlistAge) return ageFitsSpot(spot, person.waitlistAge) ? "waitlist" : null;
  if (person.interestAge) return ageFitsSpot(spot, person.interestAge) ? "waitlist" : null;
  if (!person.saved) return null;
  if (person.searchAges.length === 0) return "saved";
  if (person.searchAges.some((age) => ageFitsSpot(spot, age))) return "saved";
  return null;
}

export function openSpotChannels(input: { featureOn: boolean; mailOn: boolean; pushOn: boolean }): {
  inApp: boolean;
  mail: boolean;
  push: boolean;
} {
  if (!input.featureOn) return { inApp: false, mail: false, push: false };
  return { inApp: true, mail: input.mailOn, push: input.pushOn };
}

export function nextDoorAction(last: "check_in" | "check_out" | null): "check_in" | "check_out" {
  return last === "check_in" ? "check_out" : "check_in";
}

function personKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Use the parent's pickup list when one is on file. An empty list does not block the door. */
export function checkoutAllowed(
  pickupName: string,
  contacts: readonly { name: string }[],
): { ok: true; pickup: string } | { ok: false; reason: "need_pickup" | "not_authorized" } {
  const pickup = pickupName.replace(/\s+/g, " ").trim().slice(0, 80);
  if (contacts.length === 0) return { ok: true, pickup };
  if (!personKey(pickup)) return { ok: false, reason: "need_pickup" };
  if (!contacts.some((row) => personKey(row.name) === personKey(pickup))) {
    return { ok: false, reason: "not_authorized" };
  }
  return { ok: true, pickup };
}

export function knownSum(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + Math.floor(value), 0);
}

export function pickCentre(ids: readonly string[], requested: string | null | undefined): string | null {
  const want = String(requested || "").trim();
  if (!want) return null;
  return ids.includes(want) ? want : null;
}

export const GAP_COPY = {
  en: {
    jobsDaycareTitle: "ECE jobs",
    jobsDaycareLead: "Post a role for this centre and read applications here. KidEase does not charge for a posting.",
    jobsOrgTitle: "Jobs at your centres",
    jobsOrgLead: "Post a role at any centre you run. Applications from every centre are in one list.",
    jobsBrowseTitle: "ECE jobs",
    jobsBrowseLead: "Look at open roles and apply with your account. Many parents also work in early childhood education.",
    jobsGovTitle: "Staffing",
    jobsGovLead: "Open ECE postings in this province. Names and emails are not shown.",
    jobsOpen: "Open roles",
    jobsClosed: "Closed",
    jobsClose: "Close posting",
    jobsReopen: "Reopen posting",
    jobsApplicants: "Applicants",
    jobsNone: "No open roles yet.",
    jobsPosted: "Role posted.",
    jobsOff: "The job board is off.",
    role: "Role",
    note: "Short note",
    centre: "Centre",
    post: "Post role",
    reviewed: "Mark reviewed",
    declined: "Decline",
    openJobs: "Open postings",
    hiringCentres: "Centres hiring",
    spotsTitle: "Open spots",
    spotsLead: "Post how many spots are open for an age group. Families who saved this centre or joined the waitlist can be told through the usual mail and phone alerts.",
    spotsAge: "Age group",
    spotsCount: "Spots open",
    spotsPost: "Post open spots",
    spotsPosted: "Open spots saved.",
    spotsOffer: "Offer the next family",
    spotsOff: "Open spots by age are off.",
    infant: "Infant",
    toddler: "Toddler",
    preschool: "Preschool",
    checkTitle: "Check in and out",
    checkLead: "Mark arrival and pickup with the time. If the parent named pickup people, the person at the door must be on that list.",
    checkIn: "Check in",
    checkOut: "Check out",
    pickup: "Pickup person",
    checkSaved: "Saved.",
    checkEmpty: "No enrolled child on this account yet.",
    checkHistory: "Check-in history",
    checkHistoryLead: "Times this centre recorded for your child.",
    checkNone: "No check-in yet.",
    arrived: "Arrived",
    left: "Picked up",
    orgUse: "Work in this centre",
    orgAll: "All centres",
    orgShowing: "Showing",
    orgRequests: "Requests",
    orgStaff: "Staff",
    orgSpots: "Open spots",
    rankUp: "Move up",
    rankDown: "Move down",
    help: "Help",
  },
  fr: {
    jobsDaycareTitle: "Emplois en EPE",
    jobsDaycareLead: "Publiez un poste pour ce centre et lisez les candidatures ici. KidEase ne facture pas une publication.",
    jobsOrgTitle: "Emplois de vos centres",
    jobsOrgLead: "Publiez un poste dans n'importe quel centre que vous dirigez. Les candidatures de tous les centres sont dans une seule liste.",
    jobsBrowseTitle: "Emplois en EPE",
    jobsBrowseLead: "Consultez les postes ouverts et postulez avec votre compte. Plusieurs parents travaillent aussi en éducation à la petite enfance.",
    jobsGovTitle: "Personnel",
    jobsGovLead: "Postes EPE ouverts dans cette province. Les noms et les courriels ne sont pas affichés.",
    jobsOpen: "Postes ouverts",
    jobsClosed: "Fermé",
    jobsClose: "Fermer le poste",
    jobsReopen: "Rouvrir le poste",
    jobsApplicants: "Candidatures",
    jobsNone: "Aucun poste ouvert pour l'instant.",
    jobsPosted: "Poste publié.",
    jobsOff: "Le tableau d'emplois est éteint.",
    role: "Poste",
    note: "Courte note",
    centre: "Centre",
    post: "Publier le poste",
    reviewed: "Marquer comme lu",
    declined: "Refuser",
    openJobs: "Postes ouverts",
    hiringCentres: "Centres qui recrutent",
    spotsTitle: "Places ouvertes",
    spotsLead: "Indiquez combien de places sont ouvertes pour un groupe d'âge. Les familles qui ont enregistré ce centre ou la liste d'attente peuvent être avisées par le courriel et les alertes habituels.",
    spotsAge: "Groupe d'âge",
    spotsCount: "Places ouvertes",
    spotsPost: "Publier les places",
    spotsPosted: "Places enregistrées.",
    spotsOffer: "Offrir à la prochaine famille",
    spotsOff: "Les places par âge sont éteintes.",
    infant: "Poupon",
    toddler: "Tout-petit",
    preschool: "Préscolaire",
    checkTitle: "Arrivée et départ",
    checkLead: "Notez l'arrivée et le départ avec l'heure. Si le parent a nommé des personnes autorisées, la personne à la porte doit être sur cette liste.",
    checkIn: "Arrivée",
    checkOut: "Départ",
    pickup: "Personne qui vient chercher",
    checkSaved: "Enregistré.",
    checkEmpty: "Aucun enfant inscrit sur ce compte pour l'instant.",
    checkHistory: "Historique des arrivées",
    checkHistoryLead: "Heures notées par le centre pour votre enfant.",
    checkNone: "Aucune arrivée pour l'instant.",
    arrived: "Arrivée",
    left: "Départ",
    orgUse: "Travailler dans ce centre",
    orgAll: "Tous les centres",
    orgShowing: "Affiche",
    orgRequests: "Demandes",
    orgStaff: "Personnel",
    orgSpots: "Places ouvertes",
    rankUp: "Monter",
    rankDown: "Descendre",
    help: "Aide",
  },
} as const;

export function gapCopy(locale: "en" | "fr") {
  return locale === "fr" ? GAP_COPY.fr : GAP_COPY.en;
}
