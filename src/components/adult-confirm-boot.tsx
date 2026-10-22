import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { takeAdultConfirmedFlag } from "@/lib/adult-confirm";
import { confirmAdultAge } from "@/lib/server/adult-confirm";

/** After Sign in with Apple, Google, or Facebook, save the 18+ checkbox. */
export function AdultConfirmBoot() {
  const { user } = useCurrentUserState();
  useEffect(() => {
    if (!user) return;
    if (!takeAdultConfirmedFlag()) return;
    void confirmAdultAge().catch(() => undefined);
  }, [user]);
  return null;
}
