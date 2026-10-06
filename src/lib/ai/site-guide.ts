/**
 * What the help chat is allowed to know.
 * Answers are KidEase pages, a published benefit figure, or a live city count.
 * The chat never changes a profile and never invents a centre, fee, or spot.
 */

import { AB_K_FACILITY_MAX_UNDER_50K, CCB } from "../benefits-facts.ts";
import { CITY_HUB_DEFS, cityHubCityName, cityHubPath, normalizeCityKey, type CityHubDef } from "../city-hubs.ts";
import { localePath } from "../locale-path.ts";
import { RANKING_BEST_MATCH_FLAG } from "../ranking/weights.ts";
import { AI_FLAGS } from "./flags.ts";
import { PARENT_PAGES, groundParentAnswer, type ParentAnswer } from "./parent-helper.ts";

export type GuideAudience = "guest" | "parent" | "provider" | "staff" | "admin";
export type GuideLocale = "en" | "fr";

export type GuidePage = {
  path: string;
  text: string;
};

type NavPage = {
  path: string;
  phrases: readonly string[];
  en: string;
  fr: string;
};

const NAV: readonly NavPage[] = [
  {
    path: "/search",
    phrases: ["search", "find a daycare", "find daycares", "find a centre", "trouver une garderie", "trouver un centre", "chercher"],
    en: "Open Search and type a city. You can filter by age. KidEase lists licensed childcare. A fee or an open spot is shown only when that centre entered it.",
    fr: "Ouvrez Recherche et tapez une ville. Vous pouvez filtrer par âge. KidEase affiche la garde permise. Des frais ou une place libre s'affichent seulement si le centre les a inscrits.",
  },
  {
    path: "/claim",
    phrases: ["claim", "claim a listing", "reclamer", "reclamez"],
    en: "To claim a listing, open Claim and confirm you run that centre. Then edit it from the daycare desk. Claiming does not invent a fee or a spot.",
    fr: "Pour réclamer une fiche, ouvrez Réclamer et confirmez que vous dirigez ce centre. Modifiez-la ensuite dans le bureau de la garderie. Réclamer n'invente pas des frais ni une place.",
  },
  {
    path: "/how-it-works",
    phrases: ["how it works", "how do i use", "how does kidease", "comment ca marche", "comment utiliser"],
    en: "Search finds licensed daycares. Open a listing to request info or a tour. Parents track requests on the parent desk. Daycares claim a listing, then use the daycare desk.",
    fr: "Recherche trouve les garderies permises. Ouvrez une fiche pour demander des infos ou une visite. Les parents suivent les demandes dans le bureau parent. Les garderies réclament une fiche, puis utilisent le bureau garderie.",
  },
  {
    path: "/parent",
    phrases: ["waitlist", "waitlists", "liste d attente", "parent desk", "bureau parent", "my requests", "mes demandes", "saved centres"],
    en: "The parent desk holds your requests, waitlists, and saved centres. Open Parent, then Waitlists, to see a request or withdraw it. Other families are not shown.",
    fr: "Le bureau parent garde vos demandes, vos listes d'attente et vos centres enregistrés. Ouvrez Parent, puis Listes d'attente, pour voir une demande ou la retirer. Les autres familles ne s'affichent pas.",
  },
  {
    path: "/provider",
    phrases: ["daycare desk", "bureau garderie", "my listing", "ma fiche", "tour times", "heures de visite"],
    en: "The daycare desk is where you update your listing, tour times, and parent requests. A fee or a spot is public only after you enter it.",
    fr: "Le bureau garderie sert à mettre à jour votre fiche, les heures de visite et les demandes des parents. Des frais ou une place sont publics seulement après que vous les inscrivez.",
  },
  {
    path: "/inbox",
    phrases: ["inbox", "message the", "messages", "boite", "ecrire au centre"],
    en: "Messages with a centre are in Inbox. You write and send them yourself. This chat does not send a message for you.",
    fr: "Les messages avec un centre sont dans la boîte. Vous les écrivez et les envoyez vous-même. Ce clavardage n'envoie pas un message à votre place.",
  },
  {
    path: "/benefits",
    phrases: ["benefit", "benefits", "subsidy", "prestation", "subvention", "child benefit", "10 a day", "allocation"],
    en: `The Canada Child Benefit maximum for a child under 6 is ${CCB.maxUnder6Year} a year for July 2026 to June 2027. The Alberta kindergarten facility-based maximum when income is under 50000 is ${AB_K_FACILITY_MAX_UNDER_50K} a month. Manitoba funded licensed child care has a maximum regulated daily fee of 10 dollars. KidEase does not process the application.`,
    fr: `Le maximum de l'Allocation canadienne pour enfants pour un enfant de moins de 6 ans est ${CCB.maxUnder6Year} par année, de juillet 2026 à juin 2027. Le maximum albertain pour la maternelle en installation, si le revenu est sous 50000, est ${AB_K_FACILITY_MAX_UNDER_50K} par mois. Au Manitoba, les frais quotidiens maximums en garde financée sont de 10 dollars. KidEase ne traite pas la demande.`,
  },
  {
    path: "/faq",
    phrases: ["invent a fee", "invent a spot", "is a fee real", "frais invent"],
    en: "KidEase lists licensed childcare. A fee or an open spot is shown only when that centre entered it. KidEase does not invent a spot, a fee, or a licence.",
    fr: "KidEase affiche la garde permise. Des frais ou une place libre s'affichent seulement si le centre les a inscrits. KidEase n'invente pas une place, des frais ou un permis.",
  },
  {
    path: "/help",
    phrases: ["book a tour", "request a tour", "reserver une visite", "demander une visite"],
    en: "You book a tour on the centre listing. Ask about the hours, ages, and fees that are already posted. KidEase does not confirm a spot.",
    fr: "Vous demandez une visite sur la fiche du centre. Posez des questions sur les heures, les âges et les frais déjà affichés. KidEase ne confirme pas une place.",
  },
  {
    path: "/notifications",
    phrases: ["notification", "notifications", "unsubscribe", "desabonner", "alert preference"],
    en: "Alert choices are on Notification preferences. This chat cannot change them. Open that page and save.",
    fr: "Les choix d'alertes sont dans Préférences de notification. Ce clavardage ne peut pas les changer. Ouvrez cette page et enregistrez.",
  },
  {
    path: "/contact",
    phrases: ["contact", "email support", "joindre", "write to support"],
    en: "Use Contact to write to KidEase. This chat can also ask for a person, which opens a ticket. We do not promise a reply time.",
    fr: "Utilisez Contact pour écrire à KidEase. Ce clavardage peut aussi demander une personne, ce qui ouvre un billet. Nous ne promettons pas de délai.",
  },
  {
    path: "/plans",
    phrases: ["parent plus", "subscription", "abonnement", "pricing", "plans"],
    en: "Plans are on the Plans page. The free listing and claim stay available. This chat does not change your plan.",
    fr: "Les forfaits sont sur la page Forfaits. La fiche et la réclamation gratuites restent offertes. Ce clavardage ne change pas votre forfait.",
  },
  {
    path: "/cities",
    phrases: ["which cities", "quelles villes", "city list", "liste des villes"],
    en: "City pages are listed on Cities. Open a city to see its licensed listings. A count is the number of public listings, not open spots.",
    fr: "Les pages de ville sont sur Villes. Ouvrez une ville pour voir ses fiches permises. Un nombre est le total de fiches publiques, pas les places libres.",
  },
  {
    path: "/login",
    phrases: ["sign in", "log in", "connexion", "se connecter"],
    en: "Sign in on the login page. After that you can open your parent desk or daycare desk. This chat cannot sign in for you.",
    fr: "Connectez-vous sur la page de connexion. Ensuite vous pouvez ouvrir le bureau parent ou le bureau garderie. Ce clavardage ne peut pas vous connecter.",
  },
  {
    path: "/signup",
    phrases: ["sign up", "create an account", "creer un compte"],
    en: "Create an account on Sign up. Pick parent or daycare. This chat cannot create the account for you.",
    fr: "Créez un compte sur Inscription. Choisissez parent ou garderie. Ce clavardage ne peut pas créer le compte.",
  },
  {
    path: "/guides",
    phrases: ["province guide", "guides", "guide for"],
    en: "Province guides are on Guides. They explain that province's public rules. They do not confirm a spot at a centre.",
    fr: "Les guides par province sont sur Guides. Ils expliquent les règles publiques de cette province. Ils ne confirment pas une place dans un centre.",
  },
  {
    path: "/compare",
    phrases: ["compare", "comparer"],
    en: "Compare holds centres you picked so you can look at them together. It does not rank them with a fee KidEase invented.",
    fr: "Comparer garde les centres que vous avez choisis pour les voir ensemble. Il ne les classe pas avec des frais inventés par KidEase.",
  },
  {
    path: "/tour-checklist",
    phrases: ["what to ask", "questions for the tour", "quoi demander", "liste de visite"],
    en: "The tour checklist is questions to ask on a visit: ages posted, hours posted, and whether a fee is posted. KidEase does not confirm a spot.",
    fr: "La liste de visite donne des questions à poser : âges affichés, heures affichées, et si des frais sont affichés. KidEase ne confirme pas une place.",
  },
  {
    path: "/start-a-daycare",
    phrases: ["start a daycare", "ouvrir une garderie"],
    en: "Start a daycare explains opening a program. It does not file the licence for you. The province issues the licence.",
    fr: "Démarrer une garderie explique comment ouvrir un service. KidEase ne dépose pas le permis. La province délivre le permis.",
  },
  {
    path: "/for-daycares",
    phrases: ["for daycares", "i run a daycare", "je dirige"],
    en: "For daycares is the page for owners. Claim your free listing, then manage messages and tours from the daycare desk.",
    fr: "Pour les garderies est la page pour les propriétaires. Réclamez votre fiche gratuite, puis gérez les messages et les visites dans le bureau garderie.",
  },
  {
    path: "/delete-account",
    phrases: ["delete my account", "supprimer mon compte"],
    en: "Delete account is its own page. This chat cannot delete an account. Open that page if you want to start it.",
    fr: "Supprimer le compte est une page à part. Ce clavardage ne peut pas supprimer un compte. Ouvrez cette page si vous voulez commencer.",
  },
  {
    path: "/need-care-fast",
    phrases: ["need care fast", "urgent care", "garde urgente"],
    en: "Need care fast helps you search sooner. It does not hold a spot. A centre still has to confirm.",
    fr: "Besoin de garde vite aide à chercher plus tôt. Cela ne réserve pas une place. Le centre doit encore confirmer.",
  },
];

