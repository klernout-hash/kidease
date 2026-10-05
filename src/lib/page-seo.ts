/**
 * Marketing-page title, description, Open Graph, and GEO JSON-LD.
 * Honest facts only: no invented ratings, reviews, or download counts.
 * Relative .ts imports so Node tests can load this file.
 */

import { SUPPORT_INBOX_EMAIL } from "./support.ts";
import { FACEBOOK_PROFILE_URL, INSTAGRAM_PROFILE_URL } from "./social.ts";
import { SITEMAP_ORIGIN } from "./sitemap.ts";
import { hreflangLinks, pathLocale } from "./locale-path.ts";

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
  /** Overrides the locale taken from the path. Unpaired pages stay on the English URL. */
  locale?: "en" | "fr";
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
  const locale = input.locale ?? pathLocale(input.path);
  const tags: Array<Record<string, string>> = [
    { title: meta.title },
    { name: "description", content: meta.description },
    { property: "og:title", content: meta.ogTitle },
    { property: "og:description", content: meta.ogDescription },
    { property: "og:type", content: meta.ogType },
    { property: "og:url", content: meta.url },
    { property: "og:image", content: meta.ogImage },
    { property: "og:site_name", content: "KidEase" },
    { property: "og:locale", content: locale === "fr" ? "fr_CA" : "en_CA" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: meta.ogTitle },
    { name: "twitter:description", content: meta.ogDescription },
    { name: "twitter:image", content: meta.ogImage },
  ];
  const alternate = locale === "fr" ? "en_CA" : "fr_CA";
  if (hreflangLinks(input.path).length) {
    tags.push({ property: "og:locale:alternate", content: alternate });
  }
  return tags;
}

