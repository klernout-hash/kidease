/**
 * Shared flag and province rules for the compliance pack.
 * Each tool still has its own flag. This file does not turn any tool on.
 */

import { envFlagOn, type EnvMap } from "../flags.ts";
import { isProvinceCode, type ProvinceCode } from "../gov/places.ts";

export type PackMode = "off" | "dry_run" | "live";

const SECRET_KEY = /email|phone|name|child|token|secret|address|postal|password|body|summary|detail|label/i;

export function packMode(flagRaw: string | undefined | null, liveRaw: string | undefined | null): PackMode {
  if (!envFlagOn(flagRaw)) return "off";
  return envFlagOn(liveRaw) ? "live" : "dry_run";
}

export function modeFor(flag: string, env: EnvMap): PackMode {
  return packMode(env[flag], env[`${flag}_LIVE`]);
}

export function homeProvince(
  govProvince: string | null | undefined,
  orgProvince?: string | null,
): ProvinceCode | null {
  const explicit = String(govProvince || "").trim().toUpperCase();
  if (isProvinceCode(explicit)) return explicit;
  const org = String(orgProvince || "").trim().toUpperCase();
  return isProvinceCode(org) ? org : null;
}

/** Admin sees every province. A government user sees only gov_province (or their org). */
export function canSeeProvince(input: {
  role: string;
  govProvince: string | null | undefined;
  orgProvince?: string | null;
  rowProvince: string;
}): boolean {
  const role = input.role.trim().toLowerCase();
  if (role === "admin") return true;
  if (role !== "government") return false;
  const home = homeProvince(input.govProvince, input.orgProvince);
  if (!home) return false;
  return home === String(input.rowProvince || "").trim().toUpperCase();
}

export function redactLog(payload: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SECRET_KEY.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

export type ChannelPlan = { delivery: "skip" | "log" | "send"; reason: string };

/** A text is sent only in live mode and only when CASL SMS consent is on file. */
export function smsPlan(mode: PackMode, caslSms: boolean): ChannelPlan {
  if (mode === "off") return { delivery: "skip", reason: "off" };
  if (!caslSms) return { delivery: "skip", reason: "no_consent" };
  if (mode === "dry_run") return { delivery: "log", reason: "practice" };
  return { delivery: "send", reason: "live" };
}

/** Practice mode logs the email. Live mode may send it. Off sends nothing. */
export function emailPlan(mode: PackMode, hasEmail: boolean, alreadySent = false): ChannelPlan {
  if (mode === "off") return { delivery: "skip", reason: "off" };
  if (alreadySent) return { delivery: "skip", reason: "duplicate" };
  if (!hasEmail) return { delivery: "skip", reason: "no_email" };
  if (mode === "dry_run") return { delivery: "log", reason: "practice" };
  return { delivery: "send", reason: "live" };
}

export function sameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(a) === fmt.format(b);
}

export { envFlagOn, isProvinceCode };
export type { EnvMap, ProvinceCode };