type Tool = {
  flag: string;
  audiences: readonly GuideAudience[];
  path: string;
  en: string;
  fr: string;
};

const TOOLS: readonly Tool[] = [
  {
    flag: AI_FLAGS.parentHelper,
    audiences: ["guest", "parent", "provider", "staff", "admin"],
    path: "/help",
    en: "This help chat, for search, pages, and your account.",
    fr: "Ce clavardage d'aide, pour la recherche, les pages et votre compte.",
  },
  {
    flag: AI_FLAGS.smartMatch,
    audiences: ["guest", "parent", "admin"],
    path: "/search",
    en: "Find my match on Search. It only uses facts you already entered.",
    fr: "Trouver mon centre, sur Recherche. Il utilise seulement les faits que vous avez déjà inscrits.",
  },
  {
    flag: RANKING_BEST_MATCH_FLAG,
    audiences: ["guest", "parent", "admin"],
    path: "/search",
    en: "Best match sort on Search. If it is off, Search stays on Distance.",
    fr: "Le tri Meilleur choix, sur Recherche. S'il est éteint, Recherche reste sur Distance.",
  },
  {
    flag: AI_FLAGS.reviewSummary,
    audiences: ["guest", "parent", "provider", "admin"],
    path: "/search",
    en: "Short review points on a listing that already has enough verified reviews.",
    fr: "De courts points d'avis sur une fiche qui a déjà assez d'avis vérifiés.",
  },
  {
    flag: AI_FLAGS.listingWriter,
    audiences: ["provider", "admin"],
    path: "/provider",
    en: "Write it for me on your listing. You edit the draft before it is saved.",
    fr: "Écrivez-le pour moi, sur votre fiche. Vous corrigez le brouillon avant de l'enregistrer.",
  },
  {
    flag: AI_FLAGS.photoCheck,
    audiences: ["provider", "admin"],
    path: "/provider",
    en: "Photo check when you upload. It can warn about a blurry, dark, or duplicate photo.",
    fr: "Vérification des photos à l'envoi. Elle peut avertir d'une photo floue, sombre ou en double.",
  },
  {
    flag: AI_FLAGS.replyDrafts,
    audiences: ["provider", "admin"],
    path: "/inbox",
    en: "Draft reply in your inbox. You edit it, then you send it.",
    fr: "Brouillon de réponse dans votre boîte. Vous le corrigez, puis vous l'envoyez.",
  },
  {
    flag: AI_FLAGS.translate,
    audiences: ["provider", "admin"],
    path: "/provider",
    en: "A French draft of your listing text. It is labelled auto-translated and you can edit it.",
    fr: "Un brouillon français du texte de votre fiche. Il est marqué traduit automatiquement et vous pouvez le modifier.",
  },
  {
    flag: AI_FLAGS.spotAlerts,
    audiences: ["provider", "admin"],
    path: "/provider",
    en: "Spot alerts when you mark an opening. Nothing is sent until you approve it.",
    fr: "Alertes de place quand vous marquez une ouverture. Rien n'est envoyé tant que vous n'approuvez pas.",
  },
  {
    flag: AI_FLAGS.truthChecker,
    audiences: ["admin"],
    path: "/admin-truth",
    en: "Listing-change queue. A person confirms each change. It does not edit a listing by itself.",
    fr: "File des changements de fiche. Une personne confirme chaque changement. Rien n'est modifié tout seul.",
  },
  {
    flag: AI_FLAGS.licenceReader,
    audiences: ["admin"],
    path: "/admin",
    en: "Licence reader for a person to confirm. It does not publish a licence on its own.",
    fr: "Lecteur de permis, pour qu'une personne confirme. Il ne publie pas un permis tout seul.",
  },
  {
    flag: AI_FLAGS.spamFilter,
    audiences: ["admin"],
    path: "/admin-spam",
    en: "Spam and fraud queue. A person reviews the high scores.",
    fr: "File de pourriel et de fraude. Une personne révise les scores élevés.",
  },
  {
    flag: AI_FLAGS.supportTriage,
    audiences: ["admin"],
    path: "/admin-triage",
    en: "Support drafts. Drafts are not sent.",
    fr: "Brouillons d'aide. Les brouillons ne sont pas envoyés.",
  },
  {
    flag: AI_FLAGS.demandMap,
    audiences: ["admin"],
    path: "/admin-ranking",
    en: "Demand map on the ranking desk. It reads searches KidEase already stored.",
    fr: "Carte de la demande sur le bureau de classement. Elle lit les recherches que KidEase a déjà gardées.",
  },
];

