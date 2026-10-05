/**
 * Customer alert categories, quiet hours, and copy.
 * Pure: no database. scripts/alert-push.test.mjs loads this in Node.
 *
 * Push delivery still needs FEATURE_PUSH plus FCM or APNs. This module only
 * decides whether a category may leave the building, and in which language.
 * Nothing customer-facing sends from 21:00 to 08:00 America/Winnipeg.
 */

import { isAlertQuietHours, winnipegHour, ALERT_TZ } from "./search-alert-policy.ts";

export const PARENT_ALERT_CATEGORIES = [
  "spot_opened",
  "saved_listing",
  "waitlist",
  "tour",
  "message",
  "licence_status",
  "still_looking",
  "match",
  "review_reply",
] as const;

export const DAYCARE_ALERT_CATEGORIES = [
  "enquiry",
  "message",
  "claim",
  "document_expiry",
  "open_spots",
  "listing_attention",
  "billing",
] as const;

export const ALERT_CATEGORIES = [
  ...PARENT_ALERT_CATEGORIES,
  ...DAYCARE_ALERT_CATEGORIES.filter((id) => id !== "message"),
] as const;

export type ParentAlertCategory = (typeof PARENT_ALERT_CATEGORIES)[number];
export type DaycareAlertCategory = (typeof DAYCARE_ALERT_CATEGORIES)[number];
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];
export type AlertPrefMap = Record<AlertCategory, boolean>;
export type AlertAudience = "parent" | "daycare";
export type AlertLocale = "en" | "fr";

const CRITICAL = new Set<AlertCategory>([
  "spot_opened",
  "waitlist",
  "tour",
  "message",
  "licence_status",
  "enquiry",
  "claim",
  "document_expiry",
]);

export function isAlertCategory(value: string | null | undefined): value is AlertCategory {
  return ALERT_CATEGORIES.includes(value as AlertCategory);
}

export function isAlertLocale(value: string | null | undefined): value is AlertLocale {
  return value === "fr" || value === "en";
}

export function normalizeAlertLocale(raw: unknown): AlertLocale {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "fr" || v.startsWith("fr-") ? "fr" : "en";
}

export function categoriesForAudience(audience: AlertAudience, subscriptionsOn: boolean): AlertCategory[] {
  const list = audience === "daycare" ? DAYCARE_ALERT_CATEGORIES : PARENT_ALERT_CATEGORIES;
  if (subscriptionsOn) return [...list];
  return list.filter((id) => id !== "billing");
}

/** Missing row means on. Billing never sends while paid plans are off. */
export function prefEnabled(stored: boolean | null | undefined): boolean {
  return stored !== false;
}

export function isCriticalAlert(category: AlertCategory): boolean {
  return CRITICAL.has(category);
}

export type AlertDecision =
  | { action: "skip"; reason: "unknown" | "opt_out" | "billing_off" }
  | { action: "hold" }
  | { action: "send" };

export function decideCustomerAlert(input: {
  category: string;
  prefEnabled: boolean;
  subscriptionsOn: boolean;
  quiet: boolean;
}): AlertDecision {
  if (!isAlertCategory(input.category)) return { action: "skip", reason: "unknown" };
  if (input.category === "billing" && !input.subscriptionsOn) return { action: "skip", reason: "billing_off" };
  if (!input.prefEnabled) return { action: "skip", reason: "opt_out" };
  if (input.quiet) return { action: "hold" };
  return { action: "send" };
}

export function alertQuietNow(now: Date = new Date()): boolean {
  return isAlertQuietHours(now);
}

function winnipegParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ALERT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return {
    hour: num("hour") === 24 ? 0 : num("hour"),
    minute: num("minute"),
    second: num("second"),
  };
}

