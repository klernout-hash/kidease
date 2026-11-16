/**
 * Live KidEase support chat. Pure rules: no database, no phone numbers.
 * scripts/live-support.test.mjs loads this file in Node.
 *
 * One thread per person. Alerts name the sender and link the thread.
 * They never include the message, a child, or a phone number.
 */

import { conversationIdFromReference, threadReferenceFromId } from "./thread-reference.ts";
import type { Message } from "./types.ts";
import { supportRoleLabel, type SupportRoleLabel } from "./support-desk.ts";

export const LIVE_SUPPORT_FLAG = "FEATURE_LIVE_SUPPORT_CHAT";
export const SUPPORT_SMS_ALERT_FLAG = "FEATURE_SUPPORT_SMS_ALERT";
export const LIVE_SUPPORT_ALERT_WINDOW_MS = 2 * 60 * 1000;
export const LIVE_SUPPORT_ORIGIN = "https://www.kidease.ca";

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,80}$/;

export type SupportActor = "member" | "staff";

export type SupportOutboxItem = {
  key: string;
  body: string;
  createdAt: string;
  state: "sending" | "failed";
};

export const liveSupportCopy = {
  en: {
    title: "KidEase Support",
    lead: "Chat with KidEase support. We'll reply here and you'll get a notification.",
    empty: "No messages yet. Write us and we'll reply here.",
    placeholder: "Write a message",
    send: "Send",
    retry: "Try again",
    sending: "Sending",
    failed: "Could not send. Try again.",
    limited: "Too many messages. Try again in an hour.",
    reference: "Message number",
    referenceHint: "Optional. Add a message number if you have one.",
    details: "Details",
    name: "Name",
    role: "Role",
    centre: "Centre",
    children: "Children",
    none: "None on file",
    supportName: "KidEase Support",
    inboxTitle: "Support inbox",
    inboxLead: "Reply to parents and daycares. They see it in Messages.",
    inboxEmpty: "No support chats yet.",
    choose: "Choose a chat to reply.",
    unread: "unread",
    off: "Live support chat is off.",
    back: "Back to Admin",
  },
  fr: {
    title: "Aide KidEase",
    lead: "Clavardez avec l’aide KidEase. Nous répondrons ici et vous recevrez un avis.",
    empty: "Aucun message pour le moment. Écrivez-nous et nous répondrons ici.",
    placeholder: "Écrire un message",
    send: "Envoyer",
    retry: "Réessayer",
    sending: "Envoi",
    failed: "Envoi impossible. Réessayez.",
    limited: "Trop de messages. Réessayez dans une heure.",
    reference: "Numéro du message",
    referenceHint: "Facultatif. Ajoutez un numéro de message si vous en avez un.",
    details: "Détails",
    name: "Nom",
    role: "Rôle",
    centre: "Garderie",
    children: "Enfants",
    none: "Rien au dossier",
    supportName: "Aide KidEase",
    inboxTitle: "Boîte d’aide",
    inboxLead: "Répondez aux parents et aux garderies. Ils le voient dans Messages.",
    inboxEmpty: "Aucune conversation d’aide pour le moment.",
    choose: "Choisissez une conversation pour répondre.",
    unread: "non lu",
    off: "Le clavardage d’aide est fermé.",
    back: "Retour à l’admin",
  },
} as const;

export type LiveSupportLocale = keyof typeof liveSupportCopy;

export function liveSupportPack(locale: string | null | undefined) {
  return locale === "fr" ? liveSupportCopy.fr : liveSupportCopy.en;
}

export function supportRoleForAccount(input: {
  profileRole: string | null | undefined;
  hasCentre: boolean;
}): SupportRoleLabel {
  const labeled = supportRoleLabel(input.profileRole);
  if (labeled === "Parent" && input.hasCentre) return "Daycare";
  return labeled;
}

export function supportRoleText(role: SupportRoleLabel, locale: LiveSupportLocale): string {
  if (locale !== "fr") return role;
  if (role === "Daycare") return "Garderie";
  if (role === "Staff") return "Personnel";
  return "Parent";
}

/** A bad or missing key is refused. A repeat of a good key does not create a second row. */
export function cleanIdempotencyKey(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  return IDEMPOTENCY_RE.test(value) ? value : null;
}

