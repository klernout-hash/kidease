/**
 * Who may hold the KidEase Admin desk.
 *
 * Only kyle@kidease.ca is auto-bootstrapped. Open Road mailboxes
 * (kyle@openroadoutlet.ca and any @openroadoutlet.ca) never become
 * KidEase admin — even if ADMIN_EMAIL is mis-set or profiles.role is
 * already admin.
 *
 * Extra staff stay SQL-promoted (`update profiles set role = 'admin'`),
 * but a blocked mailbox still fails closed.
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
 * ADMIN_EMAIL env, never an Open Road / non-kidease.ca mailbox.
 * A leftover Production ADMIN_EMAIL=kyle@openroadoutlet.ca is ignored.
 */
export function bootstrapAdminEmail(envAdmin?: string | null): string {
  const raw = normalizeEmail(envAdmin ?? process.env.ADMIN_EMAIL);
  if (!raw || isBlockedAdminEmail(raw) || !raw.endsWith("@kidease.ca")) {
    return KIDEASE_OPERATOR_EMAIL;
  }
  return raw;
}

/** Verified kyle@kidease.ca (or an explicit @kidease.ca ADMIN_EMAIL). Never Open Road. */
export function canBootstrapAdmin(email: string | null | undefined, envAdmin?: string | null): boolean {
  const e = normalizeEmail(email);
  if (!e || isBlockedAdminEmail(e)) return false;
  return e === bootstrapAdminEmail(envAdmin);
}

/**
 * Stored admin is honored unless the session mailbox is blocked.
 * Parent / Daycare roles never become admin here.
 */
export function effectiveAdminRole(input: {
  storedRole: string | null | undefined;
  email?: string | null;
}): "admin" | null {
  if (isBlockedAdminEmail(input.email)) return null;
  return (input.storedRole || "").trim().toLowerCase() === "admin" ? "admin" : null;
}