/** Next allowed send. During quiet hours that is 8:00 America/Winnipeg. */
export function nextAlertSendAt(now: Date = new Date()): Date {
  if (!isAlertQuietHours(now)) return now;
  const start = now.getTime();
  for (let step = 1; step <= 24 * 4; step += 1) {
    const candidate = new Date(start + step * 15 * 60 * 1000);
    if (winnipegHour(candidate) !== 8) continue;
    const parts = winnipegParts(candidate);
    const atEight = new Date(candidate.getTime() - (parts.minute * 60 + parts.second) * 1000);
    if (winnipegHour(atEight) === 8 && !isAlertQuietHours(atEight)) return atEight;
  }
  return new Date(start + 11 * 60 * 60 * 1000);
}

export type AlertVars = {
  name?: string | null;
  status?: string | null;
};

function cleanVar(raw: string | null | undefined, max: number): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function fill(template: string, vars: { name: string; status: string }): string {
  return template.replaceAll("{name}", vars.name).replaceAll("{status}", vars.status);
}

type Pair = { title: string; body: string };

function copyFor(category: AlertCategory, locale: AlertLocale, vars: { name: string; status: string }): Pair {
  const fr = locale === "fr";
  const name = vars.name;
  if (category === "spot_opened") {
    return fr
      ? {
          title: "Une place pourrait être ouverte",
          body: fill("{name} a mis à jour ses places. Confirmez avec le centre.", { name, status: vars.status }),
        }
      : {
          title: "A spot may be open",
          body: fill("{name} updated openings. Confirm with the centre.", { name, status: vars.status }),
        };
  }
  if (category === "saved_listing") {
    return fr
      ? { title: "Fiche enregistrée mise à jour", body: fill("{name} a changé un prix, un âge ou un horaire.", { name, status: vars.status }) }
      : { title: "Saved centre updated", body: fill("{name} changed a price, age, or schedule.", { name, status: vars.status }) };
  }
  if (category === "waitlist") {
    const labels = fr
      ? { sent: "envoyée", seen: "vue", waitlisted: "en attente", offered: "offerte", declined: "refusée", withdrawn: "retirée" }
      : { sent: "sent", seen: "seen", waitlisted: "waitlisted", offered: "offered", declined: "declined", withdrawn: "withdrawn" };
    const status = labels[vars.status as keyof typeof labels] || vars.status || (fr ? "mise à jour" : "updated");
    return fr
      ? {
          title: "Liste d'attente mise à jour",
          body: fill("{name} a mis à jour votre demande: {status}.", { name, status }),
        }
      : {
          title: "Waitlist update",
          body: fill("{name} updated your request: {status}.", { name, status }),
        };
  }
  if (category === "tour") {
    return fr
      ? { title: "Visite à venir", body: fill("Une visite à {name} approche, ou le centre a répondu.", { name, status: vars.status }) }
      : { title: "Visit update", body: fill("A visit at {name} is coming up, or the centre replied.", { name, status: vars.status }) };
  }
  if (category === "message") {
    return fr
      ? { title: "Nouveau message", body: fill("Vous avez un message au sujet de {name}.", { name, status: vars.status }) }
      : { title: "New message", body: fill("You have a message about {name}.", { name, status: vars.status }) };
  }
  if (category === "licence_status") {
    return fr
      ? {
          title: "Permis ou filtrage mis à jour",
          body: fill("{name} a mis à jour un permis ou un document de filtrage. Les documents restent privés.", { name, status: vars.status }),
        }
      : {
          title: "Licence or screening update",
          body: fill("{name} updated a licence or screening status. Documents stay private.", { name, status: vars.status }),
        };
  }
  if (category === "still_looking") {
    return fr
      ? { title: "Vous cherchez encore?", body: "Dites-nous si vous cherchez encore une place cette semaine." }
      : { title: "Still looking?", body: "Tell us if you are still looking for a spot this week." };
  }
  if (category === "match") {
    return fr
      ? { title: "Un centre correspond", body: fill("{name} correspond à une recherche que vous avez enregistrée.", { name, status: vars.status }) }
      : { title: "A centre fits your search", body: fill("{name} matches a search you saved.", { name, status: vars.status }) };
  }
  if (category === "review_reply") {
    return fr
      ? { title: "Réponse à votre avis", body: fill("{name} a répondu à votre avis.", { name, status: vars.status }) }
      : { title: "Reply to your review", body: fill("{name} replied to your review.", { name, status: vars.status }) };
  }
  if (category === "enquiry") {
    return fr
      ? { title: "Nouvelle demande d'un parent", body: fill("Un parent a demandé des infos pour {name}.", { name, status: vars.status }) }
      : { title: "New parent request", body: fill("A parent asked for info about {name}.", { name, status: vars.status }) };
  }
  if (category === "claim") {
    if (vars.status === "needs_docs") {
      return fr
        ? { title: "Documents demandés", body: fill("{name} a besoin d'un document avant l'approbation.", { name, status: vars.status }) }
        : { title: "Documents needed", body: fill("{name} needs a document before approval.", { name, status: vars.status }) };
    }
    return fr
      ? { title: "Fiche approuvée", body: fill("{name} est approuvée sur KidEase.", { name, status: vars.status }) }
      : { title: "Listing approved", body: fill("{name} is approved on KidEase.", { name, status: vars.status }) };
  }
  if (category === "document_expiry") {
    return fr
      ? {
          title: "Document à renouveler",
          body: fill("Un permis, un filtrage ou un secourisme arrive à échéance pour {name}.", { name, status: vars.status }),
        }
      : {
          title: "Document expiring",
          body: fill("A licence, screening file, or first aid certificate is expiring for {name}.", { name, status: vars.status }),
        };
  }
  if (category === "open_spots") {
    return fr
      ? { title: "Places encore ouvertes?", body: fill("Touchez pour mettre à jour les places libres à {name}.", { name, status: vars.status }) }
      : { title: "Are spots still open?", body: fill("Tap to update open spots at {name}.", { name, status: vars.status }) };
  }
  if (category === "listing_attention") {
    return fr
      ? { title: "Photo ou avis à revoir", body: fill("{name} a une photo ou un avis qui demande un coup d'oeil.", { name, status: vars.status }) }
      : { title: "Photo or review needs a look", body: fill("{name} has a photo or review that needs a look.", { name, status: vars.status }) };
  }
  return fr
    ? { title: "Facturation", body: fill("Mise à jour d'abonnement pour {name}.", { name, status: vars.status }) }
    : { title: "Billing update", body: fill("Subscription update for {name}.", { name, status: vars.status }) };
}

