/**
 * Claim contact checks. Masks only — never return a full phone or email.
 * In QA (anything that is not Vercel production), codes go only to QA
 * mailboxes or kyle@kidease.ca. SMS to a real registry number stays off there.
 */

export type ClaimChannel = "email" | "sms";

export function maskClaimPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `***-***-${digits.slice(-4)}`;
}

export function maskClaimEmail(raw: string | null | undefined): string {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes(".")) return "";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function claimContactPreview(input: { phone?: string | null; email?: string | null }) {
  const phoneMask = maskClaimPhone(input.phone);
  const emailMask = maskClaimEmail(input.email);
  return {
    phoneMask,
    emailMask,
    hasPhone: Boolean(phoneMask),
    hasEmail: Boolean(emailMask),
    needsLicenceOnly: !phoneMask && !emailMask,
  };
}

/** Six digits. `draw` returns an integer from 0 through 999999. */
export function makeClaimDigitCode(draw: () => number = randomSix): string {
  const n = Math.floor(Math.abs(draw()));
  return String(n % 1_000_000).padStart(6, "0");
}

function randomSix() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! % 1_000_000;
}

export function claimSendAllowed(sends: number, sentAt: number | null, now: number, max = 5, windowMs = 60 * 60 * 1000) {
  const within = sentAt != null && now - sentAt < windowMs;
  const used = within ? sends : 0;
  return { allowed: used < max, used };
}

export function isClaimQaMailbox(email: string | null | undefined): boolean {
  const value = String(email || "").trim().toLowerCase();
  if (value === "kyle@kidease.ca") return true;
  const at = value.indexOf("@");
  if (at <= 0 || value.slice(at + 1) !== "kidease.ca") return false;
  const local = value.slice(0, at);
  return local === "kyle" || local.startsWith("qa") || local.startsWith("reviewer") || local.includes("+qa");
}

export function isClaimProduction(env: { VERCEL_ENV?: string } = process.env): boolean {
  return (env.VERCEL_ENV || "").trim() === "production";
}

/**
 * Production may use the registry phone or email.
 * QA may email only a QA account or Kyle. QA never texts a registry number.
 */
export function claimCodeDestinationAllowed(input: {
  production: boolean;
  channel: ClaimChannel;
  destination: string;
}): boolean {
  if (input.channel === "sms") return input.production;
  const dest = input.destination.trim().toLowerCase();
  if (!dest.includes("@")) return false;
  if (input.production) return true;
  return isClaimQaMailbox(dest);
}