function fold(value: string): string {
  return normalizeCityKey(value);
}

function padded(value: string): string {
  return ` ${fold(value)} `;
}

function hit(question: string, phrases: readonly string[]): number {
  const hay = padded(question);
  let score = 0;
  for (const phrase of phrases) {
    const needle = fold(phrase);
    if (!needle) continue;
    if (hay.includes(` ${needle} `) || (needle.length > 3 && hay.includes(needle))) score += 2;
  }
  return score;
}

export function guideAudienceFromRole(role: string | null | undefined): GuideAudience {
  const v = String(role || "").trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "support" || v === "support_lead") return "staff";
  if (v === "provider") return "provider";
  return "parent";
}

function cityNames(hub: CityHubDef): string[] {
  const names = [hub.city, hub.cityEn, hub.cityFr, ...(hub.aliases ?? [])].map((name) => fold(name)).filter(Boolean);
  return [...new Set(names)].filter((name) => name !== "quebec");
}

export function cityFromQuestion(question: string): CityHubDef | null {
  const hay = padded(question);
  const ranked = CITY_HUB_DEFS.flatMap((hub) => cityNames(hub).map((name) => ({ hub, name }))).sort(
    (a, b) => b.name.length - a.name.length,
  );
  const found = ranked.find((row) => hay.includes(` ${row.name} `) || hay.includes(row.name));
  return found?.hub ?? null;
}

