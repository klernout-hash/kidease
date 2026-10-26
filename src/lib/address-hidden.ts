/**
 * Home addresses that stay off public pages, maps, JSON-LD, sitemap text, and APIs.
 * Catalogue reads and daycare upserts both honour this list, so a later registry
 * import cannot publish the street again. City and province stay.
 * Relative imports only — Node tests load this file directly.
 */

/** Catalogue ids whose street and postal code are not public. */
export const ADDRESS_HIDDEN_IDS = ["mx-09f81152743c"] as const;

/** Public listing slugs for the same rows. */
export const ADDRESS_HIDDEN_SLUGS = ["rupinder-singh-1152743c"] as const;

/**
 * Winnipeg city area (same point as WINNIPEG in src/lib/geo.ts).
 * Used only for this Winnipeg home listing, in place of the house pin.
 */
export const HIDDEN_ADDRESS_AREA = { lat: 49.8951, lng: -97.1384 };

const TEXT_KEYS = [
  "description",
  "descriptionFr",
  "description_fr",
  "tagline",
  "taglineFr",
  "tagline_fr",
] as const;

const STREET_SOURCE = "72\\s+Rutledge\\s+Crescent|Rutledge\\s+Crescent|R3W[\\s-]*0A4";

export function isAddressHidden(
  row: { id?: string | null; slug?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  const id = String(row.id || "").trim().toLowerCase();
  const slug = String(row.slug || "").trim().toLowerCase();
  return (
    (ADDRESS_HIDDEN_IDS as readonly string[]).includes(id) ||
    (ADDRESS_HIDDEN_SLUGS as readonly string[]).includes(slug)
  );
}

/** Remove the hidden street and postal code from free text. Other wording stays. */
export function stripHiddenAddressText(value: string | null | undefined): string {
  const out = String(value ?? "");
  if (!out) return "";
  const stripped = out.replace(new RegExp(STREET_SOURCE, "gi"), "");
  return stripped
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*,+/g, ", ")
    .replace(/\b(at|au)\s*,\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+,/g, ",")
    .trim();
}

type AddressFields = {
  id?: string | null;
  slug?: string | null;
  address?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  description?: string | null;
  descriptionFr?: string | null;
  description_fr?: string | null;
  tagline?: string | null;
  taglineFr?: string | null;
  tagline_fr?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/** Blank the street and postal code, and move the pin off the house. Other rows pass through. */
export function suppressHiddenAddress<T extends AddressFields>(row: T): T {
  if (!isAddressHidden(row)) return row;
  const next = { ...row };
  if ("address" in row) next.address = "";
  if ("postalCode" in row) next.postalCode = "";
  if ("postal_code" in row) next.postal_code = "";
  for (const key of TEXT_KEYS) {
    if (key in row && row[key] != null) {
      (next as Record<string, unknown>)[key] = stripHiddenAddressText(String(row[key]));
    }
  }
  if ("lat" in row && row.lat != null) next.lat = HIDDEN_ADDRESS_AREA.lat;
  if ("lng" in row && row.lng != null) next.lng = HIDDEN_ADDRESS_AREA.lng;
  return next;
}

/** Drop these listings from map pin and cluster queries so the house is not a dot. */
export function addressHiddenMapSql(): string {
  const ids = ADDRESS_HIDDEN_IDS.map((id) => `'${id}'`).join(", ");
  const slugs = ADDRESS_HIDDEN_SLUGS.map((slug) => `'${slug}'`).join(", ");
  return `id not in (${ids}) and coalesce(slug, '') not in (${slugs})`;
}
