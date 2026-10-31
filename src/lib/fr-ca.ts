/**
 * French (Canada) national pack. FEATURE_FR_CA defaults off.
 * Off: Quebec-only location, and the browser language list is ignored.
 * On: Quebec and New Brunswick, plus the browser or the device language.
 * A saved profile, cookie, or ?lang= choice still wins. Nobody is signed out.
 *
 * No @/ imports so Node tests can load this file.
 */

import { frCaEnabled, type EnvMap } from "./features.ts";
import { isShippedLocale } from "./languages.ts";
import {
  decideVisitorLocale,
  type LocaleDecisionSource,
  type LocaleRedirectInput,
  type VisitorLocaleDecision,
  type VisitorLocaleInput,
} from "./locale-geo.ts";

export const FR_CA_REGIONS = ["QC", "NB"] as const;

/** Device locale hint. The website also reads the browser language list. */
export const FR_CA_DEVICE_HEADER = "x-kidease-device-locale";

const BROWSER_HEADER = "accept-language";

export type FrCaGroup = "parent" | "daycare" | "admin" | "government" | "email" | "sms";

type Pair = { en: string; fr: string };

export const FR_CA_SCREENS: Record<FrCaGroup, Record<string, Pair>> = {
  parent: {
    what: {
      en: "KidEase helps you find a licensed daycare.",
      fr: "KidEase vous aide à trouver une garderie autorisée.",
    },
    why: {
      en: "Search by city, compare centres, and ask for a tour.",
      fr: "Cherchez par ville, comparez les centres et demandez une visite.",
    },
    next: { en: "Search daycares", fr: "Chercher une garderie" },
    search: { en: "Search", fr: "Recherche" },
    waitlist: { en: "Join the waitlist", fr: "Joindre la liste d’attente" },
    enrol: { en: "Request a spot", fr: "Demander une place" },
    daily: { en: "Your child's day", fr: "La journée de votre enfant" },
    checkIn: { en: "Check in", fr: "Arrivée" },
    checkOut: { en: "Check out", fr: "Départ" },
    language: { en: "Language", fr: "Langue" },
    frenchCanada: { en: "Français (Canada)", fr: "Français (Canada)" },
  },
  daycare: {
    what: {
      en: "KidEase is your daycare desk.",
      fr: "KidEase est le bureau de votre garderie.",
    },
    why: {
      en: "See parent requests, tours, and today's attendance.",
      fr: "Voyez les demandes des parents, les visites et les présences du jour.",
    },
    next: { en: "Open today", fr: "Ouvrir aujourd’hui" },
    requests: { en: "Requests", fr: "Demandes" },
    attendance: { en: "Attendance", fr: "Présences" },
    kiosk: { en: "Check-in screen", fr: "Écran d’arrivée" },
    billing: { en: "Bills", fr: "Factures" },
  },
  admin: {
    what: {
      en: "KidEase admin reviews listings and reports.",
      fr: "L’admin KidEase révise les fiches et les signalements.",
    },
    why: {
      en: "Publish a parent review or close a report. Admin stays on the website.",
      fr: "Publiez un avis de parent ou fermez un signalement. L’admin reste sur le site web.",
    },
    next: { en: "Open the queue", fr: "Ouvrir la file" },
    waiting: { en: "Waiting", fr: "En attente" },
    toReview: { en: "to review", fr: "à revoir" },
    viewListing: { en: "View listing", fr: "Voir la fiche" },
    safetyTitle: { en: "Safety reports", fr: "Signalements de sécurité" },
    safetyLead: {
      en: "Open reports about a listing, a centre, a message, or a review. This queue does not invent a safety score.",
      fr: "Signalements ouverts sur une fiche, un centre, un message ou un avis. Cette file n’invente pas de note de sécurité.",
    },
    safetyEmpty: {
      en: "No open safety reports. New reports show up here.",
      fr: "Aucun signalement ouvert. Les nouveaux apparaissent ici.",
    },
    safetyLoading: { en: "Loading reports…", fr: "Chargement des signalements…" },
    markReviewed: { en: "Mark reviewed", fr: "Marquer comme vu" },
    dismiss: { en: "Dismiss", fr: "Écarter" },
    noEmail: { en: "No email on the account", fr: "Aucun courriel sur le compte" },
    noListing: { en: "No listing name on file", fr: "Aucun nom de fiche au dossier" },
  },
  government: {
    what: {
      en: "KidEase shows licensed child care totals for your province.",
      fr: "KidEase montre les totaux de garde autorisée pour votre province.",
    },
    why: {
      en: "You see only your province. Names, streets, and child details stay hidden.",
      fr: "Vous voyez seulement votre province. Les noms, les rues et les détails des enfants restent cachés.",
    },
    next: { en: "View provincial totals", fr: "Voir les totaux provinciaux" },
    deskOff: {
      en: "Provincial totals are not on yet.",
      fr: "Les totaux provinciaux ne sont pas encore offerts.",
    },
    websiteOnly: {
      en: "Government totals stay on the website. This app does not sign you out.",
      fr: "Les totaux du gouvernement restent sur le site web. Cette appli ne vous déconnecte pas.",
    },
    registries: {
      en: "All Canadian provinces and territories. Manitoba can match a licence against the bundled KidEase catalogue. Ontario, Alberta, British Columbia, Saskatchewan, and Québec have documented adapter stubs that fail closed to operator manual review: not live registry matches. Other jurisdictions stay adapter stubs. This list does not pretend a scrape ran.",
      fr: "Toutes les provinces et tous les territoires du Canada. Le Manitoba peut faire correspondre un permis au catalogue KidEase fourni. L’Ontario, l’Alberta, la Colombie-Britannique, la Saskatchewan et le Québec ont des adaptateurs documentés qui restent en révision manuelle : pas de correspondance en direct. Les autres restent des adaptateurs. Cette liste ne prétend pas qu’un relevé a eu lieu.",
    },
    reports: {
      en: "Parents and guests can flag a listing. KidEase reviews the licence and claim. This is not an inspection score.",
      fr: "Les parents et les visiteurs peuvent signaler une fiche. KidEase révise le permis et la réclamation. Ce n’est pas une note d’inspection.",
    },
  },
  email: {
    infoDaycare: {
      en: "New question from {who} about {place}",
      fr: "Nouvelle question de {who} au sujet de {place}",
    },
    infoAdmin: { en: "Parent question: {place}", fr: "Question d’un parent : {place}" },
    infoPreview: {
      en: "{who} asked a question about {place}.",
      fr: "{who} a posé une question au sujet de {place}.",
    },
    tourDaycare: {
      en: "New tour request from {who} for {place}",
      fr: "Nouvelle demande de visite de {who} pour {place}",
    },
    tourAdmin: { en: "Tour request: {place}", fr: "Demande de visite : {place}" },
    tourPreview: { en: "{who} asked to visit {place}.", fr: "{who} a demandé une visite à {place}." },
    spotDaycare: {
      en: "New spot request from {who} for {place}",
      fr: "Nouvelle demande de place de {who} pour {place}",
    },
    spotAdmin: { en: "Spot request: {place}", fr: "Demande de place : {place}" },
    spotPreview: {
      en: "{who} asked about a spot at {place}.",
      fr: "{who} a demandé une place à {place}.",
    },
    waitlistDaycare: {
      en: "New waitlist request from {who} for {place}",
      fr: "Nouvelle demande de liste d’attente de {who} pour {place}",
    },
    waitlistAdmin: { en: "Waitlist request: {place}", fr: "Demande de liste d’attente : {place}" },
    waitlistPreview: {
      en: "{who} asked to join the waitlist at {place}.",
      fr: "{who} a demandé à joindre la liste d’attente de {place}.",
    },
    confirmed: { en: "{place} confirmed your request", fr: "{place} a confirmé votre demande" },
    declined: {
      en: "{place} could not take this request",
      fr: "{place} n’a pas pu accepter cette demande",
    },
    replied: { en: "{place} replied to your request", fr: "{place} a répondu à votre demande" },
    invite: { en: "Join {place} on KidEase", fr: "Joignez {place} sur KidEase" },
    waitlistStatus: {
      en: "{place} updated your spot request",
      fr: "{place} a mis à jour votre demande de place",
    },
  },
  sms: {
    request: {
      en: "KidEase: New parent request for {place}. Open messages at https://www.kidease.ca/inbox Reply STOP to opt out.",
      fr: "KidEase : Nouvelle demande d’un parent pour {place}. Messages : https://www.kidease.ca/inbox Répondez STOP pour arrêter.",
    },
    message: {
      en: "KidEase: New parent message about {place}. https://www.kidease.ca/inbox Reply STOP to opt out.",
      fr: "KidEase : Nouveau message d’un parent au sujet de {place}. https://www.kidease.ca/inbox Répondez STOP pour arrêter.",
    },
    reply: {
      en: "KidEase: {place} replied. Read it at https://www.kidease.ca/inbox Reply STOP to opt out.",
      fr: "KidEase : {place} a répondu. Lisez-le : https://www.kidease.ca/inbox Répondez STOP pour arrêter.",
    },
    help: {
      en: "KidEase: texts about daycare requests and your account. Reply STOP to opt out. Email support@kidease.ca or call 1-877-502-7728.",
      fr: "KidEase : textos sur vos demandes de garderie. Répondez STOP pour arrêter. Aide : support@kidease.ca ou 1-877-502-7728.",
    },
    stop: {
      en: "KidEase: you are opted out. We will not text this number. Reply START to opt back in. Help: support@kidease.ca",
      fr: "KidEase : vous êtes désabonné. Plus de textos à ce numéro. Répondez START pour revenir. Aide : support@kidease.ca",
    },
    start: {
      en: "KidEase: you are opted in again for daycare request texts. Reply STOP to opt out. Help: support@kidease.ca",
      fr: "KidEase : vous recevez de nouveau les textos KidEase. Répondez STOP pour arrêter. Aide : support@kidease.ca",
    },
  },
};

