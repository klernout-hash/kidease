/** Friend links. Counts only. Sharing does not change a bill. */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const REFERRAL_STORAGE_KEY = "kidease-refer-code";

export function normalizeReferralCode(raw: string): string | null {
  const code = raw.trim().toLowerCase();
  if (!/^[a-hjkmnp-z2-9]{8}$/.test(code)) return null;
  return code;
}

export function newReferralCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    const index = Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length));
    out += ALPHABET[index];
  }
  return out;
}

export function referralPath(code: string, locale: string): string {
  const safe = normalizeReferralCode(code);
  if (!safe) return locale === "fr" ? "/fr/search" : "/search";
  return locale === "fr" ? `/fr/r/${safe}` : `/r/${safe}`;
}

export function referralDecision(input: {
  codeOwnerId: string | null;
  referredUserId: string;
  alreadyJoined: boolean;
}): "missing" | "self" | "already" | "ok" {
  if (!input.codeOwnerId) return "missing";
  if (input.codeOwnerId === input.referredUserId) return "self";
  if (input.alreadyJoined) return "already";
  return "ok";
}

export function readReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY) || "");
  } catch {
    return null;
  }
}

export function writeReferralCode(code: string) {
  const safe = normalizeReferralCode(code);
  if (!safe || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, safe);
  } catch {
    /* private mode */
  }
}

export function clearReferralCode() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
