import { redirect } from "@tanstack/react-router";
import { assertAdminDesk } from "@/lib/server/roles";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

/**
 * beforeLoad for /admin, /admin-chat, /admin-contracts.
 * Signed-out → login. Signed-in parent/daycare → home. Never opens Admin.
 * A hung getSession must go to login, not `/`, or the home desk bounce loops.
 */
export async function beforeLoadAdminDesk() {
  try {
    await withTimeout(assertAdminDesk(), SQL_SETTLE_MS, "admin-gate-timeout");
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw === "Unauthorized" || raw === "admin-gate-timeout") {
      throw redirect({
        to: "/login",
        search: { intent: "in" as const, next: "/admin" },
      });
    }
    throw redirect({ to: "/" });
  }
}