export function frCaScreen(
  group: FrCaGroup,
  key: string,
  locale: string | null | undefined,
  enabled = frCaEnabled(),
): string {
  const row = FR_CA_SCREENS[group]?.[key];
  if (!row) return "";
  if (enabled && locale === "fr") return row.fr;
  return row.en;
}

export function fillFrCa(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? "");
}

/** A saved language choice. The default profile value is not a choice. */
export function savedFrLocale(row: { locale?: string | null; locale_chosen?: unknown } | null | undefined): "fr" | undefined {
  if (!row) return undefined;
  const flag = row.locale_chosen;
  const chosen = flag === true || flag === 1 || flag === "t" || flag === "true" || flag === "1";
  return chosen && row.locale === "fr" ? "fr" : undefined;
}

/**
 * First language tag that is French or English.
 * `fr-CA,fr;q=0.9,en;q=0.8` → fr. Empty or unknown → null.
 */
export function parseLanguageList(header: string | null | undefined): "fr" | "en" | null {
  const raw = String(header || "").trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((part) => {
      const [tagRaw, ...params] = part.trim().split(";");
      const tag = (tagRaw || "").trim().toLowerCase();
      let q = 1;
      for (const param of params) {
        const [name, value] = param.trim().split("=");
        if ((name || "").trim().toLowerCase() === "q") {
          const n = Number(value);
          if (Number.isFinite(n)) q = n;
        }
      }
      return { tag, q };
    })
    .filter((part) => part.tag)
    .sort((a, b) => b.q - a.q);
  for (const part of parts) {
    if (part.tag === "fr" || part.tag.startsWith("fr-")) return "fr";
    if (part.tag === "en" || part.tag.startsWith("en-")) return "en";
  }
  return null;
}

