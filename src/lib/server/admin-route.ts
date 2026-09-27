import { notFound, redirect } from "@tanstack/react-router";
import { adminDeskGateRedirect } from "@/lib/admin-desk-gate";
import { assertAdminDesk } from "@/lib/server/roles";
import { getRoleChrome } from "@/lib/server/role-route";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

/**
 * beforeLoad for /admin, /admin-chat, /admin-contracts, /admin-email-health.
 * Signed-out and non-admin → plain 404 (not a sign-in page, not a 403).
 * Admin without a 2FA cookie → /verify-2fa. TwoFactorGate still owns the desk.
 */
export async function beforeLoadAdminDesk() {
  const chrome = await getRoleChrome().catch(() => null);
  if (chrome?.e2e) {
    if (chrome.role === "admin") return;
    throw notFound();
  }
  try {
    await withTimeout(assertAdminDesk(), SQL_SETTLE_MS, "admin-gate-timeout");
  } catch (err) {
    const dest = adminDeskGateRedirect(err);
    if ("notFound" in dest) throw notFound();
    throw redirect(dest);
  }
}