export function alertPushCopy(category: AlertCategory, locale: AlertLocale, vars: AlertVars = {}): Pair {
  const name = cleanVar(vars.name, 80) || (locale === "fr" ? "KidEase" : "KidEase");
  const status = cleanVar(vars.status, 40);
  const pair = copyFor(category, locale, { name, status });
  return {
    title: pair.title.replace(/\s+/g, " ").trim().slice(0, 80),
    body: pair.body.replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

export type AlertSettingRow = {
  category: AlertCategory;
  label: string;
  detail: string;
};

const SETTING_COPY: Record<AlertCategory, { en: { label: string; detail: string }; fr: { label: string; detail: string } }> = {
  spot_opened: {
    en: { label: "Spot opened", detail: "A centre you follow confirms an opening." },
    fr: { label: "Place ouverte", detail: "Un centre que vous suivez confirme une ouverture." },
  },
  saved_listing: {
    en: { label: "Saved centre changes", detail: "Price, ages, or schedule on a centre you saved." },
    fr: { label: "Centre enregistré", detail: "Prix, âges ou horaire d'un centre que vous avez enregistré." },
  },
  waitlist: {
    en: { label: "Waitlist moves", detail: "Your request moves, or a centre updates it." },
    fr: { label: "Liste d'attente", detail: "Votre demande avance, ou le centre la met à jour." },
  },
  tour: {
    en: { label: "Visits and tours", detail: "A reminder, or a reply about a visit." },
    fr: { label: "Visites", detail: "Un rappel, ou une réponse au sujet d'une visite." },
  },
  message: {
    en: { label: "Messages", detail: "A new message from a centre or a parent." },
    fr: { label: "Messages", detail: "Un nouveau message d'un centre ou d'un parent." },
  },
  licence_status: {
    en: { label: "Licence or screening", detail: "Status change on a centre you saved. Documents stay private." },
    fr: { label: "Permis ou filtrage", detail: "Changement sur un centre enregistré. Les documents restent privés." },
  },
  still_looking: {
    en: { label: "Still looking", detail: "A weekly note to confirm you are still searching." },
    fr: { label: "Vous cherchez encore", detail: "Une note hebdomadaire pour confirmer que vous cherchez encore." },
  },
  match: {
    en: { label: "New matches", detail: "A new centre fits a search you saved." },
    fr: { label: "Nouveaux centres", detail: "Un nouveau centre correspond à une recherche enregistrée." },
  },
  review_reply: {
    en: { label: "Review replies", detail: "A centre replies to a review you wrote." },
    fr: { label: "Réponse à un avis", detail: "Un centre répond à un avis que vous avez écrit." },
  },
  enquiry: {
    en: { label: "Parent requests", detail: "A parent asks for info, a tour, or a spot." },
    fr: { label: "Demandes des parents", detail: "Un parent demande des infos, une visite ou une place." },
  },
  claim: {
    en: { label: "Listing approval", detail: "Your claim is approved, or we need a document." },
    fr: { label: "Approbation de la fiche", detail: "Votre réclamation est approuvée, ou un document manque." },
  },
  document_expiry: {
    en: { label: "Documents expiring", detail: "Licence, screening, or first aid is close to its date." },
    fr: { label: "Documents à renouveler", detail: "Permis, filtrage ou secourisme approche de sa date." },
  },
  open_spots: {
    en: { label: "Open spots check-in", detail: "A weekly tap to confirm which spots are still open." },
    fr: { label: "Places libres", detail: "Un rappel hebdomadaire pour confirmer les places encore ouvertes." },
  },
  listing_attention: {
    en: { label: "Photo or review", detail: "A photo or a review on your listing needs a look." },
    fr: { label: "Photo ou avis", detail: "Une photo ou un avis sur votre fiche demande un coup d'oeil." },
  },
  billing: {
    en: { label: "Billing", detail: "Subscription and payment updates. Only while paid plans are on." },
    fr: { label: "Facturation", detail: "Abonnement et paiements. Seulement quand les forfaits payants sont ouverts." },
  },
};

export function alertSettingRows(audience: AlertAudience, locale: AlertLocale, subscriptionsOn: boolean): AlertSettingRow[] {
  return categoriesForAudience(audience, subscriptionsOn).map((category) => {
    const row = SETTING_COPY[category][locale];
    return { category, label: row.label, detail: row.detail };
  });
}

export function alertSettingsIntro(locale: AlertLocale, audience: AlertAudience) {
  if (locale === "fr") {
    return {
      title: "Alertes KidEase",
      lead:
        audience === "daycare"
          ? "KidEase prévient votre garderie des demandes, des messages et des documents. Choisissez ce que vous voulez recevoir."
          : "KidEase vous prévient des places, des messages et des visites. Choisissez ce que vous voulez recevoir.",
      founding: "KidEase est une entreprise canadienne. Ces alertes font partie de la période fondatrice gratuite.",
      quiet: "Rien n'est envoyé après 21 h, heure de Winnipeg, jusqu'à 8 h.",
      save: "Enregistrer les alertes",
      saved: "Alertes enregistrées",
      apps: "Les applis iPhone et Android arrivent bientôt.",
      unsub: "Se désabonner des alertes",
      error: "Nous n'avons pas pu enregistrer. Réessayez, ou écrivez à support@kidease.ca.",
      loadError: "Nous n'avons pas pu charger vos choix. Vous pouvez quand même les régler et enregistrer.",
    };
  }
  return {
    title: "KidEase alerts",
    lead:
      audience === "daycare"
        ? "KidEase tells your centre about requests, messages, and documents. Pick what you want."
        : "KidEase tells you about spots, messages, and visits. Pick what you want.",
    founding: "KidEase is a Canadian company. These alerts are part of the free founding period.",
    quiet: "Nothing is sent after 9 p.m. Winnipeg time, until 8 a.m.",
    save: "Save alerts",
    saved: "Alerts saved",
    apps: "The iPhone and Android apps are coming soon.",
    unsub: "Unsubscribe from alerts",
    error: "We could not save. Try again, or email support@kidease.ca.",
    loadError: "We could not load your saved choices. You can still set them and save.",
  };
}

export function getAlertsPromptCopy(locale: AlertLocale) {
  if (locale === "fr") {
    return {
      title: "Recevoir les alertes",
      body: "KidEase peut vous dire quand une place s'ouvre, quand un centre écrit, ou quand une visite approche.",
      yes: "Recevoir les alertes",
      no: "Pas maintenant",
      signIn: "Se connecter pour les alertes",
      unsupported: "Ce navigateur ne peut pas encore recevoir les alertes. Le courriel est dans votre compte. Les applis téléphone arrivent bientôt.",
    };
  }
  return {
    title: "Get alerts",
    body: "KidEase can tell you when a spot opens, when a centre writes, or when a visit is coming up.",
    yes: "Get alerts",
    no: "Not now",
    signIn: "Sign in to get alerts",
    unsupported: "This browser cannot receive alerts yet. Email choices are in your account. The phone apps are coming soon.",
  };
}

export function webAlertPromptStep(input: { native: boolean; choice: string | null; seenThisVisit: boolean }): "hide" | "show" {
  if (input.native) return "hide";
  if (input.choice === "yes" || input.choice === "no" || input.choice === "email") return "hide";
  if (!input.seenThisVisit) return "hide";
  return "show";
}

/** Browser can register only when push is armed and a VAPID public key exists. */
export function canRegisterWebPush(input: {
  notification: boolean;
  pushManager: boolean;
  serviceWorker: boolean;
  vapidPublic: boolean;
  pushArmed: boolean;
}): boolean {
  return input.notification && input.pushManager && input.serviceWorker && input.vapidPublic && input.pushArmed;
}

export function safeAlertHref(href: string | null | undefined): string {
  const raw = String(href || "").trim();
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !raw.includes("://")) {
    return raw.slice(0, 300);
  }
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const okHost = host === "kidease.ca" || host === "www.kidease.ca" || host.endsWith(".kidease.ca");
    if (url.protocol === "https:" && okHost && !url.username && !url.password) return url.toString().slice(0, 300);
  } catch {
    /* fall through */
  }
  return "/notifications";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function alertEmailLetter(input: {
  title: string;
  body: string;
  href: string;
  unsubUrl: string;
  locale: AlertLocale;
}): { subject: string; text: string; html: string } {
  const subject = input.title.slice(0, 120);
  const footer =
    input.locale === "fr"
      ? "KidEase est une entreprise canadienne, à Winnipeg, au Manitoba."
      : "KidEase is a Canadian company in Winnipeg, Manitoba.";
  const open = input.locale === "fr" ? "Ouvrir" : "Open";
  const stop = input.locale === "fr" ? "Se désabonner" : "Unsubscribe";
  const text = [input.body, "", `${open}: ${input.href}`, "", `${stop}: ${input.unsubUrl}`, "", footer].join("\n");
  const html = `<p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(input.href)}">${open}</a></p><p><a href="${escapeHtml(input.unsubUrl)}">${stop}</a></p><p>${escapeHtml(footer)}</p>`;
  return { subject, text, html };
}

export function alertSettingsPath(audience: AlertAudience): string {
  return audience === "daycare" ? "/account?section=alerts&desk=director" : "/account?section=alerts&desk=parent";
}
