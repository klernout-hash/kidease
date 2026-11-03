/**
 * Home daycare address rules. Pure helpers safe for the browser.
 * The map offset lives in the server module so the client bundle cannot
 * reverse a public circle back to the door.
 */

import { normalizeFacilityType } from "./facility-type.ts";

const HOME_AMENITIES = new Set(["home", "group-home"]);

const AUTO_PROVIDER_REPLY = [
  "we received your request",
  "nous avons bien reçu la demande",
  "enrolment request received",
  "we've added you to the waitlist",
  "we’ve added you to the waitlist",
];

export type HomeSignals = {
  id?: string | null;
  facilityType?: string | null;
  facility_type?: string | null;
  amenities?: string | null;
  kideaseCategory?: string | null;
  kidease_category?: string | null;
  providerType?: string | null;
  provider_type?: string | null;
  careType?: string | null;
  care_type?: string | null;
  licenceCategory?: string | null;
  licence_category?: string | null;
  programModel?: string | null;
  program_model?: string | null;
  showPublicAddress?: boolean | null;
  show_public_address?: boolean | number | null;
  protectedHome?: boolean | null;
};

export type HomeConnection = {
  tourAccepted?: boolean;
  tourBooked?: boolean;
  enrolled?: boolean;
  waitlistAccepted?: boolean;
  daycareReplied?: boolean;
};

export type HomeAddressAudience = "guest" | "parent" | "owner" | "admin" | "government";

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function amenityKeys(value: unknown): Set<string> {
  return new Set(
    text(value)
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function categoryToken(value: unknown): string {
  return text(value).trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** Family child care, group child care homes, recognized homes, or kidease_category home-based. */
export function isHomeDaycare(row: HomeSignals | null | undefined): boolean {
  if (!row) return false;
  const category = categoryToken(row.kideaseCategory || row.kidease_category);
  if (category === "home-based" || category === "home") return true;
  const provider = text(row.providerType || row.provider_type).trim().toLowerCase();
  if (provider === "milieu_familial_reconnu") return true;
  const facility = normalizeFacilityType(row.facilityType || row.facility_type);
  if (facility === "family_home" || facility === "group_home") return true;
  if (facility === "child_care_centre" || facility === "nursery_preschool" || facility === "school_age") {
    return false;
  }
  const keys = amenityKeys(row.amenities);
  if (keys.has("home") || keys.has("group-home")) return true;
  for (const key of keys) {
    if (HOME_AMENITIES.has(key)) return true;
  }
  const blob = [
    row.careType,
    row.care_type,
    row.licenceCategory,
    row.licence_category,
    row.programModel,
    row.program_model,
  ]
    .map((part) => text(part))
    .join(" ");
  return /\bmilieu familial\b|\brsge\b|\brecognized home\b|\bfamily child care\b|\bgroup child care home\b|\bmilieu_familial_reconnu\b/i.test(
    blob,
  );
}

export function homeAddressIsPublic(row: HomeSignals | null | undefined): boolean {
  if (!row) return false;
  return row.showPublicAddress === true || row.show_public_address === true || row.show_public_address === 1;
}

/** First 3 characters of a Canadian postal code. Empty when it is not an FSA. */
export function postalFsa(postal: string | null | undefined): string {
  const compact = text(postal).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fsa = compact.slice(0, 3);
  return /^[A-Z][0-9][A-Z]$/.test(fsa) ? fsa : "";
}

/** City, neighbourhood, and postal FSA. No street. */
export function publicHomePlace(input: {
  city?: string | null;
  neighbourhood?: string | null;
  postalCode?: string | null;
  province?: string | null;
}): string {
  const city = text(input.city).replace(/\s+/g, " ").trim();
  const hood = text(input.neighbourhood).replace(/\s+/g, " ").trim();
  const fsa = postalFsa(input.postalCode);
  return [city, hood, fsa].filter(Boolean).join(" · ");
}

/** Nearest kilometre, at least 1. "about 2 km". */
export function approximateDistanceKm(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return km;
  return Math.max(1, Math.round(km));
}

export function homeConnectionUnlocked(connection: HomeConnection | boolean | null | undefined): boolean {
  if (connection === true) return true;
  if (!connection || typeof connection === "boolean") return false;
  return Boolean(
    connection.tourAccepted ||
      connection.tourBooked ||
      connection.enrolled ||
      connection.waitlistAccepted ||
      connection.daycareReplied,
  );
}

/** A booked slot or an accepted tour. A pending request with no slot stays hidden. */
export function tourUnlocksHomeAddress(input: { status?: string | null; windowId?: string | null }): boolean {
  const status = text(input.status).trim().toLowerCase();
  if (status === "accepted" || status === "completed" || status === "enrolled") return true;
  return Boolean(text(input.windowId).trim());
}

export function enrolmentUnlocksHomeAddress(status?: string | null): boolean {
  const value = text(status).trim().toLowerCase();
  return value === "sent" || value === "parent_signed" || value === "completed" || value === "accepted" || value === "active";
}

export function waitlistUnlocksHomeAddress(status?: string | null): boolean {
  return text(status).trim().toLowerCase() === "accepted";
}

export function bookingUnlocksHomeAddress(status?: string | null): boolean {
  const value = text(status).trim().toLowerCase();
  return value === "accepted" || value === "active";
}

/** A real daycare reply. Automatic "we received your request" notes do not count. */
export function providerReplyUnlocksAddress(body: string | null | undefined): boolean {
  const value = text(body).trim().toLowerCase();
  if (!value) return false;
  return !AUTO_PROVIDER_REPLY.some((line) => value.includes(line));
}

const PUBLISH_CLAIM = new Set(["verified", "approved", "live", "active", "published"]);

/** Claimed listing whose owner has been verified. Pending claims cannot opt in. */
export function verifiedOwnerClaim(claimStatus?: string | null, claimedAt?: string | null): boolean {
  if (!text(claimedAt).trim()) return false;
  return PUBLISH_CLAIM.has(text(claimStatus).trim().toLowerCase());
}

export function maySeeHomeAddress(input: {
  home: boolean;
  publicOptIn?: boolean;
  audience: HomeAddressAudience;
  connected?: HomeConnection | boolean | null;
}): boolean {
  if (!input.home) return true;
  if (input.publicOptIn) return true;
  if (input.audience === "admin" || input.audience === "government" || input.audience === "owner") return true;
  return homeConnectionUnlocked(input.connected);
}

/** Full street for someone who may see it. City and FSA for everyone else. */
export function addressLineForViewer(input: {
  address?: string | null;
  city?: string | null;
  neighbourhood?: string | null;
  province?: string | null;
  postalCode?: string | null;
  seeExact: boolean;
}): string {
  if (input.seeExact) {
    return [input.address, input.city, input.province, input.postalCode]
      .map((part) => text(part).trim())
      .filter(Boolean)
      .join(", ");
  }
  const place = publicHomePlace(input);
  const province = text(input.province).trim();
  return [place, province].filter(Boolean).join(", ");
}