export type HeaderBag = { get(name: string): string | null };

export function frCaLanguageSignals(headers: HeaderBag): { device: "fr" | "en" | null; browser: "fr" | "en" | null } {
  return {
    device: parseLanguageList(headers.get(FR_CA_DEVICE_HEADER)),
    browser: parseLanguageList(headers.get(BROWSER_HEADER)),
  };
}

export type FrCaRedirectExtras = {
  decision: { frenchRegions?: readonly string[] };
  redirect: { frenchRegions?: readonly string[]; preferredLocale?: "fr" };
  browserFrench: boolean;
};

export function frCaRedirectExtras(headers: HeaderBag, env?: EnvMap): FrCaRedirectExtras {
  if (!frCaEnabled(env)) return { decision: {}, redirect: {}, browserFrench: false };
  const signals = frCaLanguageSignals(headers);
  const prefer = signals.device ?? signals.browser;
  const browserFrench = prefer === "fr";
  return {
    decision: { frenchRegions: FR_CA_REGIONS },
    redirect: {
      frenchRegions: FR_CA_REGIONS,
      preferredLocale: browserFrench ? "fr" : undefined,
    },
    browserFrench,
  };
}

export function applyFrCaDecision(
  input: VisitorLocaleInput,
  extras: FrCaRedirectExtras,
): VisitorLocaleDecision {
  const decision = decideVisitorLocale({ ...input, ...extras.decision });
  if (!extras.browserFrench || decision.explicit || decision.suppressGeo) return decision;
  if (decision.locale === "fr") return decision;
  return { locale: "fr", explicit: false, source: "browser" satisfies LocaleDecisionSource, suppressGeo: false };
}

export function frCaRedirectInput(input: LocaleRedirectInput, extras: FrCaRedirectExtras): LocaleRedirectInput {
  if (!extras.decision.frenchRegions && !extras.redirect.preferredLocale) return input;
  return { ...input, ...extras.redirect };
}

/** True when a manual toggle, profile, or cookie already chose a language. */
export function frCaChoiceLocked(input: VisitorLocaleInput): boolean {
  if (input.profileChosen && isShippedLocale(input.profileLocale)) return true;
  if (isShippedLocale(input.cookie)) return true;
  if (isShippedLocale(input.queryLocale)) return true;
  return false;
}
