/**
 * CASL (Canada's Anti-Spam Legislation) helpers.
 * Pure — no DB, no secrets. scripts/casl-consent.test.mjs loads this in Node.
 *
 * Express consent is required before commercial / service SMS to a parent or
 * provider. Transactional mail (sign-in codes, password reset) is not a CEM.
 * Search-alert email is a requested CEM: store who / when / what, and honour
 * unsubscribe. FEATURE_SMS stays off until Kyle flips it after this lands.
 */

export const CASL_CHANNELS = ["sms", "email"] as const;
export const CASL_PURPOSES = ["service", "commercial"] as const;
export const CASL_BLOCK_PURPOSES = ["service", "commercial", "all"] as const;

export type CaslChannel = (typeof CASL_CHANNELS)[number];
export type CaslPurpose = (typeof CASL_PURPOSES)[number];
export type CaslBlockPurpose = (typeof CASL_BLOCK_PURPOSES)[number];
export type CaslAction = "grant" | "withdraw";
export type CaslLocale = "en" | "fr";

export const CASL_SENDER = {
  name: "KidEase",
  city: "Winnipeg, Manitoba, Canada",
  email: "support@kidease.ca",
  web: "https://www.kidease.ca",
  unsubscribePath: "/unsubscribe",
} as const;

export const CASL_NO_CONSENT_MESSAGE =
  "CASL: no stored express consent for this recipient.";

export const CASL_ADDRESS_BLOCKED_MESSAGE =
  "CASL: this address opted out (STOP / unsubscribe).";

export const CASL_METHODS = [
  "profile_checkbox",
  "alerts_settings",
  "checkout_checkbox",
  "email_unsub",
  "sms_stop",
  "sms_start",
  "public_form",
] as const;

export type CaslMethod = (typeof CASL_METHODS)[number];

export const CASL_STATEMENTS = {
  en: {
    smsService:
      "I agree that KidEase (Winnipeg, Manitoba) may text me about my account, listing claims, bills, and spot alerts. Optional — not required to use or pay on KidEase. Message and data rates may apply. A few texts a month at most. Reply STOP or ARRÊT to opt out, HELP for help. Privacy: kidease.ca/privacy",
    emailService:
      "I agree that KidEase (Winnipeg, Manitoba) may email me saved-search and spot alerts I turn on. Optional. Unsubscribe any time at kidease.ca/unsubscribe or in alert settings. Privacy: kidease.ca/privacy",
    emailCommercial:
      "I agree that KidEase (Winnipeg, Manitoba) may email me occasional news or offers. Optional — not required to pay or use KidEase. Unsubscribe any time at kidease.ca/unsubscribe. Privacy: kidease.ca/privacy",
  },
  fr: {
    smsService:
      "J’accepte que KidEase (Winnipeg, Manitoba) m’envoie des textos sur mon compte, les revendications, les factures et les places. Facultatif — pas exigé pour utiliser ou payer sur KidEase. Des frais de messagerie peuvent s’appliquer. Quelques textos par mois tout au plus. Répondez STOP ou ARRÊT pour vous désabonner, AIDE pour de l’aide. Confidentialité : kidease.ca/privacy",
    emailService:
      "J’accepte que KidEase (Winnipeg, Manitoba) m’écrive pour les alertes de recherche et de places que j’active. Facultatif. Désabonnement en tout temps à kidease.ca/unsubscribe ou dans les préférences d’alerte. Confidentialité : kidease.ca/privacy",
    emailCommercial:
      "J’accepte que KidEase (Winnipeg, Manitoba) m’envoie à l’occasion des nouvelles ou offres. Facultatif — pas exigé pour payer ou utiliser KidEase. Désabonnement en tout temps à kidease.ca/unsubscribe. Confidentialité : kidease.ca/privacy",
  },
} as const;

export type CaslStatementKey = keyof (typeof CASL_STATEMENTS)["en"];

export function caslStatement(locale: CaslLocale, key: CaslStatementKey): string {
  return CASL_STATEMENTS[locale === "fr" ? "fr" : "en"][key];
}

