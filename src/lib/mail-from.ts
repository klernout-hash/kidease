/**
 * Resend send subdomain vs Titan apex From.
 *
 * Apex `kyle@kidease.ca` (and other @kidease.ca) fails Resend SPF because
 * apex TXT is Titan-only (`include:spf.titan.email -all`). Hotmail/Outlook
 * then quarantines OTPs. `send.kidease.ca` is the Resend-aligned host.
 * Reply-To stays ADMIN_EMAIL / kyle@ (Titan inbox).
 */

export const DEFAULT_TRANSACTIONAL_MAIL_FROM = "KidEase <login@send.kidease.ca>";
export const RESEND_SEND_HOST = "send.kidease.ca";

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

/**
 * Resend / SendGrid From. Ignores leftover Production MAIL_FROM=kyle@
 * so OTP and other transactional mail stay on send.kidease.ca.
 * A verified send.kidease.ca (or other non-apex) MAIL_FROM still wins.
 */
export function transactionalMailFrom(mailFrom = process.env.MAIL_FROM): string {
  const trimmed = (mailFrom || "").trim();
  if (!trimmed || isApexKidEaseFrom(trimmed)) return DEFAULT_TRANSACTIONAL_MAIL_FROM;
  return trimmed;
}
