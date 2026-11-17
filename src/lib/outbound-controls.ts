/**
 * Outbound safety controls: group kill switches, daily caps and messaging
 * test mode. Pure logic only (no DB) so it runs in tests and on any runtime.
 * The SQL store and the send gate live in src/lib/server/outbound-gate.ts.
 */

export type OutboundChannel = "sms" | "email" | "push" | "media";
export type OutboundGroup = "sms" | "email" | "push" | "gov" | "paid";

export const OUTBOUND_GROUPS: readonly OutboundGroup[] = ["sms", "email", "push", "gov", "paid"];
export const OUTBOUND_CHANNELS: readonly OutboundChannel[] = ["sms", "email", "push", "media"];

/** Days reset at midnight in Winnipeg (Central). */
export const OUTBOUND_TIME_ZONE = "America/Winnipeg";

export const DEFAULT_DAILY_CAPS: Record<OutboundChannel, number> = {
  sms: 200,
  email: 2000,
  push: 5000,
  /** Video and voice minutes. */
  media: 120,
};

/**
 * Twilio does not report call length back to KidEase yet, so each call or
 * video join counts as this many minutes until usage callbacks are wired.
 */
export const DEFAULT_MEDIA_MINUTES_PER_SESSION = 15;

/**
 * Flags a group switch forces off. Turning a switch back on only stops
 * forcing: each flag then follows its own value again.
 * Base channel flags (FEATURE_SMS, FEATURE_PUSH) are left out on purpose:
 * password, verification and emergency messages ride on them and must keep
 * going. The send gate blocks everything else on that channel.
 */
export const OUTBOUND_GROUP_FLAGS: Record<OutboundGroup, readonly string[]> = {
  sms: [
    "FEATURE_FORM_SMS",
    "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
    "FEATURE_SUPPORT_SMS_REPLY",
    "FEATURE_SUPPORT_SMS_ALERT",
  ],
  email: [
    "FEATURE_OPEN_SPOT_ALERTS",
    "FEATURE_SPOT_OFFER_MAIL",
    "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
    "FEATURE_AREA_WAITLIST_ALERTS",
    "FEATURE_INVOICE_REMINDERS",
    "FEATURE_PAYMENT_DUNNING",
    "FEATURE_MISSING_INFO_REMINDERS",
    "FEATURE_DAYCARE_ONBOARDING",
    "FEATURE_CLAIM_LISTING_REMINDERS",
    "FEATURE_STALE_OPEN_SPOTS",
    "FEATURE_POST_TOUR_FOLLOWUP",
    "FEATURE_ENROLMENT_REVIEW",
    "FEATURE_COPARENT_EMAIL",
    "FEATURE_FAMILY_BULK_MAIL",
    "FEATURE_UNIFIED_ALERTS_LIVE",
  ],
  push: ["FEATURE_NATIVE_PUSH", "FEATURE_AMAZON_ADM", "FEATURE_HUAWEI_ALERT_PUSH", "FEATURE_SAMSUNG_PUSH_FALLBACK"],
  gov: [
    "FEATURE_GOV_PORTAL",
    "FEATURE_GOV_SCOPES",
    "FEATURE_PROVINCE_REPORTS",
    "FEATURE_CWELCC_MATH",
    "FEATURE_CCFRI",
    "FEATURE_AB_GRANT",
    "FEATURE_MUNI_STATS",
  ],
  paid: ["FEATURE_VIDEO", "FEATURE_VIDEO_SHARE", "FEATURE_VOICE", "FEATURE_PUBLIC_API", "FEATURE_AI_PHONE_RECEPTION"],
};

export const CHANNEL_GROUP: Record<OutboundChannel, OutboundGroup> = {
  sms: "sms",
  email: "email",
  push: "push",
  media: "paid",
};

export type OutboundControls = {
  /** true = group is on (default). false = forced off. */
  switches: Record<OutboundGroup, boolean>;
  caps: Record<OutboundChannel, number>;
  mediaMinutesPerSession: number;
  testMode: boolean;
  /** Admin overrides. Empty → env OUTBOUND_TEST_EMAIL / OUTBOUND_TEST_PHONE. */
  testEmail: string;
  testPhone: string;
};

/** Storage keys in outbound_controls. */
export const CONTROL_KEYS = {
  switch: (g: OutboundGroup) => `switch:${g}`,
  cap: (c: OutboundChannel) => `cap:${c}`,
  mediaMinutesPerSession: "media_minutes_per_session",
  testMode: "test_mode",
  testEmail: "test_email",
  testPhone: "test_phone",
} as const;

export function defaultControls(): OutboundControls {
  return {
    switches: { sms: true, email: true, push: true, gov: true, paid: true },
    caps: { ...DEFAULT_DAILY_CAPS },
    mediaMinutesPerSession: DEFAULT_MEDIA_MINUTES_PER_SESSION,
    testMode: false,
    testEmail: "",
    testPhone: "",
  };
}

function onOff(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on") return true;
  if (v === "0" || v === "false" || v === "off") return false;
  return fallback;
}