export function asksForCount(question: string): boolean {
  return hit(question, ["how many", "number of", "count of", "combien", "nombre de"]) > 0;
}

export function asksForTools(question: string): boolean {
  return (
    hit(question, [
      "what can i use",
      "ai tools",
      "which tools",
      "what do i have",
      "features i",
      "outils",
      "capacites",
      "intelligence artificielle",
      "what ai",
      "ai can",
    ]) > 0
  );
}

export function asksForProfile(question: string): boolean {
  const q = fold(question);
  if (/\b(profile|profil)\b/.test(q)) return true;
  if (/\b(password|mot de passe)\b/.test(q)) return true;
  return (
    /\b(update|change|edit|modifier|changer)\b/.test(q) && /\b(name|nom|email|courriel|photo|phone|telephone|language|langue)\b/.test(q)
  );
}

export function asksForMap(question: string): boolean {
  return (
    hit(question, [
      "how do i use",
      "navigate",
      "get around",
      "how does the site",
      "comment utiliser",
      "se deplacer",
      "site map",
      "whole site",
      "tout le site",
    ]) > 0
  );
}

function loc(locale: GuideLocale, en: string, fr: string): string {
  return locale === "fr" ? fr : en;
}

function cite(path: string, locale: GuideLocale): string {
  return localePath(path, locale);
}

