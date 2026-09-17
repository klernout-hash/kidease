import { normalizePlace } from "./listing-match.ts";

/** Exact English API / provider-desk string for a duplicate create. */
export const DUPLICATE_LISTING_MESSAGE = "Daycare already Listed";

/** FR-CA user-facing twin of DUPLICATE_LISTING_MESSAGE. */
export const DUPLICATE_LISTING_MESSAGE_FR = "Garderie déjà inscrite";

export const DAYCARE_ALREADY_LISTED = DUPLICATE_LISTING_MESSAGE;

export type ListingIdentityInput = {
  name: string;
  city: string;
  address?: string | null;
  province?: string | null;
  postalCode?: string | null;
  licenseNumber?: string | null;
};

export type ExistingListingIdentity = ListingIdentityInput & {
  id?: string;
  userId?: string | null;
};

export type DuplicateListingKind = "same_owner" | "other_account" | "catalogue";

export type DuplicateListingHit = {
  kind: DuplicateListingKind;
  id?: string;
  message: typeof DUPLICATE_LISTING_MESSAGE;
};

export type ListingCreateDuplicateResult = {
  ok: false;
  message: typeof DUPLICATE_LISTING_MESSAGE;
};

const LICENSE_NOISE = new Set(["na", "n/a", "none", "null", "unknown", "tbd"]);

export function normalizeListingField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function listingIdentityKey(input: { name: string; address: string; city: string }): string {
  return [
    normalizeListingField(input.name),
    normalizeListingField(input.address),
    normalizeListingField(input.city),
  ].join("|");
}

export function normalizePostal(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function normalizeLicenseNumber(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** "Kids World Daycare" and "Kids World" collapse to the same centre name. */
export function normalizeCentreName(value: string): string {
  return normalizePlace(value)
    .replace(
      /\b(the|daycare|daycares|day care|child care|childcare|early learning|centre|center|inc|ltd|limited|corp|corporation)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function filled(value: string | null | undefined): value is string {
  return Boolean((value || "").trim());
}

function sameNormalized(
  a: string | null | undefined,
  b: string | null | undefined,
  normalize: (value: string) => string,
): boolean {
  if (!filled(a) || !filled(b)) return false;
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left) && left === right;
}

export function meaningfulLicense(value: string | null | undefined): string | null {
  if (!filled(value)) return null;
  const normalized = normalizeLicenseNumber(value);
  if (normalized.length < 3 || LICENSE_NOISE.has(normalized)) return null;
  return normalized;
}

export function sameLicenseNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = meaningfulLicense(a);
  const right = meaningfulLicense(b);
  return Boolean(left && right && left === right);
}

function sameProvince(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!filled(a) || !filled(b)) return true;
  return normalizePlace(a) === normalizePlace(b);
}

/**
 * Same physical / legal centre.
 * - licence number (when both present)
 * - address + postal
 * - address + city + province (same-address orphan with a missing postal)
 * - normalized name + city + province
 */
export function sameDaycareListing(
  incoming: ListingIdentityInput,
  existing: ListingIdentityInput,
  _opts?: { sameOwner?: boolean },
): boolean {
  if (sameLicenseNumber(incoming.licenseNumber, existing.licenseNumber)) return true;

  const sameName = sameNormalized(incoming.name, existing.name, normalizeCentreName);
  const sameCity = sameNormalized(incoming.city, existing.city, normalizePlace);
  const sameAddress = sameNormalized(incoming.address, existing.address, normalizePlace);
  const samePostal = sameNormalized(incoming.postalCode, existing.postalCode, normalizePostal);
  const provinceOk = sameProvince(incoming.province, existing.province);

  if (sameAddress && samePostal) return true;
  if (sameAddress && sameCity && provinceOk) return true;
  if (sameName && sameCity && provinceOk) return true;
  return false;
}

export function findDuplicateListing(
  incoming: ListingIdentityInput,
  existing: ExistingListingIdentity[],
  actorUserId: string,
): DuplicateListingHit | null {
  const actor = actorUserId.trim();
  let fallback: DuplicateListingHit | null = null;

  for (const row of existing) {
    const sameOwner = Boolean(actor && row.userId && row.userId === actor);
    if (!sameDaycareListing(incoming, row, { sameOwner })) continue;
    const hit: DuplicateListingHit = {
      kind: sameOwner ? "same_owner" : row.userId ? "other_account" : "catalogue",
      id: row.id,
      message: DUPLICATE_LISTING_MESSAGE,
    };
    if (hit.kind === "same_owner") return hit;
    fallback ??= hit;
  }

  return fallback;
}

/** JSON body createListing (and twin create paths) return on a duplicate. */
export function listingCreateDuplicateResult(): ListingCreateDuplicateResult {
  return { ok: false, message: DUPLICATE_LISTING_MESSAGE };
}

export function duplicateListingError(): Error {
  return new Error(DUPLICATE_LISTING_MESSAGE);
}

export function duplicateListingUserMessage(locale?: string): string {
  return locale === "fr" ? DUPLICATE_LISTING_MESSAGE_FR : DUPLICATE_LISTING_MESSAGE;
}

function foldAccents(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function isDaycareAlreadyListedMessage(message: string): boolean {
  const normalized = foldAccents(message.trim().toLowerCase());
  return (
    normalized === DUPLICATE_LISTING_MESSAGE.toLowerCase() ||
    normalized === foldAccents(DUPLICATE_LISTING_MESSAGE_FR.toLowerCase()) ||
    normalized.includes("daycare already listed") ||
    normalized.includes("garderie deja inscrite")
  );
}

function collectErrorMessages(err: unknown, seen = new Set<unknown>(), out: string[] = []): string[] {
  if (err == null || seen.has(err)) return out;
  if (typeof err === "string") {
    out.push(err);
    return out;
  }
  if (typeof err !== "object") return out;
  seen.add(err);
  if (err instanceof Error) {
    if (err.message) out.push(err.message);
    collectErrorMessages(err.cause, seen, out);
  }
  const rec = err as Record<string, unknown>;
  for (const key of ["message", "error", "data", "cause", "result", "reason"]) {
    if (key in rec) {
      const val = rec[key];
      if (typeof val === "string") out.push(val);
      else collectErrorMessages(val, seen, out);
    }
  }
  return out;
}

export function listingCreateErrorMessage(err: unknown): string {
  const messages = collectErrorMessages(err);
  for (const message of messages) {
    if (isDaycareAlreadyListedMessage(message)) return DUPLICATE_LISTING_MESSAGE;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}

/** Map a guard throw / nested Start error onto the createListing API body. */
export function resolveCreateListingDuplicate(err: unknown): ListingCreateDuplicateResult | null {
  const message = listingCreateErrorMessage(err);
  if (!isDaycareAlreadyListedMessage(message)) return null;
  return listingCreateDuplicateResult();
}
