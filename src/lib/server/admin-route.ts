import { redirect } from "@tanstack/react-router";
import { adminDeskGateRedirect } from "@/lib/admin-desk-gate";
import { assertAdminDesk } from "@/lib/server/roles";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

/**
 * beforeLoad for /admin, /admin-chat, /admin-contracts.
 * Signed-out / hung session → login. Signed-in parent/daycare → home.
 * Admin role without a 2FA cookie → /verify-2fa (never `/` — that looks
 * like a broken Admin pill). TwoFactorGate still owns the painted desk.
 */
export async function beforeLoadAdminDesk() {
  try {
    await withTimeout(assertAdminDesk(), SQL_SETTLE_MS, "admin-gate-timeout");
  } catch (err) {
    throw redirect(adminDeskGateRedirect(err));
  }
}
