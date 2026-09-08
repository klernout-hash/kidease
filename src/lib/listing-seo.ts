/**
 * Per-listing title, description, Open Graph, and schema.org JSON-LD.
 * Fail closed: no invented name, area, ratings, or reviews.
 * Relative .ts imports so Node tests can load this file.
 */

import { normalizeListingSlug } from "./listing-slug.ts";
import { isUnflaggedSharedFallbackSrc } from "./photo-honesty.ts";
import { SITEMAP_ORIGIN, sitemapListingPath } from "./sitemap.ts";

/** Official storefront or https media only. Placeholders and street-view stock stay out of OG. */
function isSeoPhoto(src?: string | null) {
  const p = String(src || "").trim();
  if (!p) return false;
  if (p.includes("placeholder") || p.includes("-logo") || p.includes("/photos/wpg/")) return false;
  if (isUnflaggedSharedFallbackSrc(p)) return false;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("https://")) return true;
  return false;
}

export const LISTING_SEO_ORIGIN = SITEMAP_ORIGIN;
const DEFAULT_OG_IMAGE = `${SITEMAP_ORIGIN}/og.jpg`;

export type ListingSeoLocale = "en" | "fr";

export type ListingSeoSource = {
  slug?: string | null;
  name?: string | null;
  nameFr?: string | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  photos?: string[] | null;
};

export type ListingSeoMeta = {
  title: string;
  description: string;
  url: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: "place";
};

function clean(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\bCetnres\b/g, "Centres")
    .replace(/\bCetnre\b/g, "Centre")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function agesKnown(src: ListingSeoSource) {
  if (src.agesKnown) {
    const min = Number(src.ageMinMonths);
    const max = Number(src.ageMaxMonths);
    return Number.isFinite(min) && Number.isFinite(max) && max > min && max > 0;
  }
  const min = Number(src.ageMinMonths);
  const max = Number(src.ageMaxMonths);
  return Number.isFinite(min) && Number.isFinite(max) && max > min && max > 0;
}

function agePhrase(src: ListingSeoSource, locale: ListingSeoLocale) {
  if (!agesKnown(src)) return "";
  const min = Number(src.ageMinMonths);
  const max = Number(src.ageMaxMonths);
  return locale === "fr" ? `${min} à ${max} mois` : `${min}–${max} months`;
}

export function listingCanonicalUrl(slug: string | null | undefined) {
  const cleanSlug = normalizeListingSlug(slug);
  if (!cleanSlug) return "";
  return `${SITEMAP_ORIGIN}${sitemapListingPath(encodeURIComponent(cleanSlug))}`;
}

export function listingDisplayName(src: ListingSeoSource, locale: ListingSeoLocale = "en") {
  return clean(locale === "fr" ? src.nameFr || src.name : src.name);
}

export function listingAreaLine(src: ListingSeoSource) {
  const city = clean(src.city);
  const province = clean(src.province).toUpperCase();
  if (city && province) return `${city}, ${province}`;
  return city || province;
}

function listingOgImage(src: ListingSeoSource) {
  const photo = (src.photos ?? []).find((p) => isSeoPhoto(p));
  if (!photo) return DEFAULT_OG_IMAGE;
  if (photo.startsWith("https://")) return photo;
  if (photo.startsWith("/")) return `${SITEMAP_ORIGIN}${photo}`;
  return DEFAULT_OG_IMAGE;
}

/**
 * Unique listing title. Fail closed to empty when name is missing —
 * callers must not invent a centre.
 */
export function listingPageTitle(src: ListingSeoSource, locale: ListingSeoLocale = "en") {
  const name = listingDisplayName(src, locale);
  if (!name) return "";
  const area = listingAreaLine(src);
  const ages = agePhrase(src, locale);
  const parts = area ? [name, area] : [name];
  const head = locale === "fr" && area ? `${name} à ${area}` : parts.join(" · ");
  if (ages) return `${head} · ${ages} · KidEase`;
  return `${head} · KidEase`;
}

export function listingMetaDescription(src: ListingSeoSource, locale: ListingSeoLocale = "en") {
  const name = listingDisplayName(src, locale);
  if (!name) return "";
  const area = listingAreaLine(src);
  const ages = agePhrase(src, locale);
  if (locale === "fr") {
    const where = area ? ` à ${area}` : "";
    const ageBit = ages ? ` Âges ${ages}.` : "";
    return `Garde d’enfants permise chez ${name}${where}.${ageBit} Consultez les heures et les places sur KidEase.`;
  }
  const where = area ? ` in ${area}` : "";
  const ageBit = ages ? ` Ages ${ages}.` : "";
  return `Licensed childcare at ${name}${where}.${ageBit} See hours and spots on KidEase.`;
}

export function listingSeoMeta(src: ListingSeoSource, locale: ListingSeoLocale = "en"): ListingSeoMeta | null {
  const title = listingPageTitle(src, locale);
  const description = listingMetaDescription(src, locale);
  const url = listingCanonicalUrl(src.slug);
  if (!title || !description || !url) return null;
  return {
    title,
    description,
    url,
    ogTitle: title,
    ogDescription: description,
    ogImage: listingOgImage(src),
    ogType: "place",
  };
}

export function listingSeoHeadTags(src: ListingSeoSource, locale: ListingSeoLocale = "en") {
  const meta = listingSeoMeta(src, locale);
  if (!meta) return [];
  return [
    { title: meta.title },
    { name: "description", content: meta.description },
    { property: "og:title", content: meta.ogTitle },
    { property: "og:description", content: meta.ogDescription },
    { property: "og:type", content: meta.ogType },
    { property: "og:url", content: meta.url },
    { property: "og:image", content: meta.ogImage },
    { property: "og:site_name", content: "KidEase" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: meta.ogTitle },
    { name: "twitter:description", content: meta.ogDescription },
    { name: "twitter:image", content: meta.ogImage },
  ];
}

function phoneIfReal(raw?: string | null) {
  const v = String(raw || "").trim();
  if (!v || v === "—" || v === "-") return "";
  if (/unknown/i.test(v)) return "";
  return v;
}

/**
 * schema.org ChildCare / LocalBusiness. Returns null when name, url, or
 * area/address is missing. Never emits aggregateRating or review.
 */
export function listingJsonLd(src: ListingSeoSource, locale: ListingSeoLocale = "en") {
  const name = listingDisplayName(src, locale);
  const url = listingCanonicalUrl(src.slug);
  const city = clean(src.city);
  const province = clean(src.province).toUpperCase();
  const street = clean(src.address);
  const postal = clean(src.postalCode);
  if (!name || !url) return null;
  if (!city && !street) return null;

  const address: Record<string, string> = {
    "@type": "PostalAddress",
    addressCountry: "CA",
  };
  if (street) address.streetAddress = street;
  if (city) address.addressLocality = city;
  if (province) address.addressRegion = province;
  if (postal) address.postalCode = postal;

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["ChildCare", "LocalBusiness"],
    name,
    url,
    address,
  };
  const otherName = clean(locale === "fr" ? src.name : src.nameFr);
  if (otherName && otherName !== name) node.alternateName = otherName;
  const phone = phoneIfReal(src.phone);
  if (phone) node.telephone = phone;
  const image = listingOgImage(src);
  if (image !== DEFAULT_OG_IMAGE) node.image = image;
  return node;
}

export function listingJsonLdScript(src: ListingSeoSource, locale: ListingSeoLocale = "en") {
  const node = listingJsonLd(src, locale);
  if (!node) return "";
  return JSON.stringify(node);
}