export function newSupportIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `sup_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Keep the thread that already belongs to this person. */
export function resolveSupportThreadId(existingId: string | null | undefined, freshId: string): {
  id: string;
  created: boolean;
} {
  const existing = String(existingId || "").trim();
  if (existing) return { id: existing, created: false };
  return { id: freshId, created: true };
}

/** Parents and daycares see only their own thread. KidEase staff see every thread. */
export function mayReadSupportThread(input: {
  viewerId: string;
  ownerId: string;
  staff: boolean;
}): boolean {
  const viewer = input.viewerId.trim();
  const owner = input.ownerId.trim();
  if (!viewer || !owner) return false;
  if (input.staff) return true;
  return viewer === owner;
}

export function mayListSupportThreads(staff: boolean): boolean {
  return staff === true;
}

export function supportMessageSender(actor: SupportActor): "user" | "admin" {
  return actor === "staff" ? "admin" : "user";
}

/** A real message number is kept. Anything else is left off. */
export function supportReferenceCode(raw: string | null | undefined): string | null {
  const id = conversationIdFromReference(raw || "");
  return id ? threadReferenceFromId(id) : null;
}

export function supportRowsToMessages(
  rows: Array<{ id: string; sender: string; body: string; createdAt: string }>,
): Message[] {
  return rows
    .filter((row) => row.id && row.body)
    .map((row) => ({
      id: row.id,
      sender: row.sender === "admin" ? "provider" : "parent",
      body: row.body,
      createdAt: row.createdAt,
      kind: "chat" as const,
    }));
}

export function mergeSupportOutbox(messages: Message[], outbox: SupportOutboxItem[], actor: SupportActor): Message[] {
  const sender = actor === "staff" ? "provider" : "parent";
  const extra: Message[] = outbox.map((item) => ({
    id: `out-${item.key}`,
    sender,
    body: item.body,
    createdAt: item.createdAt,
    kind: "chat" as const,
  }));
  return [...messages, ...extra];
}

export function outboxAfterSend(items: SupportOutboxItem[], key: string, ok: boolean): SupportOutboxItem[] {
  if (ok) return items.filter((item) => item.key !== key);
  return items.map((item) => (item.key === key ? { ...item, state: "failed" } : item));
}

/** One alert for a burst. A missing time means this is the first. */
export function supportAlertDue(lastAlertAt: string | null | undefined, nowMs: number): boolean {
  if (!lastAlertAt) return true;
  const then = Date.parse(lastAlertAt);
  if (!Number.isFinite(then)) return true;
  return nowMs - then >= LIVE_SUPPORT_ALERT_WINDOW_MS;
}

export function supportAdminPath(threadId: string): string {
  const id = String(threadId || "").trim();
  return `/admin-support?thread=${encodeURIComponent(id)}`;
}

export function supportPushUrl(threadId: string, origin = LIVE_SUPPORT_ORIGIN): string {
  const base = String(origin || LIVE_SUPPORT_ORIGIN).replace(/\/$/, "");
  return `${base}${supportAdminPath(threadId)}`;
}

export function supportPushNotice(input: {
  role: SupportRoleLabel;
  name: string;
  locale?: LiveSupportLocale;
}): { title: string; body: string } {
  const locale = input.locale === "fr" ? "fr" : "en";
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 40) || (locale === "fr" ? "Quelqu’un" : "Someone");
  const role = supportRoleText(input.role, locale);
  if (locale === "fr") {
    return { title: "Aide KidEase", body: `${role} ${name} a envoyé un message.` };
  }
  return { title: "KidEase support", body: `${role} ${name} sent a message.` };
}

/** Name, role, and a link. The message itself stays out of the text. */
export function supportSmsAlert(input: { role: SupportRoleLabel; name: string; url: string }): string {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Someone";
  const url = input.url.trim();
  return `KidEase support. ${input.role} ${name}. ${url}`;
}

export function supportAlertEmail(env: { SUPPORT_INBOX_EMAIL?: string; ADMIN_EMAIL?: string } = {}): string {
  const support = String(env.SUPPORT_INBOX_EMAIL || "").trim();
  if (support.includes("@")) return support;
  const admin = String(env.ADMIN_EMAIL || "").trim();
  if (admin.includes("@")) return admin;
  return "support@kidease.ca";
}

export type LiveAlertPlan = {
  push: boolean;
  email: boolean;
  sms: boolean;
};

/**
 * Push first. Email only when push did not land.
 * Text only when its own flag is on and a number is configured.
 * A closed window sends nothing.
 */
export function planLiveSupportAlert(input: {
  due: boolean;
  pushDelivered: boolean;
  smsFlagOn: boolean;
  smsPhone: string;
  emailTo: string;
}): LiveAlertPlan {
  if (!input.due) return { push: false, email: false, sms: false };
  return {
    push: true,
    email: !input.pushDelivered && input.emailTo.includes("@"),
    sms: input.smsFlagOn && Boolean(input.smsPhone.trim()),
  };
}
