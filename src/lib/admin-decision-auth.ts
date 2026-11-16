import { effectiveAdminRole } from "./admin-email.ts";

/**
 * Who may approve, keep waiting, or ask for a document.
 * The same operator who can open the admin list: kyle@kidease.ca with
 * profiles.role = admin. A mailbox that is not marked verified still counts.
 * Other mailboxes do not, even if a row says admin.
 * Cloudflare Access is not an input. These actions run on /_serverFn, which
 * is outside the Access app.
 */
export function adminMayDecideCentre(input: {
  email?: string | null;
  storedRole?: string | null;
}): boolean {
  return effectiveAdminRole({ storedRole: input.storedRole, email: input.email }) === "admin";
}
