import { normalizePlace } from "./listing-match.ts";

/** Exact provider-desk toast / server error for a duplicate create. */
export const DAYCARE_ALREADY_LISTED = "Daycare already Listed";

export const DUPLICATE_LISTING_MESSAGE = DAYCARE_ALREADY_LISTED;

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
  message: typeof DAYCARE_ALREADY_LISTED;
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
 * - name + city + province, plus address or postal
 * Same-owner also matches on name + city + province alone (repeat create).
 */
export function sameDaycareListing(
  incoming: ListingIdentityInput,
  existing: ListingIdentityInput,
  opts?: { sameOwner?: boolean },
): boolean {
  if (sameLicenseNumber(incoming.licenseNumber, existing.licenseNumber)) return true;

  const sameName = sameNormalized(incoming.name, existing.name, normalizeCentreName);
  const sameCity = sameNormalized(incoming.city, existing.city, normalizePlace);
  const sameAddress = sameNormalized(incoming.address, existing.address, normalizePlace);
  const samePostal = sameNormalized(incoming.postalCode, existing.postalCode, normalizePostal);
  const provinceOk = sameProvince(incoming.province, existing.province);

  if (sameAddress && samePostal) return true;
  if (sameName && sameCity && provinceOk && (sameAddress || samePostal)) return true;
  if (opts?.sameOwner && sameName && sameCity && provinceOk) return true;
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
      message: DAYCARE_ALREADY_LISTED,
    };
    if (hit.kind === "same_owner") return hit;
    fallback ??= hit;
  }

  return fallback;
}

export function isDaycareAlreadyListedMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === DAYCARE_ALREADY_LISTED.toLowerCase() || normalized.startsWith("daycare already listed");
}

export function listingCreateErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}
