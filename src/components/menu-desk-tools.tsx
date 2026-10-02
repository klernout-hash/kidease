import { useSessionDesks } from "@/components/desk-switcher";
import { canSeeAdminDesk, canVisitDesk, showDeskSwitcher } from "@/lib/desks";

/**
 * Signed-in desk chrome for /menu: kept off the first menu JS chunk.
 * The operator admin switcher is the header pills, not a menu row.
 */
export function MenuDeskTools() {
  const { session } = useSessionDesks();
  const multiDesk = Boolean(showDeskSwitcher(session?.desks, session?.role, session?.email));
  const showAdmin = Boolean(
    canSeeAdminDesk(session?.role, session?.email) &&
      session &&
      canVisitDesk(session.desks, "admin", session.role, session.email),
  );
  void multiDesk;
  void showAdmin;
  return null;
}
