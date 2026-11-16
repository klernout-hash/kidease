import { redirect } from "@tanstack/react-router";
import { adminGateFailureKind } from "@/lib/admin-desk-gate";
import { assertSupportDesk } from "@/lib/server/roles";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

/**
 * beforeLoad for /support and /support/$caseId.
 * Staff without a 2FA cookie go to /verify-2fa so enrolment stays reachable.
 * Signed-out visitors go to KidEase sign-in and come back to this desk.
 * A timeout does not 404 the desk.
 */
export async function beforeLoadSupportDesk(next = "/support") {
  const allowed =
    next.startsWith("/support") || next.startsWith("/fr/support") || next.startsWith("/admin-support");
  const dest = allowed ? next : "/support";
  try {
    await withTimeout(assertSupportDesk(), SQL_SETTLE_MS, "support-gate-timeout");
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err ?? "");
    if (adminGateFailureKind(err) === "two_factor") {
      throw redirect({ to: "/verify-2fa", search: { next: dest } });
    }
    // Signed-out visitors go to KidEase sign-in. A slow desk check stays on the page.
    if (raw === "Unauthorized") {
      throw redirect({
        to: dest.startsWith("/fr/") ? "/fr/login" : "/login",
        search: { intent: "in" as const, next: dest, desk: "support" as const },
      });
    }
  }
}