export function pageSeoHead(input: PageSeoInput) {
  return {
    meta: pageSeoHeadTags(input),
    links: [
      { rel: "canonical", href: pageCanonicalUrl(input.path) },
      ...hreflangLinks(input.path, SITEMAP_ORIGIN),
    ],
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
 * Organization facts we can stand behind: a Canadian company,
 * Canada-wide licensed childcare discovery, free to search. No street
 * address, ratings, or review counts.
 */
export function organizationJsonLd(locale: "en" | "fr" = "en") {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "KidEase",
    url: `${SITEMAP_ORIGIN}/`,
    logo: LOGO_URL,
    email: SUPPORT_INBOX_EMAIL,
    description: locale === "fr" ? MARKETING_PAGE_SEO_FR.home.description : HOME_SEO_DESCRIPTION,
    areaServed: {
      "@type": "Country",
      name: "Canada",
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "CA",
    },
    sameAs: [INSTAGRAM_PROFILE_URL, FACEBOOK_PROFILE_URL],
  };
}

/**
 * SoftwareApplication for the web / PWA. App Store and Play are coming soon.
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
      "Free search for licensed Canadian childcare listings. Monthly fees, open spots, and enrolment: App Store and Google Play coming soon.",
    publisher: {
      "@type": "Organization",
      name: "KidEase",
      url: `${SITEMAP_ORIGIN}/`,
    },
  };
}

export function organizationGraphJsonLd(locale: "en" | "fr" = "en") {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationJsonLd(locale), softwareApplicationJsonLd()].map((node) => {
      const { "@context": _ctx, ...rest } = node as Record<string, unknown> & { "@context"?: string };
      void _ctx;
      return rest;
    }),
  };
}

export function organizationGraphJsonLdScript(locale: "en" | "fr" = "en") {
  return JSON.stringify(organizationGraphJsonLd(locale));
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
      "KidEase is a Canadian company and a Canada-wide directory of licensed daycares. Real storefront photos and kilometre search: no nannies or sitters.",
    path: "/about",
  },
  benefits: {
    title: "Childcare benefits and subsidies · KidEase",
    description:
      "Canada Child Benefit 2026–27 amounts, CWELCC $10-a-day fees, and provincial fee subsidies. Official government links only: KidEase does not process applications.",
    path: "/benefits",
  },
  help: {
    title: "Help Centre · KidEase",
    description:
      "Parents and licensed centres: email support or send a note. KidEase reads every message. App Store and Google Play also use this page.",
    path: "/help",
  },
  report: {
    title: "Report a safety concern · KidEase",
    description:
      "KidEase is a licensed child care directory. For a safety concern, contact the provincial licensing office. Call 911 in an emergency. Tell KidEase about a listing error.",
    path: "/report",
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
      "Compare licensed centres side by side: hours, fees, and open spots. Save up to three listings, then tour with a checklist.",
    path: "/compare",
  },
  login: {
    title: "Sign in or create an account · KidEase",
    description:
      "Create a KidEase account or sign in to save licensed centres, request a tour, and message a daycare. KidEase is a Canadian company.",
    path: "/login",
  },
  forgotPassword: {
    title: "Reset your password · KidEase",
    description:
      "Ask for a reset link if you do not remember your KidEase password. We email the link to the address on your account.",
    path: "/forgot-password",
  },
  resetPassword: {
    title: "Choose a new password · KidEase",
    description: "Set a new password for your KidEase account after you open the reset link from your email.",
    path: "/reset-password",
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
      "Kyle Lernout and Kevin Lamont started KidEase, a Canadian company, to help families find licensed daycare.",
    path: "/team",
  },
  donate: {
    title: "Donate to Kids · KidEase",
    description:
      "Donate to SickKids Foundation or Canada’s Children’s Hospital Foundations. Gifts go to the foundation you choose. Giving is optional.",
    path: "/donate",
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
      "Search licensed centres, nurseries, and homes by kilometre radius. Filter by facility type, age, and open spots, or open a city directory for Winnipeg, Toronto, and more.",
    path: "/search",
  },
  jobs: {
    title: "Find daycare jobs in Canada · KidEase",
    description:
      "KidEase is not a job board yet. Licensed caregivers in Canada can leave a note. We do not invent openings.",
    path: "/jobs",
  },
  jobsPost: {
    title: "Post a job · KidEase",
    description:
      "Licensed centres can tell KidEase about an opening. This is a waitlist note, not a job board. We do not publish unverified roles.",
    path: "/jobs/post",
  },
  startADaycare: {
    title: "Start a licensed daycare in Canada · KidEase",
    description:
      "How to start licensed child care in Canada, with a province finder for official licensing and grant pages. KidEase does not issue licences or award grants. Enroll today joins KidEase as a provider.",
    path: "/start-a-daycare",
  },
} as const;

/** French counterparts for shipped official-language URLs. Catalogue bodies stay EN. */
export const MARKETING_PAGE_SEO_FR = {
  home: {
    title: "KidEase · Garderie permise près de chez vous",
    description:
      "Trouvez des services de garde permis au Canada dans un rayon d’un kilomètre. Frais mensuels, places ouvertes et inscription, dans votre poche.",
    path: "/fr",
  },
  help: {
    title: "Centre d’aide · KidEase",
    description:
      "Parents et centres permis: écrivez-nous ou envoyez une note. KidEase lit chaque message. L’App Store et Google Play utilisent aussi cette page.",
    path: "/fr/help",
  },
  report: {
    title: "Signaler une préoccupation de sécurité · KidEase",
    description:
      "KidEase est un répertoire de garde permise. Pour une préoccupation de sécurité, contactez le bureau de permis. Appelez le 911 en urgence. Signalez une erreur de fiche à KidEase.",
    path: "/fr/report",
  },
  faq: {
    title: "Foire aux questions · KidEase",
    description:
      "Réponses courtes pour les parents et les centres permis : comptes, position, fiches En ligne, réclamation, subventions et recherche gratuite sur KidEase.",
    path: "/fr/faq",
  },
  contact: {
    title: "Nous joindre · KidEase",
    description:
      "Écrivez à KidEase au sujet d’une fiche de garde permise, d’une réclamation de centre ou d’un problème technique. Nous lisons chaque note à support@kidease.ca.",
    path: "/fr/contact",
  },
  about: {
    title: "À propos de KidEase · Répertoire de garderies permises",
    description:
      "KidEase est une entreprise canadienne et un répertoire pancanadien de garderies permises. De vraies photos de devanture et une recherche au kilomètre: pas de nounous ni de gardiens.",
    path: "/fr/about",
  },
  donate: {
    title: "Faire un don aux enfants · KidEase",
    description:
      "Donnez à la Fondation SickKids ou aux Fondations des hôpitaux pour enfants du Canada. Le don va à la fondation choisie. Le don est facultatif.",
    path: "/fr/donate",
  },
  search: {
    title: "Chercher une garderie permise près de vous · KidEase",
    description:
      "Cherchez des centres, prématernelles et milieux familiaux permis par rayon en kilomètres. Filtrez par type, âge et places ouvertes, ou ouvrez un répertoire de ville.",
    path: "/fr/search",
  },
  getApp: {
    title: "Télécharger l’appli KidEase · iPhone, Android, Mac",
    description:
      "Mettez la recherche de garde permise au Canada sur votre écran d’accueil. GPS, fiches et inscription. App Store et Google Play bientôt.",
    path: "/fr/get-app",
  },
  benefits: {
    title: "Prestations et subventions pour la garde · KidEase",
    description:
      "Montants de l’Allocation canadienne pour enfants 2026-2027, tarifs AGJE et subventions provinciales. Liens officiels seulement: KidEase ne traite pas les demandes.",
    path: "/fr/benefits",
  },
  login: {
    title: "Connexion ou création de compte · KidEase",
    description:
      "Créez un compte KidEase ou connectez-vous pour enregistrer des centres permis, demander une visite et écrire à une garderie.",
    path: "/fr/login",
  },
  jobs: {
    title: "Trouver des emplois en garderie au Canada · KidEase",
    description:
      "KidEase n’est pas encore un babillard d’emplois. Les éducatrices au Canada peuvent laisser une note. Nous n’inventons pas de postes.",
    path: "/fr/jobs",
  },
  jobsPost: {
    title: "Publier un emploi · KidEase",
    description:
      "Les centres permis peuvent parler à KidEase d’une ouverture. C’est une note d’attente, pas un babillard. Nous n’affichons pas de postes non vérifiés.",
    path: "/fr/jobs/post",
  },
  startADaycare: {
    title: "Ouvrir une garderie permise au Canada · KidEase",
    description:
      "Comment ouvrir un service de garde permis au Canada, avec un filtre par province pour les pages officielles de permis et de subventions. KidEase ne délivre pas de permis et n’accorde pas de subventions.",
    path: "/fr/start-a-daycare",
  },
  plans: {
    title: "Forfaits · KidEase",
    description:
      "Recherche, favoris (jusqu’à cinq centres) et messages aux garderies, sans frais. Les garderies utilisent tous les outils pendant la période fondatrice gratuite. KidEase est une entreprise canadienne.",
    path: "/fr/plans",
  },
  plansPaid: {
    title: "Forfaits · KidEase",
    description:
      "Recherche, favoris (jusqu’à cinq centres) et messages, sans frais. Parent Plus et les forfaits de centre sont facultatifs et facturés en dollars canadiens. KidEase est une entreprise canadienne.",
    path: "/fr/plans",
  },
  claim: {
    title: "Réclamez la fiche de votre garderie · KidEase",
    description:
      "Directeurs : réclamez la fiche de votre garderie permise sur KidEase, une entreprise canadienne. Indiquez les places et les frais mensuels. Réclamer la fiche est gratuit.",
    path: "/fr/claim",
  },
  cities: {
    title: "Villes au Canada · KidEase",
    description: "Répertoires de garderies permises, regroupés par province, partout au Canada.",
    path: "/fr/cities",
  },
  compare: {
    title: "Comparer des garderies permises · KidEase",
    description:
      "Comparez des centres permis côte à côte : heures, frais et places ouvertes. Enregistrez jusqu’à trois fiches, puis visitez avec une liste.",
    path: "/fr/compare",
  },
  verify: {
    title: "Comment nous vérifions les fiches · KidEase",
    description:
      "Badges KidEase : correspondance au catalogue, revue avec le registre officiel, vérifications de réclamation et liens vers les dossiers du gouvernement. KidEase est une entreprise canadienne.",
    path: "/fr/verify",
  },
  daycareRequirements: {
    title: "Exigences pour les garderies · KidEase",
    description:
      "Ce que les parents peuvent attendre et ce que les garderies permises doivent fournir : un permis, une vérification du secteur vulnérable et les documents de registre exigés. KidEase ne délivre pas les vérifications policières.",
    path: "/fr/daycare-requirements",
  },
  tourChecklist: {
    title: "Liste pour visiter une garderie · KidEase",
    description:
      "Questions à poser lors d’une visite : permis, ratios, allergies, temps dehors et subvention. À imprimer ou à ouvrir sur le téléphone.",
    path: "/fr/tour-checklist",
  },
  team: {
    title: "L’équipe · KidEase",
    description:
      "Kyle Lernout et Kevin Lamont ont fondé KidEase, une entreprise canadienne, pour aider les familles à trouver une garderie permise.",
    path: "/fr/team",
  },
  unsubscribe: {
    title: "Se désabonner · KidEase",
    description: "Arrêtez les courriels ou les SMS de KidEase. Désabonnement selon la LCAP : aucun compte requis.",
    path: "/fr/unsubscribe",
  },
  deleteAccount: {
    title: "Supprimer le compte · KidEase",
    description:
      "Suppression de compte KidEase selon la LPRPDE. Connectez-vous pour retirer votre compte et les données de la famille.",
    path: "/fr/delete-account",
  },
} as const;

export const LEGAL_PAGE_SEO = {
  privacy: {
    title: "Privacy · KidEase",
    description: "KidEase privacy notice: PIPEDA, location, processors, and child safety.",
    path: "/privacy",
  },
  terms: {
    title: "Terms · KidEase",
    description: "KidEase terms of use for parents and licensed childcare centres.",
    path: "/terms",
  },
  cookies: {
    title: "Cookies · KidEase",
    description: "KidEase cookie policy: essential cookies, optional analytics only after you allow.",
    path: "/cookies",
  },
} as const;

export const LEGAL_PAGE_SEO_FR = {
  privacy: {
    title: "Confidentialité · KidEase",
    description: "Avis de confidentialité KidEase: LPRPDE, position, sous-traitants et sécurité des enfants.",
    path: "/fr/privacy",
  },
  terms: {
    title: "Conditions · KidEase",
    description: "Conditions d’utilisation KidEase pour les parents et les centres de garde permis.",
    path: "/fr/terms",
  },
  cookies: {
    title: "Témoins · KidEase",
    description: "Politique sur les témoins KidEase: témoins essentiels, analytique facultative seulement après Autoriser.",
    path: "/fr/cookies",
  },
} as const;
