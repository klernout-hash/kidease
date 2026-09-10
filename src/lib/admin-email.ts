/**
 * Who may hold the KidEase Admin desk.
 *
 * King-admin rule: only kyle@kidease.ca may hold Admin.
 * Only kyle@kidease.ca is auto-bootstrapped. Open Road mailboxes never
 * become KidEase admin. SQL `profiles.role = 'admin'` on any other mailbox
 * is ignored. ADMIN_EMAIL cannot bootstrap another @kidease.ca.
 */

export const KIDEASE_OPERATOR_EMAIL = "kyle@kidease.ca";

export const BLOCKED_ADMIN_EMAIL_DOMAINS = ["openroadoutlet.ca"] as const;

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

export function isBlockedAdminEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(normalizeEmail(email));
  if (!domain) return false;
  return BLOCKED_ADMIN_EMAIL_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

export function isKidEaseOperatorEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === KIDEASE_OPERATOR_EMAIL;
}

/**
 * ADMIN_EMAIL env is accepted only when it is kyle@kidease.ca.
 * Leftover Production ADMIN_EMAIL=kyle@openroadoutlet.ca or any other
 * @kidease.ca mailbox is ignored so the Kyle-only rule cannot be widened
 * from env.
 */
export function bootstrapAdminEmail(envAdmin?: string | null): string {
  const raw = normalizeEmail(envAdmin ?? process.env.ADMIN_EMAIL);
  if (isKidEaseOperatorEmail(raw)) return KIDEASE_OPERATOR_EMAIL;
  return KIDEASE_OPERATOR_EMAIL;
}

/** Verified kyle@kidease.ca only. Never Open Road. Never another @kidease.ca. */
export function canBootstrapAdmin(email: string | null | undefined, envAdmin?: string | null): boolean {
  void bootstrapAdminEmail(envAdmin);
  return isKidEaseOperatorEmail(email);
}

/**
 * Stored admin is honored only for kyle@kidease.ca.
 * SQL-promoted non-kyle and missing mailbox fail closed.
 */
export function effectiveAdminRole(input: {
  storedRole: string | null | undefined;
  email?: string | null;
}): "admin" | null {
  if (!isKidEaseOperatorEmail(input.email)) return null;
  return (input.storedRole || "").trim().toLowerCase() === "admin" ? "admin" : null;
}