function answer(locale: GuideLocale, path: string, en: string, fr: string): ParentAnswer {
  return { known: true, answer: loc(locale, en, fr), path: cite(path, locale) };
}

function toolsOn(audience: GuideAudience, flags: Record<string, boolean | undefined>): Tool[] {
  return TOOLS.filter((tool) => tool.audiences.includes(audience) && flags[tool.flag] === true);
}

function toolsAnswer(audience: GuideAudience, flags: Record<string, boolean | undefined>, locale: GuideLocale): ParentAnswer {
  const tools = toolsOn(audience, flags);
  const lines = tools.map((tool) => loc(locale, tool.en, tool.fr));
  if (!lines.length) {
    return answer(
      locale,
      "/search",
      "On your visit, Search is open. Extra tools are off for you right now. I can't turn a tool on.",
      "Pour votre visite, Recherche est ouverte. Les autres outils sont éteints pour vous en ce moment. Je ne peux pas allumer un outil.",
    );
  }
  const list = lines.join(" ");
  return answer(
    locale,
    tools[0].path,
    `On your visit you can use: ${list} I can't turn a tool on or off, and I can't change your profile from chat.`,
    `Pour votre visite, vous pouvez utiliser : ${list} Je ne peux pas allumer ou éteindre un outil, et je ne peux pas modifier votre profil dans le clavardage.`,
  );
}

function profileAnswer(audience: GuideAudience, locale: GuideLocale): ParentAnswer {
  if (audience === "guest") {
    return answer(
      locale,
      "/login",
      "I can't change a profile from chat. Sign in, open Profile, edit your name or photo, then press Save.",
      "Je ne peux pas modifier un profil dans le clavardage. Connectez-vous, ouvrez Profil, modifiez le nom ou la photo, puis appuyez sur Enregistrer.",
    );
  }
  return answer(
    locale,
    "/account",
    "I can't change your profile from chat. Open Profile, edit your name or photo, then press Save.",
    "Je ne peux pas modifier votre profil dans le clavardage. Ouvrez Profil, modifiez le nom ou la photo, puis appuyez sur Enregistrer.",
  );
}

function countAnswer(hub: CityHubDef, count: number | null, locale: GuideLocale): ParentAnswer {
  const city = cityHubCityName(hub, locale);
  const path = cityHubPath(hub.slug);
  if (typeof count === "number" && count > 0) {
    return answer(
      locale,
      path,
      `${city} has ${count} licensed listings on KidEase. Open that city page to see them. That number is listings, not open spots. A fee or a spot is shown only when the centre entered it.`,
      `${city} compte ${count} fiches de garde permise sur KidEase. Ouvrez la page de la ville pour les voir. Ce nombre est des fiches, pas des places libres. Des frais ou une place s'affichent seulement si le centre les a inscrits.`,
    );
  }
  return answer(
    locale,
    path,
    `Open the ${city} page to see licensed listings. KidEase is not showing a separate count for that city right now. A fee or a spot is shown only when the centre entered it.`,
    `Ouvrez la page de ${city} pour voir les fiches permises. KidEase n'affiche pas un nombre à part pour cette ville en ce moment. Des frais ou une place s'affichent seulement si le centre les a inscrits.`,
  );
}

function findCityAnswer(hub: CityHubDef, locale: GuideLocale): ParentAnswer {
  const city = cityHubCityName(hub, locale);
  return answer(
    locale,
    cityHubPath(hub.slug),
    `Licensed listings for ${city} are on that city page. A fee or an open spot is shown only when the centre entered it.`,
    `Les fiches permises pour ${city} sont sur la page de cette ville. Des frais ou une place libre s'affichent seulement si le centre les a inscrits.`,
  );
}

