/**
 * One in-app inbox, read receipts, and channel choices.
 * SMS sends only for a CASL opt-in. Push stays off until FEATURE_PUSH.
 * FEATURE_NOTIFICATION_CENTRE defaults off.
 */

import { planServiceNotice, wiringEnabled, wiringMode } from "./common.ts";

export const NOTIFICATION_CENTRE_FLAG = "FEATURE_NOTIFICATION_CENTRE";
export const NOTICE_CHANNELS = ["in_app", "email", "sms", "push"] as const;
export type NoticePrefChannel = (typeof NOTICE_CHANNELS)[number];

export function notificationCentreEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(NOTIFICATION_CENTRE_FLAG, env);
}

export function notificationCentreMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(NOTIFICATION_CENTRE_FLAG, env, dry);
}

export type ChannelPrefs = Record<NoticePrefChannel, boolean>;

export function defaultChannelPrefs(): ChannelPrefs {
  return { in_app: true, email: true, sms: false, push: false };
}

export function parseChannelPrefs(raw: unknown): ChannelPrefs {
  const base = defaultChannelPrefs();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  for (const channel of NOTICE_CHANNELS) {
    if (typeof row[channel] === "boolean") base[channel] = row[channel] as boolean;
  }
  return base;
}

export function centreDelivery(input: {
  mode: ReturnType<typeof notificationCentreMode>;
  prefs: ChannelPrefs;
  featureSms: boolean;
  smsConsent: boolean;
  addressBlocked: boolean;
  quiet: boolean;
  featurePush: boolean;
}) {
  return planServiceNotice({
    mode: input.mode,
    email: input.prefs.email,
    sms: input.prefs.sms,
    push: input.prefs.push,
    featureSms: input.featureSms,
    smsConsent: input.smsConsent,
    addressBlocked: input.addressBlocked,
    quiet: input.quiet,
    featurePush: input.featurePush,
    pushPref: input.prefs.push,
  });
}

export function markRead(input: { readerId: string; ownerId: string; already: string | null; now: string }): { readAt: string; readBy: string } | { error: "reader" } {
  if (!input.readerId || input.readerId !== input.ownerId) return { error: "reader" };
  if (input.already) return { readAt: input.already, readBy: input.readerId };
  return { readAt: input.now, readBy: input.readerId };
}
