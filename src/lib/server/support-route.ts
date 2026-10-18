import { redirect } from "@tanstack/react-router";
import { adminGateFailureKind } from "@/lib/admin-desk-gate";
import { assertSupportDesk } from "@/lib/server/roles";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

/**
 * beforeLoad for /support and /support/$caseId.
 * Staff without a 2FA cookie go to /verify-2fa so enrolment stays reachable.
 * Signed-out visitors and non-staff stay on the page the route already paints.
 * A timeout does not 404 the desk.
 */
export async function beforeLoadSupportDesk(next = "/support") {
  const dest = next.startsWith("/support") ? next : "/support";
  try {
    await withTimeout(assertSupportDesk(), SQL_SETTLE_MS, "support-gate-timeout");
  } catch (err) {
    if (adminGateFailureKind(err) !== "two_factor") return;
    throw redirect({ to: "/verify-2fa", search: { next: dest } });
  }
}
