/**
 * Searchable help articles and canned replies for support@kidease.ca.
 * FEATURE_HELP_CENTRE defaults off. Chat is not a live SMS thread.
 */

import { SUPPORT_INBOX_EMAIL } from "./support.ts";

export const HELP_CENTRE_FLAG = "FEATURE_HELP_CENTRE";

export type HelpLocale = "en" | "fr";

export type HelpArticle = {
  id: string;
  en: { title: string; body: string };
  fr: { title: string; body: string };
  keywords: string[];
};

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    id: "search",
    keywords: ["search", "find", "cherche", "ville"],
    en: {
      title: "Search licensed daycare",
      body: "Type a city or postal code. KidEase lists licensed centres. A fee or an open spot shows only when the centre has entered it.",
    },
    fr: {
      title: "Chercher une garderie permise",
      body: "Écrivez une ville ou un code postal. KidEase liste les centres permis. Un tarif ou une place s’affiche seulement si le centre l’a entré.",
    },
  },
  {
    id: "claim",
    keywords: ["claim", "owner", "revendiquer", "proprio"],
    en: {
      title: "Claim your listing",
      body: "Daycare owners can claim the listing we already have. Claiming is free during the free founding period.",
    },
    fr: {
      title: "Revendiquer votre fiche",
      body: "Les propriétaires peuvent revendiquer la fiche que nous avons déjà. La revendication est gratuite pendant la période fondatrice gratuite.",
    },
  },
  {
    id: "report",
    keywords: ["report", "safety", "signaler", "sécurité"],
    en: {
      title: "Report a listing",
      body: "Use Report a problem if a listing looks wrong. If someone is in danger, call 911.",
    },
    fr: {
      title: "Signaler une fiche",
      body: "Utilisez Signaler un problème si une fiche semble fausse. S’il y a un danger, appelez le 911.",
    },
  },
  {
    id: "status",
    keywords: ["status", "down", "état", "panne"],
    en: {
      title: "Is KidEase working?",
      body: "The status page shows whether the website and search are up. SMS and in-app chat are coming soon.",
    },
    fr: {
      title: "KidEase fonctionne-t-il?",
      body: "La page d’état montre si le site et la recherche marchent. Les textos et le clavardage dans l’appli arrivent bientôt.",
    },
  },
  {
    id: "parents-free",
    keywords: ["free", "price", "gratuit", "parent"],
    en: {
      title: "Parents and the free founding period",
      body: "Parents use KidEase during the free founding period.",
    },
    fr: {
      title: "Parents et la période fondatrice gratuite",
      body: "Les parents utilisent KidEase pendant la période fondatrice gratuite. Nous ne disons pas gratuit pour toujours.",
    },
  },
  {
    id: "home-address",
    keywords: ["home", "address", "privacy", "rue", "adresse", "familial", "milieu"],
    en: {
      title: "Home daycare addresses",
      body: "A home daycare shows the city and the first three letters of the postal code. The map is an area, not the front door. The exact address is shared after you book a tour, enrol, or the daycare replies. The owner can choose to show the street on the public listing.",
    },
    fr: {
      title: "Adresses des garderies en milieu familial",
      body: "Une garderie en milieu familial montre la ville et les trois premières lettres du code postal. La carte est un secteur, pas la porte. L’adresse exacte est partagée après une visite réservée, une inscription, ou une réponse de la garderie. Le propriétaire peut choisir d’afficher la rue sur la fiche publique.",
    },
  },
];

export const CANNED_REPLIES: readonly { id: string; en: string; fr: string }[] = [
  {
    id: "got-it",
    en: "Thanks. We have your note and will reply by email.",
    fr: "Merci. Nous avons votre message et nous répondrons par courriel.",
  },
  {
    id: "search-again",
    en: "Search again by city. We only show a fee or a spot when the centre has entered it.",
    fr: "Cherchez à nouveau par ville. Nous montrons un tarif ou une place seulement si le centre l’a entré.",
  },
  {
    id: "claim",
    en: "Claim the listing from the centre page. Claiming stays free during the free founding period.",
    fr: "Revendiquez la fiche depuis la page du centre. La revendication reste gratuite pendant la période fondatrice gratuite.",
  },
];

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function helpCentreEnabled(env?: Record<string, string | undefined>): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[HELP_CENTRE_FLAG]) || flagOn(bag[`VITE_${HELP_CENTRE_FLAG}`]);
}

export function searchHelp(query: string, locale: HelpLocale): HelpArticle[] {
  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((term) => term.length > 1);
  if (!terms.length) return [...HELP_ARTICLES];
  return HELP_ARTICLES.filter((article) => {
    const hay = [article.en.title, article.en.body, article.fr.title, article.fr.body, ...article.keywords]
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return terms.every((term) => hay.includes(term));
  });
}

export function supportMail(input: {
  enabled: boolean;
  name: string;
  replyTo: string;
  body: string;
  cannedId?: string;
  locale: HelpLocale;
}): { to: string; subject: string; text: string } | null {
  if (!input.enabled) return null;
  const name = input.name.trim().slice(0, 80);
  const replyTo = input.replyTo.trim().slice(0, 200);
  const note = input.body.trim().slice(0, 2000);
  if (!name || !replyTo.includes("@") || !note) return null;
  const canned = CANNED_REPLIES.find((row) => row.id === input.cannedId);
  const extra = canned ? `\n\n${input.locale === "fr" ? canned.fr : canned.en}` : "";
  return {
    to: SUPPORT_INBOX_EMAIL,
    subject: input.locale === "fr" ? "Aide KidEase" : "KidEase help",
    text: `From: ${name}\nReply-to: ${replyTo}\n\n${note}${extra}`,
  };
}
