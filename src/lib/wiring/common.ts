/**
 * Shared rules for the cross-role wiring pack.
 * Flags default off. A flag without FEATURE_*_LIVE only logs the send.
 * SMS still needs FEATURE_SMS and a stored CASL opt-in.
 * Node tests load this file. No @/ imports.
 */

import { automationLiveEnv, automationMode, smsAutomationGate, type AutomationMode } from "../automations.ts";
import { envFlagOn, type EnvMap } from "../flags.ts";

export type WiringLocale = "en" | "fr";
export type NoticeChannel = "in_app" | "email" | "sms" | "push";

export type NoticePlan = {
  mode: AutomationMode;
  channels: NoticeChannel[];
  smsSkipped?: "sms_off" | "no_consent" | "blocked" | "quiet";
  pushSkipped?: "push_off" | "pref_off";
};

export function wiringLocale(raw: unknown): WiringLocale {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "fr" || value.startsWith("fr") ? "fr" : "en";
}

export function wiringEnabled(flag: string, env?: EnvMap): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return envFlagOn(bag[flag]) || envFlagOn(bag[`VITE_${flag}`]);
}

/** Off, log-only practice, or live send. */
export function wiringMode(flag: string, env?: EnvMap, requestDryRun = false): AutomationMode {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return automationMode(wiringEnabled(flag, bag), bag[automationLiveEnv(flag)], requestDryRun);
}

export function normalizeProvince(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toUpperCase();
}

/** A government account sees records only in its own province. */
export function governmentSeesProvince(input: {
  actorProvince: string | null | undefined;
  recordProvince: string | null | undefined;
}): boolean {
  const actor = normalizeProvince(input.actorProvince);
  const record = normalizeProvince(input.recordProvince);
  return Boolean(actor && record && actor === record);
}

/**
 * What a live run may send. Dry-run keeps the same channel list in the log
 * and does not deliver it. SMS is omitted without consent.
 */
export function planServiceNotice(input: {
  mode: AutomationMode;
  email: boolean;
  sms: boolean;
  push: boolean;
  featureSms: boolean;
  smsConsent: boolean;
  addressBlocked: boolean;
  quiet: boolean;
  featurePush: boolean;
  pushPref: boolean;
}): NoticePlan {
  if (input.mode === "off") return { mode: "off", channels: [] };
  const channels: NoticeChannel[] = ["in_app"];
  if (input.email) channels.push("email");
  let smsSkipped: NoticePlan["smsSkipped"];
  if (input.sms) {
    const gate = smsAutomationGate({
      featureSms: input.featureSms,
      userGranted: input.smsConsent,
      addressBlocked: input.addressBlocked,
      quiet: input.quiet,
    });
    if (gate.ok) channels.push("sms");
    else smsSkipped = gate.reason;
  }
  let pushSkipped: NoticePlan["pushSkipped"];
  if (input.push) {
    if (!input.featurePush) pushSkipped = "push_off";
    else if (!input.pushPref) pushSkipped = "pref_off";
    else channels.push("push");
  }
  return { mode: input.mode, channels, smsSkipped, pushSkipped };
}

/** Monthly dollars already stored on a listing. Null means the fee is not on file. */
export function storedFeeCents(input: {
  ageGroup: string;
  infantMonthly: number | null;
  toddlerMonthly: number | null;
  preschoolMonthly: number | null;
}): { cents: number } | { error: "fee_missing" } {
  const dollars = (value: number | null) =>
    value != null && Number.isInteger(value) && value >= 0 && value <= 20000 ? value * 100 : null;
  const age = clipText(input.ageGroup, 20).toLowerCase();
  const pick =
    age === "infant"
      ? dollars(input.infantMonthly)
      : age === "toddler"
        ? dollars(input.toddlerMonthly)
        : age === "preschool"
          ? dollars(input.preschoolMonthly)
          : null;
  if (age === "any") {
    const values = [dollars(input.infantMonthly), dollars(input.toddlerMonthly), dollars(input.preschoolMonthly)].filter(
      (value): value is number => value != null,
    );
    if (!values.length || new Set(values).size !== 1) return { error: "fee_missing" };
    return { cents: values[0]! };
  }
  if (pick == null) return { error: "fee_missing" };
  return { cents: pick };
}

export function clipText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}
