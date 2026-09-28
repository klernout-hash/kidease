import { useSessionDesks } from "@/components/desk-switcher";
import { canSeeAdminDesk, canVisitDesk, showDeskSwitcher } from "@/lib/desks";

/**
 * Signed-in desk chrome for /menu — kept off the first menu JS chunk.
 * One account, one role: no switcher, and no Admin item in the menu.
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
