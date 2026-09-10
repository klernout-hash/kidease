/**
 * Resend send subdomain vs Titan apex From.
 *
 * Apex `kyle@kidease.ca` (and other @kidease.ca) fails Resend SPF because
 * apex TXT is Titan-only (`include:spf.titan.email -all`). Hotmail/Outlook
 * then quarantines OTPs. `send.kidease.ca` is the Resend-aligned host.
 * Reply-To stays ADMIN_EMAIL / kyle@ (Titan inbox).
 */

export const DEFAULT_TRANSACTIONAL_MAIL_FROM = "KidEase <noreply@send.kidease.ca>";
export const RESEND_SEND_HOST = "send.kidease.ca";
/** Leftover Vercel MAIL_FROM before the noreply local-part. Remapped. */
export const LEGACY_RESEND_LOGIN_FROM = "login@send.kidease.ca";

export function mailFromEmail(header: string): string {
  const trimmed = header.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] || trimmed).trim().toLowerCase();
}

export function isResendSendFrom(header: string): boolean {
  const email = mailFromEmail(header);
  return Boolean(email) && email.endsWith(`@${RESEND_SEND_HOST}`);
}

/** Apex kidease.ca (kyle@, support@) — Titan SPF only, not Resend. */
export function isApexKidEaseFrom(header: string): boolean {
  const email = mailFromEmail(header);
  return email.endsWith("@kidease.ca") && !isResendSendFrom(header);
}

/** Old `login@send.kidease.ca` default — remap to noreply. */
export function isLegacyLoginSendFrom(header: string): boolean {
  return mailFromEmail(header) === LEGACY_RESEND_LOGIN_FROM;
}

/**
 * Resend / SendGrid From. Ignores leftover Production MAIL_FROM=kyle@
 * and the old login@ send local-part so OTP and other transactional mail
 * stay on `noreply@send.kidease.ca`. A different verified send.kidease.ca
 * MAIL_FROM still wins.
 */
export function transactionalMailFrom(mailFrom = process.env.MAIL_FROM): string {
  const trimmed = (mailFrom || "").trim();
  if (!trimmed || isApexKidEaseFrom(trimmed) || isLegacyLoginSendFrom(trimmed)) {
    return DEFAULT_TRANSACTIONAL_MAIL_FROM;
  }
  return trimmed;
}
