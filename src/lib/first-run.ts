/**
 * First-run onboarding decisions. Pure: no React, no database, no mail.
 * FEATURE_FIRST_RUN_ONBOARDING stays off until it is turned on.
 * Seeing a tour once is permanent. Replay opens it on purpose and does not clear that.
 */

export const SETUP_CALL_URL = "https://calendly.com/kidease/kidease-demo";
export const ONBOARDING_STORAGE_KEY = "kidease-first-run";

export const WELCOME_PARENT = "welcome:parent";
export const WELCOME_PROVIDER = "welcome:provider";
export const CHECKLIST_PARENT = "checklist:parent";
export const CHECKLIST_PROVIDER = "checklist:provider";

export const TOUR_KEYS = [
  "tour:parent:search",
  "tour:parent:saved",
  "tour:parent:messages",
  "tour:parent:payments",
  "tour:provider:requests",
  "tour:provider:tours",
  "tour:provider:messages",
  "tour:provider:attendance",
  "tour:provider:money",
] as const;

export type TourKey = (typeof TOUR_KEYS)[number];
export type WelcomeKey = typeof WELCOME_PARENT | typeof WELCOME_PROVIDER;
export type ChecklistKey = typeof CHECKLIST_PARENT | typeof CHECKLIST_PROVIDER;
export type OnboardingKey = WelcomeKey | ChecklistKey | TourKey;

export const ONBOARDING_KEYS: readonly OnboardingKey[] = [
  WELCOME_PARENT,
  WELCOME_PROVIDER,
  CHECKLIST_PARENT,
  CHECKLIST_PROVIDER,
  ...TOUR_KEYS,
];

export type FirstRunLocale = "en" | "fr";

export type Localized = { en: string; fr: string };

export type OnboardingState = {
  seen: string[];
  dismissed: string[];
};

export const EMPTY_ONBOARDING: OnboardingState = { seen: [], dismissed: [] };

export type Slide = { title: Localized; body: Localized; anchors: readonly string[] };

export type TourStep = { anchor: string; title: Localized; body: Localized };

export type Box = { top: number; left: number; width: number; height: number };

export type CoachPlacement = { top: number; left: number; width: number; arrow: "up" | "down" };

export type GuideArticle = {
  id: string;
  audience: "parent" | "provider";
  replay: OnboardingKey;
  keywords: string[];
  title: Localized;
  body: Localized;
};

export type ChecklistStepId =
  | "photos"
  | "fees"
  | "ages"
  | "openings"
  | "tours"
  | "payouts"
  | "staff"
  | "profile"
  | "child"
  | "saved"
  | "tour";

export type ChecklistStep = {
  id: ChecklistStepId;
  done: boolean;
  href: string;
  label: Localized;
};

export type ChecklistResult = {
  id: ChecklistKey;
  steps: ChecklistStep[];
  done: number;
  total: number;
  percent: number;
  complete: boolean;
};

export type ProviderSetupFacts = {
  hasCentre: boolean;
  photos: string | null;
  infantMonthly: number | null;
  toddlerMonthly: number | null;
  preschoolMonthly: number | null;
  partTimeMonthly: number | null;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  agesConfirmed: boolean;
  licensedCapacity: number | null;
  spotsInfant: number | null;
  spotsToddler: number | null;
  spotsPreschool: number | null;
  openingsKnown: boolean;
  tourTimes: boolean;
  chargesEnabled: boolean;
  staffInvited: boolean;
};

export type ParentQuickFacts = {
  profileReady: boolean;
  hasChild: boolean;
  hasSaved: boolean;
  hasTourRequest: boolean;
};

export type OnboardingPlace = {
  welcome: WelcomeKey | null;
  tour: TourKey | null;
  checklist: ChecklistKey | null;
};

const QUIET_PREFIXES = [
  "/login",
  "/signup",
  "/verify",
  "/verify-2fa",
  "/reset-password",
  "/forgot-password",
  "/admin",
  "/gov",
  "/support",
  "/kiosk",
];

export function pickCopy(locale: FirstRunLocale, text: Localized): string {
  return locale === "fr" ? text.fr : text.en;
}

export function stepCounter(locale: FirstRunLocale, index: number, total: number): string {
  const n = index + 1;
  return locale === "fr" ? `Étape ${n} sur ${total}` : `Step ${n} of ${total}`;
}

export function readinessLabel(locale: FirstRunLocale, percent: number): string {
  const n = Math.max(0, Math.min(100, Math.round(percent)));
  return locale === "fr" ? `Votre centre est prêt à ${n} %` : `Your centre is ${n}% ready`;
}