function bestNav(question: string): { page: NavPage; score: number; second: number } | null {
  const ranked = NAV.map((page) => ({ page, score: hit(question, page.phrases) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  return { page: ranked[0].page, score: ranked[0].score, second: ranked[1]?.score ?? 0 };
}

export type GuideTurn = {
  needsCityCount: boolean;
  citySlug: string | null;
  needsCanadaTotal: boolean;
  direct: ParentAnswer | null;
  pages: GuidePage[];
};

function guidePages(locale: GuideLocale, extra: GuidePage[]): GuidePage[] {
  const base = [
    ...extra,
    ...NAV.map((page) => ({ path: cite(page.path, locale), text: loc(locale, page.en, page.fr) })),
    ...PARENT_PAGES.map((page) => ({ path: cite(page.path, locale), text: page.text })),
  ];
  const seen = new Set<string>();
  return base.filter((page) => {
    if (seen.has(page.path)) return false;
    seen.add(page.path);
    return true;
  });
}

export function prepareGuideTurn(input: {
  question: string;
  audience: GuideAudience;
  locale: GuideLocale;
  flags?: Record<string, boolean | undefined>;
  cityCount?: number | null;
  canadaTotal?: number | null;
}): GuideTurn {
  const question = String(input.question || "");
  const locale = input.locale === "fr" ? "fr" : "en";
  const flags = input.flags ?? {};
  const hub = cityFromQuestion(question);
  const count = asksForCount(question);
  const needsCityCount = Boolean(hub && count);
  const needsCanadaTotal = count && !hub;
  let direct: ParentAnswer | null = null;
  const extra: GuidePage[] = [];

  if (asksForProfile(question)) {
    direct = profileAnswer(input.audience, locale);
  } else if (asksForTools(question)) {
    direct = toolsAnswer(input.audience, flags, locale);
  } else if (needsCityCount && hub) {
    direct = countAnswer(hub, input.cityCount ?? null, locale);
  } else if (needsCanadaTotal && typeof input.canadaTotal === "number" && input.canadaTotal > 0) {
    direct = answer(
      locale,
      "/cities",
      `KidEase has ${input.canadaTotal} public licensed listings across Canada. Open Cities to browse. That number is listings, not open spots.`,
      `KidEase compte ${input.canadaTotal} fiches publiques de garde permise au Canada. Ouvrez Villes pour parcourir. Ce nombre est des fiches, pas des places libres.`,
    );
  } else if (asksForMap(question)) {
    const page = NAV.find((row) => row.path === "/how-it-works");
    if (page) direct = answer(locale, page.path, page.en, page.fr);
  } else if (hub && hit(question, ["daycare", "daycares", "centre", "centres", "garderie", "garderies", "listing", "listings", "fiche", "fiches"])) {
    direct = findCityAnswer(hub, locale);
  } else {
    const nav = bestNav(question);
    if (nav && nav.score >= 2 && nav.score > nav.second) {
      direct = answer(locale, nav.page.path, nav.page.en, nav.page.fr);
    }
  }

  if (direct) extra.push({ path: direct.path || "/help", text: direct.answer });
  return {
    needsCityCount,
    citySlug: hub?.slug ?? null,
    needsCanadaTotal,
    direct,
    pages: guidePages(locale, extra),
  };
}

export function isGuideIgnorance(answer: string): boolean {
  return /don'?t know|do not know|not sure|je ne sais|je ne le sais|aucune idee|aucune idée/i.test(answer);
}

export function unknownGuideAnswer(locale: GuideLocale): ParentAnswer {
  return {
    known: false,
    answer: locale === "fr" ? "Je ne le sais pas d’après les pages KidEase." : "I don't know that from KidEase pages.",
    path: null,
  };
}

/** Prefer a page we already know. A model "I do not know" does not replace it. */
export function finishGuideAnswer(
  model: { answer: string; path: string } | null,
  turn: GuideTurn,
  locale: GuideLocale,
): ParentAnswer {
  if (turn.direct) return turn.direct;
  const grounded = groundParentAnswer(model, turn.pages);
  if (grounded.known && !isGuideIgnorance(grounded.answer)) return grounded;
  return unknownGuideAnswer(locale);
}
