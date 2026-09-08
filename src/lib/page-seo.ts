/**
 * Marketing-page title, description, Open Graph, and GEO JSON-LD.
 * Honest facts only: no invented ratings, reviews, or download counts.
 * Relative .ts imports so Node tests can load this file.
 */

import { SUPPORT_INBOX_EMAIL } from "./support.ts";
import { FACEBOOK_PROFILE_URL, INSTAGRAM_PROFILE_URL } from "./social.ts";
import { SITEMAP_ORIGIN } from "./sitemap.ts";

export const HOME_SEO_TITLE = "KidEase · Licensed daycare near you";
export const HOME_SEO_DESCRIPTION =
  "Find licensed childcare in Canada within a kilometre radius. Monthly fees, open spots, and enrolment in your pocket.";

const DEFAULT_OG_IMAGE = `${SITEMAP_ORIGIN}/og.jpg`;
const LOGO_URL = `${SITEMAP_ORIGIN}/icon-512.png`;

export type PageSeoInput = {
  title: string;
  description: string;
  path: string;
  ogType?: "website" | "article";
};

export type PageSeoMeta = {
  title: string;
  description: string;
  url: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: "website" | "article";
};

export function pageCanonicalUrl(path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean === "/") return `${SITEMAP_ORIGIN}/`;
  return `${SITEMAP_ORIGIN}${clean}`;
}

export function pageSeoMeta(input: PageSeoInput): PageSeoMeta {
  const url = pageCanonicalUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    url,
    ogTitle: input.title,
    ogDescription: input.description,
    ogImage: DEFAULT_OG_IMAGE,
    ogType: input.ogType ?? "website",
  };
}

export function pageSeoHeadTags(input: PageSeoInput) {
  const meta = pageSeoMeta(input);
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

export function pageSeoHead(input: PageSeoInput) {
  return {
    meta: pageSeoHeadTags(input),
    links: [{ rel: "canonical", href: pageCanonicalUrl(input.path) }],
  };
}

export type BreadcrumbItem = {
  name: string;
  url: string;
};

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  const crumbs = items.filter((item) => item.name && item.url);
  if (crumbs.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function breadcrumbJsonLdScript(items: BreadcrumbItem[]) {
  const node = breadcrumbJsonLd(items);
  return node ? JSON.stringify(node) : "";
}

export type FaqSeoItem = {
  q: string;
  a: string;
};

/** FAQPage from on-page Q&As only. Empty or incomplete pairs are dropped. */
export function faqPageJsonLd(items: FaqSeoItem[]) {
  const mainEntity = items
    .map((item) => ({
      q: String(item.q || "").trim(),
      a: String(item.a || "").trim(),
    }))
    .filter((item) => item.q && item.a)
    .map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    }));
  if (!mainEntity.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}

export function faqPageJsonLdScript(items: FaqSeoItem[]) {
  const node = faqPageJsonLd(items);
  return node ? JSON.stringify(node) : "";
}

/**
 * Organization facts we can stand behind: Winnipeg-based, Canada-wide
 * licensed childcare discovery, free to search. No street address, ratings,
 * or review counts.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "KidEase",
    url: `${SITEMAP_ORIGIN}/`,
    logo: LOGO_URL,
    email: SUPPORT_INBOX_EMAIL,
    description: HOME_SEO_DESCRIPTION,
    areaServed: {
      "@type": "Country",
      name: "Canada",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Winnipeg",
      addressRegion: "MB",
      addressCountry: "CA",
    },
    sameAs: [INSTAGRAM_PROFILE_URL, FACEBOOK_PROFILE_URL],
  };
}

/**
 * SoftwareApplication for the web / PWA. App Store and Play are coming soon —
 * no download counts, ratings, or store IDs.
 */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "KidEase",
    url: `${SITEMAP_ORIGIN}/get-app`,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS, Android",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CAD",
    },
    description:
      "Free search for licensed Canadian childcare listings. Monthly fees, open spots, and enrolment — App Store and Google Play coming soon.",
    publisher: {
      "@type": "Organization",
      name: "KidEase",
      url: `${SITEMAP_ORIGIN}/`,
    },
  };
}

export function organizationGraphJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationJsonLd(), softwareApplicationJsonLd()].map((node) => {
      const { "@context": _ctx, ...rest } = node as Record<string, unknown> & { "@context"?: string };
      void _ctx;
      return rest;
    }),
  };
}

export function organizationGraphJsonLdScript() {
  return JSON.stringify(organizationGraphJsonLd());
}

/** Unique title + description per public marketing route. Do not reuse home copy. */
export const MARKETING_PAGE_SEO = {
  home: {
    title: HOME_SEO_TITLE,
    description: HOME_SEO_DESCRIPTION,
    path: "/",
  },
  about: {
    title: "About KidEase · Licensed daycare directory",
    description:
      "KidEase is a Winnipeg-founded, Canada-wide directory of licensed daycares. Real storefront photos and kilometre search — no nannies or sitters.",
    path: "/about",
  },
  benefits: {
    title: "Childcare benefits and subsidies · KidEase",
    description:
      "CWELCC and provincial fee subsidies for licensed childcare. KidEase links to official government sites and does not host applications.",
    path: "/benefits",
  },
  help: {
    title: "Help Centre · KidEase",
    description:
      "Parents and licensed centres — email support or send a note. KidEase reads every message. App Store and Google Play also use this page.",
    path: "/help",
  },
  faq: {
    title: "Frequently asked questions · KidEase",
    description:
      "Short answers for parents and licensed centres: accounts, location, Live listings, claims, subsidies, and free search on KidEase.",
    path: "/faq",
  },
  getApp: {
    title: "Get the KidEase app · iPhone, Android, Mac",
    description:
      "Put licensed Canadian childcare search on your home screen. GPS, listings, and enrolment. App Store and Google Play coming soon.",
    path: "/get-app",
  },
  contact: {
    title: "Contact Us · KidEase",
    description:
      "Write KidEase about licensed childcare listings, a centre claim, or a technical issue. We read every note at support@kidease.ca.",
    path: "/contact",
  },
  compare: {
    title: "Compare licensed daycares · KidEase",
    description:
      "Compare licensed centres side by side — hours, fees, and open spots. Save up to three listings, then tour with a checklist.",
    path: "/compare",
  },
  claim: {
    title: "Claim your daycare listing · KidEase",
    description:
      "Directors: claim your licensed daycare listing on KidEase. Set spots and monthly fees. Claiming the listing is free.",
    path: "/claim",
  },
  team: {
    title: "Meet the Team · KidEase",
    description:
      "KidEase was founded in Winnipeg by Kyle Lernout and Kevin Lamont to help Canadian families find licensed daycare.",
    path: "/team",
  },
  tourChecklist: {
    title: "Daycare tour checklist · KidEase",
    description:
      "Questions to ask on a licensed daycare tour: licence, ratios, allergies, outdoor time, and subsidy. Print or open on your phone.",
    path: "/tour-checklist",
  },
  search: {
    title: "Search licensed daycare near you · KidEase",
    description:
      "Search licensed childcare by kilometre radius. Filter by age and open spots, or open a city directory for Winnipeg, Toronto, and more.",
    path: "/search",
  },
} as const;
