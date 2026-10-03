import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/success-confirm";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listSavedIds, saveDaycare } from "@/lib/server/family";
import { takeGuestShortlist } from "@/lib/guest-shortlist";
import { capturePostHogEvent } from "@/lib/posthog";
import { clearShortlistCache, markShortlistCache, takePendingSave, writeShortlistCache } from "@/lib/shortlist";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload } from "@/lib/signup-funnel";
import { useCopy } from "@/lib/use-copy";

/** After sign-in, persist the centre the guest tried to save. */
export function ApplyPendingShortlist() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const ran = useRef(false);

  useEffect(() => {
    if (!isPending && !user) {
      clearShortlistCache();
      ran.current = false;
    }
  }, [user, isPending]);

  useEffect(() => {
    if (isPending || !user || ran.current) return;
    const pending = takePendingSave();
    const guest = takeGuestShortlist();
    const ids = [...new Set([...(pending ? [pending] : []), ...guest.map((row) => row.id)])];
    if (!ids.length) return;
    ran.current = true;
    for (const id of ids) markShortlistCache(id, true, user.id);
    void Promise.all(ids.map((id) => saveDaycare({ data: id })))
      .then(() => listSavedIds())
      .then((saved) => {
        writeShortlistCache(saved, user.id);
        capturePostHogEvent(
          SIGNUP_FUNNEL_EVENT,
          signupFunnelPayload("shortlist_carried", { carried: ids.length, source: "login" }),
        );
        if (ids.length > 1) toast.message(t("guestShortlistCarried"));
        else confirmAction(t, "listingSaved");
      })
      .catch(() => {
        for (const id of ids) markShortlistCache(id, false, user.id);
        ran.current = false;
      });
  }, [user, isPending, t]);

  return null;
}
