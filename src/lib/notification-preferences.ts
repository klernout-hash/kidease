import { alertsForAudience, type UnifiedAlertType, type UnifiedAudience } from "./unified-alerts.ts";

export type NoticeChannel = "email" | "push" | "sms";

export type ChannelChoice = {
  /** Null means the account default still applies. */
  email: boolean | null;
  push: boolean | null;
};

export type PreferenceSummary = {
  state: "on" | "off" | "needs-setup" | "unavailable";
  text: string;
};

export function wantedChannel(choice: boolean | null, accountDefault: boolean): boolean {
  return choice == null ? accountDefault : choice;
}

export function preferenceSummary(input: {
  locale: "en" | "fr";
  typeOn: boolean;
  emailWanted: boolean;
  pushWanted: boolean;
  emailControlled: boolean;
  emailCanSend: boolean;
  pushCanSend: boolean;
  sending: boolean;
  /** Account in-app switch. Missing means the account default, which is on. */
  inApp?: boolean;
}): PreferenceSummary {
  const fr = input.locale === "fr";
  if (!input.sending) {
    return {
      state: "unavailable",
      text: fr ? "Pas envoyé pour l'instant" : "Not sent right now",
    };
  }
  if (!input.typeOn) return { state: "off", text: fr ? "Non" : "Off" };
  const on: string[] = [];
  let needs = false;
  if (input.inApp !== false) on.push(fr ? "Dans l'appli" : "In the app");
  if (input.emailControlled && input.emailWanted) {
    if (input.emailCanSend) on.push(fr ? "Courriel" : "Email");
    else needs = true;
  }
  if (input.pushWanted) {
    if (input.pushCanSend) on.push("Push");
    else needs = true;
  }
  if (needs) return { state: "needs-setup", text: fr ? "Réglage à finir" : "Needs setup" };
  if (!on.length) return { state: "off", text: fr ? "Non" : "Off" };
  return { state: "on", text: fr ? `Oui : ${on.join(" et ")}` : `On: ${on.join(" and ")}` };
}

/**
 * A device copy never replaces a saved account choice.
 * A device-only value is returned for the person to confirm. It is not written here.
 */
export function mergeDeviceChoice(
  server: boolean | null | undefined,
  device: boolean | null | undefined,
): { value: boolean | null; conflict: boolean } {
  if (server == null && (device == null)) return { value: null, conflict: false };
  if (server == null) return { value: device ?? null, conflict: false };
  if (device == null || device === server) return { value: server, conflict: false };
  return { value: server, conflict: true };
}

export function groupNotices(rows: UnifiedAlertType[], locale: "en" | "fr"): Array<{ id: string; title: string; rows: UnifiedAlertType[] }> {
  const fr = locale === "fr";
  const buckets: Array<{ id: string; title: string; test: (row: UnifiedAlertType) => boolean; rows: UnifiedAlertType[] }> = [
    { id: "requests", title: fr ? "Demandes et visites" : "Requests and visits", test: (row) => /request|tour|family_left/.test(row.id), rows: [] },
    { id: "spots", title: fr ? "Places" : "Spots", test: (row) => /spot|wait/.test(row.id), rows: [] },
    { id: "messages", title: fr ? "Messages et avis" : "Messages and reviews", test: (row) => /message|review/.test(row.id), rows: [] },
    { id: "documents", title: fr ? "Documents" : "Documents", test: (row) => /licen|immun|allerg|screen|document/.test(row.id), rows: [] },
    { id: "account", title: fr ? "Compte" : "Account", test: (row) => row.audience === "admin" || row.critical, rows: [] },
    { id: "more", title: fr ? "Autre" : "More", test: () => true, rows: [] },
  ];
  for (const row of rows) {
    const bucket = buckets.find((item) => item.test(row));
    bucket?.rows.push(row);
  }
  return buckets.filter((item) => item.rows.length).map(({ id, title, rows: group }) => ({ id, title, rows: group }));
}

export function noticesForAudiences(audiences: UnifiedAudience[], locale: "en" | "fr"): Array<{ id: string; title: string; rows: UnifiedAlertType[] }> {
  const rows = audiences.flatMap((audience) => alertsForAudience(audience));
  const seen = new Set<string>();
  const unique = rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
  return groupNotices(unique, locale);
}

export const PREFERENCE_COPY = {
  en: {
    title: "Notifications",
    alerts: "Alerts and updates",
    account: "Account",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    dirty: "You have unsaved changes.",
    error: "Not saved. Try again.",
    saved: "Saved on your account.",
    sms: "Texts are not sent for these notices.",
    notice: "This notice",
    noticeHint: "Off stops this notice on every channel.",
    pickup: "These choices do not change who can pick up a child.",
    essential: "Sign-in and security email still follows the account mail you already have. This list does not add a new legal notice.",
    marketing: "News and offers stay separate. They are off until you opt in.",
    legacyEmail: "Email for this notice stays with its existing mail.",
    pushSetup: "Phone alerts are not set up on this account.",
    emailSetup: "Email is not ready to send.",
    gov: "Provincial audit mail is not in this list.",
    empty: "No notices for this account yet.",
    signIn: "Sign in to save these on your account.",
  },
  fr: {
    title: "Notifications",
    alerts: "Alertes et mises à jour",
    account: "Compte",
    edit: "Modifier",
    save: "Enregistrer",
    cancel: "Annuler",
    dirty: "Vous avez des changements non enregistrés.",
    error: "Pas enregistré. Réessayez.",
    saved: "Enregistré sur votre compte.",
    sms: "Aucun texto n'est envoyé pour ces avis.",
    notice: "Cet avis",
    noticeHint: "Fermé, cet avis s'arrête sur chaque canal.",
    pickup: "Ces choix ne changent pas qui peut venir chercher un enfant.",
    essential: "Le courriel de connexion et de sécurité suit déjà le courriel du compte. Cette liste n'ajoute pas un nouvel avis légal.",
    marketing: "Les nouvelles et les offres restent à part. Elles sont fermées tant que vous ne les acceptez pas.",
    legacyEmail: "Le courriel de cet avis reste avec son envoi déjà en place.",
    pushSetup: "Les alertes du téléphone ne sont pas prêtes sur ce compte.",
    emailSetup: "Le courriel n'est pas prêt à partir.",
    gov: "Le courriel de vérification provinciale n'est pas dans cette liste.",
    empty: "Aucun avis pour ce compte pour l'instant.",
    signIn: "Connectez-vous pour enregistrer ceci sur votre compte.",
  },
} as const;
