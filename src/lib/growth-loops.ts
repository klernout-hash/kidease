/**
 * Parent referrals, non-cash thank-yous, daycare family invites, and
 * PostHog attribution. Sharing never changes a bill and never pays cash.
 * FEATURE_GROWTH_LOOPS defaults off.
 */

import { newReferralCode, normalizeReferralCode } from "./referrals.ts";

export const GROWTH_FLAG = "FEATURE_GROWTH_LOOPS";
export const THANK_YOU_KIND = "thank_you" as const;
export const MAX_THANK_YOUS = 20;

export type GrowthEnv = Record<string, string | undefined>;

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function viteFlagEnv(): GrowthEnv {
  try {
    const env = (import.meta as { env?: GrowthEnv }).env;
    return env && typeof env === "object" ? env : {};
  } catch {
    return {};
  }
}

export function growthLoopsEnabled(env?: GrowthEnv): boolean {
  const bag = env ?? {
    ...(typeof process !== "undefined" ? process.env : {}),
    ...viteFlagEnv(),
  };
  return flagOn(bag[GROWTH_FLAG]) || flagOn(bag[`VITE_${GROWTH_FLAG}`]);
}

export type ThankYouDecision = "off" | "self" | "already" | "cap" | "earn";

/** A thank-you is a note on the account. It is not cash, credit, or a free month. */
export function thankYouDecision(input: {
  enabled: boolean;
  referrerId: string;
  referredId: string;
  alreadyRewarded: boolean;
  earnedCount: number;
}): ThankYouDecision {
  if (!input.enabled) return "off";
  if (!input.referrerId || input.referrerId === input.referredId) return "self";
  if (input.alreadyRewarded) return "already";
  if (input.earnedCount >= MAX_THANK_YOUS) return "cap";
  return "earn";
}

export function familyInviteCode(random?: () => number): string {
  return newReferralCode(random);
}

export function familyInvitePath(code: string, locale: string): string {
  const safe = normalizeReferralCode(code);
  if (!safe) return locale === "fr" ? "/fr/search" : "/search";
  return locale === "fr" ? `/fr/welcome/${safe}` : `/welcome/${safe}`;
}

export type GrowthEventName =
  | "referral_opened"
  | "referral_joined"
  | "listing_shared"
  | "family_invite_opened"
  | "family_invite_created";

/**
 * PostHog properties. Codes and slugs only. No email, child name, or phone.
 * Returns null while the flag is off so nothing is captured.
 */
export function growthAttribution(input: {
  enabled: boolean;
  event: GrowthEventName;
  code?: string | null;
  slug?: string | null;
  locale?: string | null;
}): { event: GrowthEventName; properties: Record<string, string> } | null {
  if (!input.enabled) return null;
  const properties: Record<string, string> = { source: "kidease" };
  const code = normalizeReferralCode(input.code || "");
  if (code) properties.code = code;
  const slug = String(input.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  if (slug) properties.listing_slug = slug;
  const locale = input.locale === "fr" ? "fr" : "en";
  properties.locale = locale;
  return { event: input.event, properties };
}

export type ShareCard = {
  title: string;
  text: string;
  url: string;
  image: string;
};

/** Link preview card. Image must already be an absolute https URL. No child photos. */
export function listingShareCard(input: {
  enabled: boolean;
  title: string;
  url: string;
  image: string;
  locale?: string;
}): ShareCard | null {
  if (!input.enabled) return null;
  const title = input.title.trim();
  const url = input.url.trim();
  const image = input.image.trim();
  if (!title || !url.startsWith("https://")) return null;
  if (!image.startsWith("https://media.kidease.ca/") && !image.startsWith("https://www.kidease.ca/og.jpg")) {
    return null;
  }
  const line =
    input.locale === "fr"
      ? "Fiche de garderie permise sur KidEase."
      : "Licensed daycare listing on KidEase.";
  return { title, text: `${line} ${url}`, url, image };
}
