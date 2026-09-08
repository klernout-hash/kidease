/**
 * Unique title / description hooks for public daycare listing pages.
 * Slug-only input is enough for crawlers; name + city + province win when
 * the listing payload is available. No UI-kit imports — Node tests load this
 * file the same way they load sitemap.ts.
 */

import { classifyFacilityType, facilityTypeSeoKind, type FacilityType } from "./facility-type.ts";
import { normalizeListingSlug } from "./listing-slug.ts";

export const LISTING_META_BRAND = "KidEase";

export type ListingMetaInput = {
  name?: string | null;
  city?: string | null;
  province?: string | null;
  slug?: string | null;
  amenities?: string | null;
};

function listingKind(input: ListingMetaInput): { type: FacilityType; label: string } {
  const type = classifyFacilityType({ amenities: input.amenities, name: input.name }).type;
  const noun = type === "nursery" ? "Nursery" : type === "home" ? "Home" : "Centre";
  return { type, label: noun };
}

/** "bonnie-bairns-childcare-services-1" → "Bonnie Bairns Childcare Services". */
export function listingLabelFromSlug(slug: string | null | undefined): string {
  const raw = (slug || "").trim().replace(/^\/+|\/+$/g, "");
  const segment = raw.split("/").filter(Boolean).pop() ?? "";
  if (!segment) return "";
  const withoutId = normalizeListingSlug(segment).replace(/-\d+$/, "");
  return withoutId
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

function listingDisplayName(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\bCetnre\b/g, "Centre")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function placeLabel(input: ListingMetaInput): string {
  const city = (input.city || "").trim();
  const province = (input.province || "").trim();
  return [city, province].filter(Boolean).join(", ");
}

export function listingPageTitle(input: ListingMetaInput): string {
  const name = listingDisplayName(input.name);
  const place = placeLabel(input);
  const kind = listingKind(input);
  if (name && place) return `${name} · ${kind.label} in ${place} · ${LISTING_META_BRAND}`;
  if (name) return `${name} · ${facilityTypeSeoKind(kind.type)} · ${LISTING_META_BRAND}`;
  const fromSlug = listingLabelFromSlug(input.slug);
  if (fromSlug) return `${fromSlug} · Licensed daycare · ${LISTING_META_BRAND}`;
  return `Licensed daycare · ${LISTING_META_BRAND}`;
}

export function listingPageDescription(input: ListingMetaInput): string {
  const name = listingDisplayName(input.name);
  const place = placeLabel(input);
  const kind = listingKind(input);
  const typed = facilityTypeSeoKind(kind.type);
  if (name && place) {
    return `See hours, fees, and open spots at ${name} in ${place}. ${typed} on ${LISTING_META_BRAND}.`;
  }
  if (name) {
    return `See hours, fees, and open spots at ${name}. ${typed} on ${LISTING_META_BRAND}.`;
  }
  const fromSlug = listingLabelFromSlug(input.slug);
  if (fromSlug) {
    return `Licensed childcare listing for ${fromSlug} on ${LISTING_META_BRAND}. Hours, fees, and open spots.`;
  }
  return `Find licensed childcare in Canada. Hours, fees, and open spots on ${LISTING_META_BRAND}.`;
}

export function listingPageMeta(input: ListingMetaInput): { title: string; description: string } {
  return {
    title: listingPageTitle(input),
    description: listingPageDescription(input),
  };
}