export function parentProgressLabel(locale: FirstRunLocale, done: number, total: number): string {
  return locale === "fr" ? `${done} étape${done === 1 ? "" : "s"} sur ${total}` : `${done} of ${total} steps done`;
}

function barePath(pathname: string): string {
  const path = pathname.startsWith("/fr/") ? pathname.slice(3) : pathname === "/fr" ? "/" : pathname;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function quiet(path: string): boolean {
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-")) return true;
  if (path === "/gov" || path.startsWith("/gov/") || path.startsWith("/gov-")) return true;
  return QUIET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Admin and government desks never auto-open a tour. Replay still works. */
export function blocksAutoTour(role: string | null | undefined): boolean {
  return role === "admin" || role === "government";
}

export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
  return !(
    a.left + a.width + gap <= b.left ||
    b.left + b.width + gap <= a.left ||
    a.top + a.height + gap <= b.top ||
    b.top + b.height + gap <= a.top
  );
}

/** Puts the bubble beside the target, never on top of it. */
export function placeCoachBubble(
  target: Box,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
): CoachPlacement {
  const margin = 12;
  const gap = 16;
  const width = Math.min(bubble.width, Math.max(160, viewport.width - margin * 2));
  const height = bubble.height;
  const center = target.left + target.width / 2;
  const left = Math.max(margin, Math.min(center - width / 2, viewport.width - width - margin));
  const below = target.top + target.height + gap;
  const above = target.top - gap - height;
  const roomBelow = viewport.height - margin - below;
  const roomAbove = above - margin;
  const arrow: "up" | "down" = roomBelow >= height || roomBelow >= roomAbove ? "up" : "down";
  const rawTop = arrow === "up" ? below : above;
  const top = Math.max(margin, Math.min(rawTop, viewport.height - height - margin));
  return { top, left, width, arrow };
}

export function stepAnchors(step: { anchor?: string; anchors?: readonly string[] }): string[] {
  if (step.anchors && step.anchors.length) return [...step.anchors];
  return step.anchor ? [step.anchor] : [];
}

/** Drops a step when none of its targets are on the page. */
export function presentCoachSteps<T extends { anchor?: string; anchors?: readonly string[] }>(
  steps: readonly T[],
  present: (selector: string) => boolean,
): T[] {
  return steps.filter((step) => stepAnchors(step).some((selector) => present(selector)));
}

/** Which auto surfaces belong on this screen. Replay ignores this. */
export function onboardingPlace(input: {
  pathname: string;
  desk?: string | null;
  tab?: string | null;
  view?: string | null;
}): OnboardingPlace {
  const path = barePath(input.pathname || "/");
  if (quiet(path)) return { welcome: null, tour: null, checklist: null };
  const desk = String(input.desk || "");
  const tab = String(input.tab || "");
  const view = String(input.view || "");
  if (path === "/provider" || path.startsWith("/provider/")) {
    let tour: TourKey | null = null;
    if (desk === "requests") tour = "tour:provider:requests";
    else if (desk === "tours" || desk === "calendar") tour = "tour:provider:tours";
    else if (desk === "money") tour = "tour:provider:money";
    else if (desk === "today" || desk === "") tour = "tour:provider:attendance";
    return { welcome: WELCOME_PROVIDER, tour, checklist: CHECKLIST_PROVIDER };
  }
  if (path === "/inbox" || path.startsWith("/inbox/")) {
    const centre = view === "centre";
    return {
      welcome: centre ? WELCOME_PROVIDER : WELCOME_PARENT,
      tour: centre ? "tour:provider:messages" : "tour:parent:messages",
      checklist: null,
    };
  }
  if (path === "/search") {
    return { welcome: WELCOME_PARENT, tour: "tour:parent:search", checklist: null };
  }
  if (path === "/parent" || path.startsWith("/parent/")) {
    let tour: TourKey | null = null;
    if (tab === "saved") tour = "tour:parent:saved";
    else if (tab === "payments") tour = "tour:parent:payments";
    return { welcome: WELCOME_PARENT, tour, checklist: CHECKLIST_PARENT };
  }
  return { welcome: WELCOME_PARENT, tour: null, checklist: null };
}

export function isOnboardingKey(value: string): value is OnboardingKey {
  return (ONBOARDING_KEYS as readonly string[]).includes(value);
}

function unique(keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    if (!key || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

export function parseOnboardingState(raw: string | null | undefined): OnboardingState {
  if (!raw) return { seen: [], dismissed: [] };
  try {
    const data = JSON.parse(raw) as { seen?: unknown; dismissed?: unknown };
    const seen = Array.isArray(data.seen) ? data.seen.filter((key): key is string => typeof key === "string" && isOnboardingKey(key)) : [];
    const dismissed = Array.isArray(data.dismissed)
      ? data.dismissed.filter((key): key is string => typeof key === "string" && isOnboardingKey(key))
      : [];
    return { seen: unique(seen), dismissed: unique(dismissed) };
  } catch {
    return { seen: [], dismissed: [] };
  }
}

export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify({ seen: unique(state.seen), dismissed: unique(state.dismissed) });
}

/** Once a key is seen on either side, it stays seen. */
export function mergeOnboarding(a: OnboardingState, b: OnboardingState): OnboardingState {
  return {
    seen: unique([...a.seen, ...b.seen].filter(isOnboardingKey)),
    dismissed: unique([...a.dismissed, ...b.dismissed].filter(isOnboardingKey)),
  };
}

export function markSeen(state: OnboardingState, key: string): OnboardingState {
  if (!isOnboardingKey(key) || state.seen.includes(key)) return state;
  return { ...state, seen: [...state.seen, key] };
}

export function markDismissed(state: OnboardingState, key: string): OnboardingState {
  const next = markSeen(state, key);
  if (!isOnboardingKey(key) || next.dismissed.includes(key)) return next;
  return { ...next, dismissed: [...next.dismissed, key] };
}

/** Opens a checklist from Help again. Does not make a tour auto-show. */
export function reopenChecklist(state: OnboardingState, key: string): OnboardingState {
  if (!state.dismissed.includes(key)) return state;
  return { ...state, dismissed: state.dismissed.filter((item) => item !== key) };
}

export function shouldAutoShow(state: OnboardingState, key: string | null): boolean {
  if (!key || !isOnboardingKey(key)) return false;
  return !state.seen.includes(key);
}

export function canDismissChecklist(id: ChecklistKey, complete: boolean): boolean {
  if (id === CHECKLIST_PROVIDER) return complete;
  return true;
}

export function checklistOpen(state: OnboardingState, id: ChecklistKey): boolean {
  return !state.dismissed.includes(id);
}

export function dismissChecklist(state: OnboardingState, id: ChecklistKey, complete: boolean): OnboardingState {
  if (!canDismissChecklist(id, complete)) return state;
  return markDismissed(state, id);
}

function finite(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasPhoto(photos: string | null): boolean {
  const parts = String(photos || "")
    .split(/[,|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.some((src) => {
    const value = src.toLowerCase();
    if (!value || value.includes("placeholder") || value.includes("-logo")) return false;
    return true;
  });
}

function hasFee(facts: ProviderSetupFacts): boolean {
  return [facts.infantMonthly, facts.toddlerMonthly, facts.preschoolMonthly, facts.partTimeMonthly].some(
    (n) => finite(n) > 0,
  );
}

function hasAgesAndCapacity(facts: ProviderSetupFacts): boolean {
  const min = finite(facts.ageMinMonths);
  const max = finite(facts.ageMaxMonths);
  const ages = facts.agesConfirmed === true || (max > min && max > 0);
  const capacity =
    finite(facts.licensedCapacity) > 0 ||
    finite(facts.spotsInfant) + finite(facts.spotsToddler) + finite(facts.spotsPreschool) > 0;
  return ages && capacity;
}

export function readinessPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

function pack(steps: ChecklistStep[], id: ChecklistKey): ChecklistResult {
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  return { id, steps, done, total, percent: readinessPercent(done, total), complete: total > 0 && done === total };
}

export function providerSetup(facts: ProviderSetupFacts): ChecklistResult {
  const centre = facts.hasCentre === true;
  const steps: ChecklistStep[] = [
    {
      id: "photos",
      done: centre && hasPhoto(facts.photos),
      href: centre ? "/provider?desk=listings" : "/claim",
      label: { en: "Add photos", fr: "Ajouter des photos" },
    },
    {
      id: "fees",
      done: centre && hasFee(facts),
      href: centre ? "/provider?desk=listings#listing-health-fees" : "/claim",
      label: { en: "Set fees", fr: "Entrer les tarifs" },
    },
    {
      id: "ages",
      done: centre && hasAgesAndCapacity(facts),
      href: centre ? "/provider?desk=listings" : "/claim",
      label: { en: "Set ages and capacity", fr: "Entrer les âges et la capacité" },
    },
    {
      id: "openings",
      done: centre && facts.openingsKnown === true,
      href: centre ? "/provider?desk=listings" : "/claim",
      label: { en: "Add openings", fr: "Ajouter les places" },
    },
    {
      id: "tours",
      done: centre && facts.tourTimes === true,
      href: centre ? "/provider?desk=tours" : "/claim",
      label: { en: "Set tour times", fr: "Choisir les heures de visite" },
    },
    {
      id: "payouts",
      done: centre && facts.chargesEnabled === true,
      href: centre ? "/provider?desk=money" : "/claim",
      label: { en: "Connect payouts", fr: "Brancher les versements" },
    },
    {
      id: "staff",
      done: centre && facts.staffInvited === true,
      href: centre ? "/provider?desk=employees" : "/claim",
      label: { en: "Invite a staff member", fr: "Inviter un membre du personnel" },
    },
  ];
  return pack(steps, CHECKLIST_PROVIDER);
}

export function parentQuickStart(facts: ParentQuickFacts): ChecklistResult {
  const steps: ChecklistStep[] = [
    {
      id: "profile",
      done: facts.profileReady === true,
      href: "/account?tab=profile",
      label: { en: "Finish your profile", fr: "Compléter votre profil" },
    },
    {
      id: "child",
      done: facts.hasChild === true,
      href: "/parent?tab=children",
      label: { en: "Add a child", fr: "Ajouter un enfant" },
    },
    {
      id: "saved",
      done: facts.hasSaved === true,
      href: "/search",
      label: { en: "Save a centre", fr: "Enregistrer un centre" },
    },
    {
      id: "tour",
      done: facts.hasTourRequest === true,
      href: "/search",
      label: { en: "Request a tour", fr: "Demander une visite" },
    },
  ];
  return pack(steps, CHECKLIST_PARENT);
}

export const PARENT_SLIDES: readonly Slide[] = [
  {
    anchors: ['[data-tour="parent-search"]', '[data-ke="search-pill"]'],
    title: { en: "Search here", fr: "Cherchez ici" },
    body: { en: "Type a city or a postal code.", fr: "Écrivez une ville ou un code postal." },
  },
  {
    anchors: ['[data-ke="home-care-types"]', '[data-ke="airbnb-care-cats"]', '[data-ke="header-care-categories"]'],
    title: { en: "Pick a type of care", fr: "Choisissez un type" },
    body: { en: "Centres, home daycares, and school-age.", fr: "Centres, milieux familiaux et scolaire." },
  },
  {
    anchors: ['[data-ke="smart-match-open"]'],
    title: { en: "Find my match", fr: "Trouver ma garderie" },
    body: { en: "A few questions narrow the list.", fr: "Quelques questions raccourcissent la liste." },
  },
  {
    anchors: ['article[data-slug]', '[data-ke="search-result-list"]'],
    title: { en: "Open a centre", fr: "Ouvrir un centre" },
    body: { en: "A card shows only facts that centre entered.", fr: "Une fiche montre seulement ce que le centre a entré." },
  },
  {
    anchors: ['[data-ke="help-button"]'],
    title: { en: "Help stays here", fr: "L’aide reste ici" },
    body: { en: "Replay this tour any time.", fr: "Revoir cette visite en tout temps." },
  },
  {
    anchors: ['[data-ke="notification-bell"]'],
    title: { en: "Your notices", fr: "Vos avis" },
    body: { en: "New replies show on the bell.", fr: "Les nouvelles réponses sont sur la cloche." },
  },
  {
    anchors: ['[data-ke="header-avatar"]', '[data-ke="header-login"]'],
    title: { en: "Your account", fr: "Votre compte" },
    body: { en: "Sign in to save centres and write to them.", fr: "Connectez-vous pour enregistrer et écrire." },
  },
];

export const PROVIDER_SLIDES: readonly Slide[] = [
  {
    anchors: ['[data-nav="today"]', '[data-tour="provider-attendance"]'],
    title: { en: "Today", fr: "Aujourd’hui" },
    body: { en: "Requests, visits, and who is here.", fr: "Demandes, visites et qui est là." },
  },
  {
    anchors: ['[data-nav="listings"]'],
    title: { en: "Your listing", fr: "Votre fiche" },
    body: { en: "Photos, fees, and ages families can see.", fr: "Photos, tarifs et âges que les familles voient." },
  },
  {
    anchors: ['[data-nav="requests"]'],
    title: { en: "Requests", fr: "Demandes" },
    body: { en: "Open a family note and reply.", fr: "Ouvrez une note de famille et répondez." },
  },
  {
    anchors: ['[data-nav="calendar"]', '[data-tour="provider-tours"]'],
    title: { en: "Tour times", fr: "Heures de visite" },
    body: { en: "Post a time a family can book.", fr: "Affichez une heure qu’une famille peut réserver." },
  },
  {
    anchors: ['[data-nav="messages"]', '[data-tour="desk-messages"]'],
    title: { en: "Messages", fr: "Messages des familles" },
    body: { en: "Family notes land here. Texts are not on yet.", fr: "Les notes des familles arrivent ici." },
  },
  {
    anchors: ['[data-ke="help-button"]'],
    title: { en: "Help stays here", fr: "L’aide reste ici" },
    body: { en: "Replay this tour any time.", fr: "Revoir cette visite en tout temps." },
  },
  {
    anchors: ['[data-ke="provider-setup"]'],
    title: { en: "Setup list", fr: "Liste de départ" },
    body: { en: "A step ticks when that fact is saved.", fr: "Une étape se coche quand c’est enregistré." },
  },
];

export function welcomeSlides(key: WelcomeKey): readonly Slide[] {
  return key === WELCOME_PROVIDER ? PROVIDER_SLIDES : PARENT_SLIDES;
}

const tip = (anchor: string, enTitle: string, enBody: string, frTitle: string, frBody: string): TourStep => ({
  anchor,
  title: { en: enTitle, fr: frTitle },
  body: { en: enBody, fr: frBody },
});

export const TOURS: Record<TourKey, readonly TourStep[]> = {
  "tour:parent:search": [
    tip("[data-tour=parent-search]", "Search here", "Type a city or a postal code.", "Cherchez ici", "Écrivez une ville ou un code postal."),
    tip("[data-ke=search-submit]", "See the list", "This starts the search.", "Voir la liste", "Ce bouton lance la recherche."),
    tip("[data-ke=search-count]", "Real results", "A fee or an open spot shows only when the centre entered it.", "Des résultats vrais", "Un tarif ou une place s’affiche seulement si le centre l’a entré."),
    tip("[data-ke=sort-row]", "Sort the list", "Pick nearest, or another order, when you want a shorter list.", "Trier la liste", "Choisissez le plus près, ou un autre ordre, pour une liste plus courte."),
  ],
  "tour:parent:saved": [
    tip("[data-tour=parent-saved]", "Your saved centres", "Centres you save stay on this list.", "Vos centres enregistrés", "Les centres enregistrés restent dans cette liste."),
    tip("[data-ke=saved-map-toggle]", "Map or list", "Switch the view when you want to see where they are.", "Carte ou liste", "Changez la vue pour voir où ils sont."),
    tip("[data-tour=parent-saved]", "Ask next", "Open a centre to request a tour or a spot.", "La prochaine étape", "Ouvrez un centre pour demander une visite ou une place."),
  ],
  "tour:parent:messages": [
    tip("[data-tour=desk-messages]", "Your messages", "Replies from centres land here.", "Vos messages", "Les réponses des centres arrivent ici."),
    tip("[data-tour=inbox-search]", "Find a thread", "Search by the centre name.", "Trouver une conversation", "Cherchez le nom du centre."),
    tip("[data-ke=inbox-stage-filters]", "Filter", "Show only the threads you need.", "Filtrer", "Montrez seulement les conversations utiles."),
  ],
  "tour:parent:payments": [
    tip("[data-tour=parent-payments]", "Bills", "Invoices a centre sent you show here.", "Factures", "Les factures envoyées par un centre s’affichent ici."),
    tip("[data-tour=parent-payments]", "Pay one", "Open a bill to pay it. Nothing is due until a centre sends one.", "En payer une", "Ouvrez une facture pour la payer. Rien n’est dû tant qu’un centre n’en envoie pas."),
    tip("[data-tour=parent-payments]", "Paid bills", "Paid bills stay on this page so you can look back.", "Factures payées", "Les factures payées restent ici pour les revoir."),
  ],
  "tour:provider:requests": [
    tip("[data-tour=provider-requests]", "New families", "Tour requests and spot requests show here.", "Nouvelles familles", "Les demandes de visite et de place s’affichent ici."),
    tip("[data-tour=provider-requests]", "Reply", "Open one and answer. The family sees it in their messages.", "Répondre", "Ouvrez-en une et répondez. La famille le voit dans ses messages."),
    tip("[data-tour=provider-requests]", "Nothing yet", "An empty list means no one has written. It is not an error.", "Rien pour l’instant", "Une liste vide veut dire que personne n’a écrit. Ce n’est pas une erreur."),
  ],
  "tour:provider:tours": [
    tip("[data-tour=provider-tours]", "Tour calendar", "Days with a visit are marked.", "Calendrier des visites", "Les jours avec une visite sont marqués."),
    tip("[data-ke=tour-calendar]", "Open times", "Post a time you can meet a family.", "Heures ouvertes", "Affichez une heure où vous pouvez rencontrer une famille."),
    tip("[data-tour=provider-tours]", "Empty day", "A blank day means no visit is booked. Add a time if you want requests.", "Jour vide", "Un jour vide veut dire qu’aucune visite n’est réservée. Ajoutez une heure si vous voulez des demandes."),
  ],
  "tour:provider:messages": [
    tip("[data-tour=desk-messages]", "Centre inbox", "Family messages for your centre are here.", "Boîte du centre", "Les messages des familles pour votre centre sont ici."),
    tip("[data-tour=inbox-search]", "Search", "Find a family by name.", "Chercher", "Trouvez une famille par son nom."),
    tip("[data-ke=inbox-stage-filters]", "Stages", "Filter so you can answer the newest notes first.", "Étapes", "Filtrez pour répondre d’abord aux plus récents."),
  ],
  "tour:provider:attendance": [
    tip("[data-tour=provider-attendance]", "Today", "This is your home for the day: requests, visits, and what needs a reply.", "Aujourd’hui", "C’est votre accueil du jour : demandes, visites et réponses à faire."),
    tip("[data-ke=child-checkin]", "Who is here", "When attendance is on, mark a child here or picked up.", "Qui est là", "Quand les présences sont activées, notez qu’un enfant est là ou parti."),
    tip("[data-tour=provider-attendance]", "No children yet", "An empty attendance list means no enrolled child is on file for today.", "Aucun enfant", "Une liste vide veut dire qu’aucun enfant inscrit n’est au dossier pour aujourd’hui."),
  ],
  "tour:provider:money": [
    tip("[data-tour=provider-money]", "Money", "Invoices you send, and what has been paid, show here.", "Argent", "Les factures que vous envoyez, et ce qui est payé, s’affichent ici."),
    tip("[data-tour=provider-money-title]", "Payouts", "Connect a payout account before card payments can be sent to your centre.", "Versements", "Branchez un compte de versement avant que les paiements par carte aillent à votre centre."),
    tip("[data-tour=provider-money]", "No bills yet", "An empty list means you have not sent an invoice.", "Aucune facture", "Une liste vide veut dire que vous n’avez pas envoyé de facture."),
  ],
};

export const GUIDE_ARTICLES: readonly GuideArticle[] = [
  {
    id: "search-city",
    audience: "parent",
    replay: "tour:parent:search",
    keywords: ["search", "city", "cherche", "ville", "map", "carte"],
    title: { en: "How do I search near me?", fr: "Comment chercher près de chez moi?" },
    body: {
      en: "Open Search and type your city or postal code. KidEase lists licensed centres. A fee or an open spot shows only when that centre entered it.",
      fr: "Ouvrez Recherche et écrivez votre ville ou votre code postal. KidEase liste les centres permis. Un tarif ou une place s’affiche seulement si le centre l’a entré.",
    },
  },
  {
    id: "save-centre",
    audience: "parent",
    replay: "tour:parent:saved",
    keywords: ["save", "saved", "enregistrer", "favori"],
    title: { en: "How do I save a centre?", fr: "Comment enregistrer un centre?" },
    body: {
      en: "Open a centre and tap Save. It stays under Saved, on the web and in the app, once you are signed in.",
      fr: "Ouvrez un centre et touchez Enregistrer. Il reste dans Enregistrés, sur le web et dans l’application, une fois connecté.",
    },
  },
  {
    id: "request-tour",
    audience: "parent",
    replay: WELCOME_PARENT,
    keywords: ["tour", "visit", "spot", "visite", "place"],
    title: { en: "How do I request a tour?", fr: "Comment demander une visite?" },
    body: {
      en: "On a centre page, choose Book a tour or Request info. The centre sees it under Requests and can reply in messages.",
      fr: "Sur la page d’un centre, choisissez Réserver une visite ou Demander des infos. Le centre le voit dans Demandes et peut répondre dans les messages.",
    },
  },
  {
    id: "parent-messages",
    audience: "parent",
    replay: "tour:parent:messages",
    keywords: ["message", "inbox", "reply", "réponse"],
    title: { en: "How do I message a centre?", fr: "Comment écrire à un centre?" },
    body: {
      en: "Open Messages. Write the centre there. Text messages and live chat are not on yet.",
      fr: "Ouvrez Messages. Écrivez au centre là. Les textos et le clavardage en direct ne sont pas encore là.",
    },
  },
  {
    id: "pay-invoice",
    audience: "parent",
    replay: "tour:parent:payments",
    keywords: ["pay", "invoice", "bill", "payer", "facture"],
    title: { en: "How do I pay an invoice?", fr: "Comment payer une facture?" },
    body: {
      en: "Open Payments. If a centre sent a bill, open it and pay. If the list is empty, nothing is due.",
      fr: "Ouvrez Paiements. Si un centre a envoyé une facture, ouvrez-la et payez. Si la liste est vide, rien n’est dû.",
    },
  },
  {
    id: "edit-listing",
    audience: "provider",
    replay: WELCOME_PROVIDER,
    keywords: ["listing", "photos", "fees", "fiche", "photos", "tarifs"],
    title: { en: "How do I update my listing?", fr: "Comment mettre ma fiche à jour?" },
    body: {
      en: "Open your daycare desk, then Listings. Add photos, fees, ages, and openings there. Families only see what you enter.",
      fr: "Ouvrez le bureau de la garderie, puis Fiches. Ajoutez les photos, les tarifs, les âges et les places. Les familles voient seulement ce que vous entrez.",
    },
  },
  {
    id: "provider-requests",
    audience: "provider",
    replay: "tour:provider:requests",
    keywords: ["request", "lead", "demande"],
    title: { en: "How do I reply to a request?", fr: "Comment répondre à une demande?" },
    body: {
      en: "Open Requests. Choose the family and reply. They see it in their messages.",
      fr: "Ouvrez Demandes. Choisissez la famille et répondez. Elle le voit dans ses messages.",
    },
  },
  {
    id: "provider-tours",
    audience: "provider",
    replay: "tour:provider:tours",
    keywords: ["calendar", "tour", "calendrier", "visite"],
    title: { en: "How do I set tour times?", fr: "Comment choisir les heures de visite?" },
    body: {
      en: "Open Tours. Add the times you can meet. Families can book a time that is still open.",
      fr: "Ouvrez Visites. Ajoutez les heures où vous pouvez recevoir. Les familles réservent une heure encore ouverte.",
    },
  },
  {
    id: "provider-attendance",
    audience: "provider",
    replay: "tour:provider:attendance",
    keywords: ["attendance", "here", "présence"],
    title: { en: "How do I mark attendance?", fr: "Comment noter les présences?" },
    body: {
      en: "On Today, the attendance list shows enrolled children when that tool is on. Mark a child here or picked up. If the tool is off, the list stays hidden.",
      fr: "Dans Aujourd’hui, la liste des présences montre les enfants inscrits quand l’outil est activé. Notez qu’un enfant est là ou parti. Si l’outil est éteint, la liste reste cachée.",
    },
  },
  {
    id: "provider-payouts",
    audience: "provider",
    replay: "tour:provider:money",
    keywords: ["stripe", "payout", "money", "versement", "paiement"],
    title: { en: "How do I connect payouts?", fr: "Comment brancher les versements?" },
    body: {
      en: "Open Money and connect the payout account. The step is done when charges are enabled on that account. KidEase does not invent a paid balance.",
      fr: "Ouvrez Argent et branchez le compte de versement. L’étape est faite quand les encaissements sont activés sur ce compte. KidEase n’invente pas un solde payé.",
    },
  },
];

export type EmptyExample = { body: Localized; action: Localized; href: string };

export const EMPTY_EXAMPLES: Record<string, EmptyExample> = {
  "provider-requests": {
    body: {
      en: "Example: a parent asks for a Tuesday tour. You open the request and reply with a time.",
      fr: "Exemple : un parent demande une visite mardi. Vous ouvrez la demande et vous proposez une heure.",
    },
    action: { en: "See how requests work", fr: "Voir comment marchent les demandes" },
    href: "/help",
  },
  "provider-tours": {
    body: {
      en: "Example: you post Thursday at 10:00. A parent books that open time.",
      fr: "Exemple : vous affichez jeudi à 10 h. Un parent réserve cette heure ouverte.",
    },
    action: { en: "Add a tour time", fr: "Ajouter une heure de visite" },
    href: "/provider?desk=tours",
  },
  "provider-messages": {
    body: {
      en: "Example: a parent asks if you have a preschool spot. You reply in this inbox.",
      fr: "Exemple : un parent demande s’il reste une place préscolaire. Vous répondez dans cette boîte.",
    },
    action: { en: "Read the messages guide", fr: "Lire le guide des messages" },
    href: "/help",
  },
  "provider-attendance": {
    body: {
      en: "Example: Maya is marked here at drop-off, then picked up at 4:30.",
      fr: "Exemple : Maya est notée présente à l’arrivée, puis partie à 16 h 30.",
    },
    action: { en: "Back to today", fr: "Retour à aujourd’hui" },
    href: "/provider?desk=today",
  },
  "provider-money": {
    body: {
      en: "Example: you send a March invoice. It stays here as sent until the family pays.",
      fr: "Exemple : vous envoyez la facture de mars. Elle reste ici comme envoyée jusqu’au paiement.",
    },
    action: { en: "Open money", fr: "Ouvrir l’argent" },
    href: "/provider?desk=money",
  },
  "parent-saved": {
    body: {
      en: "Example: you save two centres in your city, then open one to ask for a tour.",
      fr: "Exemple : vous enregistrez deux centres dans votre ville, puis vous en ouvrez un pour demander une visite.",
    },
    action: { en: "Search centres", fr: "Chercher des centres" },
    href: "/search",
  },
  "parent-messages": {
    body: {
      en: "Example: you ask about a start date. The centre’s reply shows in this list.",
      fr: "Exemple : vous demandez une date de début. La réponse du centre s’affiche dans cette liste.",
    },
    action: { en: "Search centres", fr: "Chercher des centres" },
    href: "/search",
  },
  "parent-payments": {
    body: {
      en: "Example: a centre sends a bill for March. You open it here and pay.",
      fr: "Exemple : un centre envoie la facture de mars. Vous l’ouvrez ici et vous payez.",
    },
    action: { en: "Find a centre", fr: "Trouver un centre" },
    href: "/search",
  },
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function searchGuide(query: string, audience?: "parent" | "provider"): GuideArticle[] {
  const terms = fold(query)
    .split(/\s+/)
    .filter((term) => term.length > 1);
  return GUIDE_ARTICLES.filter((article) => {
    if (audience && article.audience !== audience) return false;
    if (!terms.length) return true;
    const hay = fold(
      [article.title.en, article.title.fr, article.body.en, article.body.fr, ...article.keywords].join(" "),
    );
    return terms.every((term) => hay.includes(term));
  });
}

export const UI_COPY = {
  skip: { en: "Skip", fr: "Passer" },
  dismiss: { en: "Don't show again", fr: "Ne plus afficher" },
  next: { en: "Next", fr: "Suivant" },
  done: { en: "Done", fr: "Terminé" },
  back: { en: "Back", fr: "Retour" },
  help: { en: "Help", fr: "Aide" },
  takeTour: { en: "Take the tour", fr: "Revoir la visite" },
  replay: { en: "Replay tour", fr: "Revoir la visite" },
  close: { en: "Close", fr: "Fermer" },
  hideList: { en: "Hide this list", fr: "Masquer cette liste" },
  showList: { en: "Show setup list", fr: "Afficher la liste" },
  guideTitle: { en: "How do I…", fr: "Comment faire…" },
  guideLead: {
    en: "Short answers for parents and daycares. Replay a tour any time.",
    fr: "Des réponses courtes pour les parents et les garderies. Revoir une visite en tout temps.",
  },
  search: { en: "Search help", fr: "Chercher dans l’aide" },
  noArticle: { en: "No article for that. Write us below, or try another word.", fr: "Aucun article. Écrivez-nous plus bas, ou essayez un autre mot." },
  parents: { en: "For parents", fr: "Pour les parents" },
  providers: { en: "For daycares", fr: "Pour les garderies" },
  call: { en: "Want a hand? Book a free 30-minute call", fr: "Besoin d’un coup de main? Réservez un appel gratuit de 30 minutes" },
  parentList: { en: "Get started", fr: "Pour commencer" },
  parentListLead: {
    en: "Four short steps. Each one ticks itself when it is done.",
    fr: "Quatre petites étapes. Chacune se coche quand elle est faite.",
  },
  providerListLead: {
    en: "Each step opens the right screen and ticks itself when the fact is saved.",
    fr: "Chaque étape ouvre le bon écran et se coche quand le renseignement est enregistré.",
  },
  welcomeLabel: { en: "Welcome to KidEase", fr: "Bienvenue sur KidEase" },
  tourLabel: { en: "Quick tip", fr: "Petit conseil" },
} as const;