function wholeNumber(raw: string | undefined, fallback: number, max = 1_000_000): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Build controls from stored rows. Unknown or bad values fall back to defaults. */
export function controlsFromRows(rows: ReadonlyArray<{ key: string; value: string }>): OutboundControls {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const base = defaultControls();
  for (const g of OUTBOUND_GROUPS) base.switches[g] = onOff(map.get(CONTROL_KEYS.switch(g)), true);
  for (const c of OUTBOUND_CHANNELS) base.caps[c] = wholeNumber(map.get(CONTROL_KEYS.cap(c)), DEFAULT_DAILY_CAPS[c]);
  base.mediaMinutesPerSession = Math.max(
    1,
    wholeNumber(map.get(CONTROL_KEYS.mediaMinutesPerSession), DEFAULT_MEDIA_MINUTES_PER_SESSION, 600),
  );
  base.testMode = onOff(map.get(CONTROL_KEYS.testMode), false);
  base.testEmail = (map.get(CONTROL_KEYS.testEmail) || "").trim();
  base.testPhone = (map.get(CONTROL_KEYS.testPhone) || "").trim();
  return base;
}

/** Validate one admin edit. Returns the value to store, or an error. */
export function normalizeControlEdit(key: string, raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? "").trim();
  if (key.startsWith("switch:")) {
    if (!OUTBOUND_GROUPS.includes(key.slice(7) as OutboundGroup)) return { ok: false, error: "Unknown switch." };
    return { ok: true, value: onOff(value, true) ? "1" : "0" };
  }
  if (key.startsWith("cap:")) {
    if (!OUTBOUND_CHANNELS.includes(key.slice(4) as OutboundChannel)) return { ok: false, error: "Unknown cap." };
    if (!/^\d{1,7}$/.test(value)) return { ok: false, error: "Use a whole number." };
    return { ok: true, value: String(Number(value)) };
  }
  if (key === CONTROL_KEYS.mediaMinutesPerSession) {
    if (!/^\d{1,3}$/.test(value) || Number(value) < 1) return { ok: false, error: "Use 1 to 999 minutes." };
    return { ok: true, value: String(Number(value)) };
  }
  if (key === CONTROL_KEYS.testMode) return { ok: true, value: onOff(value, false) ? "1" : "0" };
  if (key === CONTROL_KEYS.testEmail) {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false, error: "Use a full email address." };
    return { ok: true, value: value.toLowerCase() };
  }
  if (key === CONTROL_KEYS.testPhone) {
    if (value && !/^\+[1-9]\d{7,14}$/.test(value)) return { ok: false, error: "Use +1 and the full number." };
    return { ok: true, value };
  }
  return { ok: false, error: "Unknown setting." };
}

/** YYYY-MM-DD in Winnipeg for the given moment. */
export function outboundDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OUTBOUND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Flags forced off by the current switches. */
export function forcedOffFlags(controls: OutboundControls): Set<string> {
  const out = new Set<string>();
  for (const g of OUTBOUND_GROUPS) {
    if (controls.switches[g]) continue;
    for (const key of OUTBOUND_GROUP_FLAGS[g]) out.add(key);
  }
  return out;
}

export type OutboundBlockReason = "switch_off" | "daily_cap" | "no_test_recipient";

/**
 * Before counting: is this send blocked by a switch or by test mode having
 * nowhere to send? Essential messages (password, verification, emergency)
 * are never blocked by a switch or a cap. They are still counted.
 */
export function precheckOutbound(input: {
  controls: OutboundControls;
  channel: OutboundChannel;
  essential: boolean;
  testRecipient: string;
}): { ok: true } | { ok: false; reason: OutboundBlockReason } {
  const { controls, channel } = input;
  if (!input.essential && !controls.switches[CHANNEL_GROUP[channel]]) return { ok: false, reason: "switch_off" };
  if (controls.testMode && (channel === "email" || channel === "sms") && !input.testRecipient) {
    return { ok: false, reason: "no_test_recipient" };
  }
  return { ok: true };
}

/** Test mode: mark the subject with who it was meant for. */
export function testModeSubject(subject: string, originalTo: string): string {
  return `[TEST → ${originalTo}] ${subject}`.slice(0, 200);
}

/** Test mode: SMS bodies carry the original number up front. */
export function testModeSmsBody(body: string, originalTo: string): string {
  return `[TEST → ${originalTo}] ${body}`;
}

/**
 * Which test address to use: the admin page first, then OUTBOUND_TEST_*,
 * then Kyle's existing operator contacts (ADMIN_EMAIL, ADMIN_SMS).
 */
export function resolveTestRecipient(
  controls: OutboundControls,
  channel: OutboundChannel,
  env: Record<string, string | undefined>,
): string {
  const pick = (...values: Array<string | undefined>) => values.map((v) => (v || "").trim()).find(Boolean) || "";
  if (channel === "email") return pick(controls.testEmail, env.OUTBOUND_TEST_EMAIL, env.ADMIN_EMAIL);
  if (channel === "sms") return pick(controls.testPhone, env.OUTBOUND_TEST_PHONE, env.ADMIN_SMS);
  return "";
}

/** Plain words for the admin panel and logs. */
export const OUTBOUND_GROUP_LABEL: Record<OutboundGroup, string> = {
  sms: "All text messages",
  email: "All automated email",
  push: "All push notifications",
  gov: "All government features",
  paid: "All paid services (video, voice, public API)",
};

export const OUTBOUND_CHANNEL_LABEL: Record<OutboundChannel, string> = {
  sms: "Texts per day",
  email: "Emails per day",
  push: "Push notifications per day",
  media: "Video and voice minutes per day",
};
