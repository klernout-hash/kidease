import { useSessionDesks } from "@/components/session-desks";
import { canWrite, type CentreWriteAction } from "@/lib/centre-roles";

/**
 * Hide provider write controls for Read-only.
 * A parent desk has no centre role, so those controls stay.
 * Until the session is known, writes stay hidden so a Read-only member does not see them first.
 */
export function useCentreWrite(action: CentreWriteAction): boolean {
  const { session, ready } = useSessionDesks();
  if (!ready) return false;
  const role = session?.centreRole;
  if (!role) return true;
  return canWrite(role, action);
}