export function statementKeyFor(channel: CaslChannel, purpose: CaslPurpose): CaslStatementKey {
  if (channel === "sms") return "smsService";
  return purpose === "commercial" ? "emailCommercial" : "emailService";
}

export function isCaslChannel(value: string): value is CaslChannel {
  return (CASL_CHANNELS as readonly string[]).includes(value);
}

export function isCaslPurpose(value: string): value is CaslPurpose {
  return (CASL_PURPOSES as readonly string[]).includes(value);
}

export function isCaslBlockPurpose(value: string): value is CaslBlockPurpose {
  return (CASL_BLOCK_PURPOSES as readonly string[]).includes(value);
}

export function isCaslMethod(value: string): value is CaslMethod {
  return (CASL_METHODS as readonly string[]).includes(value);
}

export function normalizeCaslEmail(raw: string | null | undefined): string {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "";
  return value.slice(0, 200);
}

/** ITU-T E.164 toward +1 NANP. Empty when nothing usable remains. */
export function normalizeCaslPhone(raw: string | null | undefined): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const kept = trimmed.replace(/[^\d+]/g, "");
  let digits = "";
  if (kept.startsWith("+")) digits = kept.slice(1).replace(/\D/g, "");
  else digits = kept.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function normalizeCaslAddress(channel: CaslChannel, raw: string | null | undefined): string {
  return channel === "sms" ? normalizeCaslPhone(raw) : normalizeCaslEmail(raw);
}

const STOP_WORDS = new Set([
  "stop",
  "arrêt",
  "arret",
  "unsubscribe",
  "end",
  "quit",
  "cancel",
  "revoke",
  "stopall",
]);

const START_WORDS = new Set(["start", "unstop", "oui", "yes"]);

function firstWord(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") || "";
}

export function isStopKeyword(raw: string): boolean {
  const word = firstWord(raw);
  if (STOP_WORDS.has(word)) return true;
  return firstWord(String(raw || "").trim()) === "arrêt";
}

export function isStartKeyword(raw: string): boolean {
  return START_WORDS.has(firstWord(raw));
}

export type InboundOpt = "stop" | "start" | null;

/**
 * Twilio Advanced Opt-Out sets OptOutType=STOP|START|HELP.
 * Also honour STOP / ARRÊT in the body when the Messaging Service is not used.
 */
export function parseInboundOptOut(params: Record<string, string>): InboundOpt {
  const typed = String(params.OptOutType || params.optOutType || "")
    .trim()
    .toUpperCase();
  if (typed === "STOP") return "stop";
  if (typed === "START") return "start";
  const body = params.Body || params.body || "";
  if (isStopKeyword(body)) return "stop";
  if (isStartKeyword(body)) return "start";
  return null;
}

export type CaslSendDecision =
  | { ok: true }
  | { ok: false; reason: typeof CASL_NO_CONSENT_MESSAGE | typeof CASL_ADDRESS_BLOCKED_MESSAGE };

export function decideCaslSend(input: {
  userGranted: boolean;
  addressBlocked: boolean;
}): CaslSendDecision {
  if (input.addressBlocked) return { ok: false, reason: CASL_ADDRESS_BLOCKED_MESSAGE };
  if (!input.userGranted) return { ok: false, reason: CASL_NO_CONSENT_MESSAGE };
  return { ok: true };
}

export type CaslConsentState = {
  channel: CaslChannel;
  purpose: CaslPurpose;
  granted: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
  method: string | null;
  statement: string | null;
  address: string | null;
  updatedAt: string | null;
};

export function emptyConsent(channel: CaslChannel, purpose: CaslPurpose): CaslConsentState {
  return {
    channel,
    purpose,
    granted: false,
    grantedAt: null,
    withdrawnAt: null,
    method: null,
    statement: null,
    address: null,
    updatedAt: null,
  };
}

export type CaslPrefs = {
  smsService: boolean;
  emailService: boolean;
  emailCommercial: boolean;
};

export type CaslUnsubPayload = {
  userId?: string;
  channel: CaslChannel;
  purpose: CaslPurpose | "all";
  address?: string;
  exp: number;
};

export const CASL_UNSUB_TTL_MS = 60 * 24 * 60 * 60 * 1000;
