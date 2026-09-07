import { redirect } from "@tanstack/react-router";
import { assertAdminDesk } from "@/lib/server/roles";

/**
 * beforeLoad for /admin, /admin-chat, /admin-contracts.
 * Signed-out → login. Signed-in parent/daycare → home. Never opens Admin.
 */
export async function beforeLoadAdminDesk() {
  try {
    await assertAdminDesk();
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw === "Unauthorized") {
      throw redirect({
        to: "/login",
        search: { intent: "in" as const, next: "/admin" },
      });
    }
    throw redirect({ to: "/" });
  }
}
