/** Pure rules for the Messages support thread. No database. No phone numbers. */

import { conversationIdFromReference, threadReferenceFromId } from "./thread-reference.ts";

export const SUPPORT_PREVIEW_CHARS = 80;
export const SUPPORT_SMS_WINDOW_MS = 10 * 60 * 1000;
export const SUPPORT_HOUR_LIMIT = 20;
export const SUPPORT_BODY_MAX = 2000;

export type SupportRoleLabel = "Parent" | "Daycare" | "Staff";

export function supportRoleLabel(role: string | null | undefined): SupportRoleLabel {
  const value = String(role || "").trim().toLowerCase();
  if (value === "provider" || value === "owner" || value === "director") return "Daycare";
  if (value === "admin" || value === "support" || value === "support_lead" || value === "staff") return "Staff";
  return "Parent";
}

export function supportPreview(body: string): string {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, SUPPORT_PREVIEW_CHARS);
}

export function cleanSupportBody(body: string): string {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, SUPPORT_BODY_MAX);
}

export function supportRateAllows(messagesInLastHour: number): boolean {
  return messagesInLastHour < SUPPORT_HOUR_LIMIT;
}

export type OwnerAlertPlan = {
  email: "skip" | "send";
  sms: "skip" | "send" | "wait";
  emailReason: "channel_off" | "no_destination" | "not_production" | "already_sent" | "ready";
  smsReason: "channel_off" | "no_destination" | "not_production" | "window" | "ready";
};

/**
 * In-app chat does not turn on email or text.
 * Each outside channel needs its own switch and a real destination.
 * This does not read or invent a phone number.
 */
export function planOwnerAlert(input: {
  production: boolean;
  emailChannelOn: boolean;
  smsChannelOn: boolean;
  emailTo: string;
  phone: string;
  alreadyEmailed: boolean;
  smsWindowOpen: boolean;
}): OwnerAlertPlan {
  const emailTo = input.emailTo.trim();
  const phone = input.phone.trim();
  let email: OwnerAlertPlan["email"] = "skip";
  let emailReason: OwnerAlertPlan["emailReason"] = "channel_off";
  if (!input.emailChannelOn) emailReason = "channel_off";
  else if (!emailTo.includes("@")) emailReason = "no_destination";
  else if (!input.production) emailReason = "not_production";
  else if (input.alreadyEmailed) emailReason = "already_sent";
  else {
    email = "send";
    emailReason = "ready";
  }
  let sms: OwnerAlertPlan["sms"] = "skip";
  let smsReason: OwnerAlertPlan["smsReason"] = "channel_off";
  if (!input.smsChannelOn) smsReason = "channel_off";
  else if (!phone) smsReason = "no_destination";
  else if (!input.production) smsReason = "not_production";
  else if (!input.smsWindowOpen) {
    sms = "wait";
    smsReason = "window";
  } else {
    sms = "send";
    smsReason = "ready";
  }
  return { email, sms, emailReason, smsReason };
}

/** One owner text per thread per 10 minutes. A missing last time means this is the first. */
export function shouldSendOwnerSms(lastSentAt: string | null | undefined, nowMs: number): boolean {
  if (!lastSentAt) return true;
  const then = Date.parse(lastSentAt);
  if (!Number.isFinite(then)) return true;
  return nowMs - then >= SUPPORT_SMS_WINDOW_MS;
}

export function ownerAlertText(input: { role: SupportRoleLabel; name: string; preview: string; threadId: string }): string {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Someone";
  const preview = supportPreview(input.preview) || "(no message)";
  const code = input.threadId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "thread";
  return `KidEase support. ${input.role} ${name}: "${preview}" https://kidease.ca/admin-chat #${code}`;
}

/** Attach a real message number to a support note. A bad number is left off. */
export function withMessageReference(body: string, reference: string | null | undefined): string {
  const id = conversationIdFromReference(reference || "");
  const code = id ? threadReferenceFromId(id) : null;
  const text = cleanSupportBody(body);
  if (!code) return text;
  return cleanSupportBody(`Message number ${code}\n${text}`).slice(0, SUPPORT_BODY_MAX);
}

export function messageReferenceInBody(body: string): string | null {
  const match = String(body || "").match(/\bKE-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3}\b/);
  if (!match) return null;
  return conversationIdFromReference(match[0]) ? match[0] : null;
}

export function threadCode(threadId: string): string {
  return threadId.replace(/[^a-zA-Z0-9]/g, "").slice(-6);
}

/** Match an owner reply to a thread code. Does not read a phone number. */
export function threadIdFromOwnerReply(body: string, threads: Array<{ id: string }>): string | null {
  const match = String(body || "").match(/#([a-zA-Z0-9]{4,12})/);
  if (!match) return threads[0]?.id || null;
  const code = match[1].toLowerCase();
  return threads.find((row) => threadCode(row.id).toLowerCase() === code)?.id || null;
}

/** Flag off is a 404. A bad signature is 401. The phone is not stored. */
export function handleSupportOwnerReply(input: {
  flagOn: boolean;
  signatureOk: boolean;
  body: string;
  threads: Array<{ id: string }>;
}): { status: 404 | 401 | 200; threadId: string | null; text: string } {
  if (!input.flagOn) return { status: 404, threadId: null, text: "" };
  if (!input.signatureOk) return { status: 401, threadId: null, text: "" };
  const threadId = threadIdFromOwnerReply(input.body, input.threads);
  return { status: 200, threadId, text: cleanSupportBody(input.body.replace(/#[a-zA-Z0-9]{4,12}/g, " ")) };
}

export const supportCopy = {
  en: {
    all: "All",
    daycares: "Daycares",
    support: "Support",
    title: "KidEase Support",
    reference: "Message number",
    lead: "We read this. We do not promise a reply time.",
    placeholder: "Write a message",
    send: "Send",
    empty: "No messages yet.",
    off: "KidEase Support is not open in Messages yet. Nothing is sent.",
    sent: "Saved in Messages.",
    quiet: "No email or text was sent.",
    limited: "Too many messages. Try again in an hour.",
    failed: "Could not send. Try again.",
  },
  fr: {
    all: "Tous",
    daycares: "Garderies",
    support: "Aide",
    title: "Aide KidEase",
    reference: "Numéro du message",
    lead: "Nous lisons ceci. Nous ne promettons pas un délai de réponse.",
    placeholder: "Écrire un message",
    send: "Envoyer",
    empty: "Aucun message pour le moment.",
    off: "L’aide KidEase n’est pas ouverte dans Messages. Rien n’est envoyé.",
    sent: "Enregistré dans Messages.",
    quiet: "Aucun courriel ni texto n’a été envoyé.",
    limited: "Trop de messages. Réessayez dans une heure.",
    failed: "Envoi impossible. Réessayez.",
  },
} as const;

export type SupportLocale = keyof typeof supportCopy;
