import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listSavedIds, saveDaycare } from "@/lib/server/family";
import { clearShortlistCache, markShortlistCache, takePendingSave, writeShortlistCache } from "@/lib/shortlist";
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
    const id = takePendingSave();
    if (!id) return;
    ran.current = true;
    markShortlistCache(id, true, user.id);
    void saveDaycare({ data: id })
      .then(() => listSavedIds())
      .then((ids) => {
        writeShortlistCache(ids, user.id);
        toast.success(t("savedToShortlist"));
      })
      .catch(() => {
        markShortlistCache(id, false, user.id);
        ran.current = false;
      });
  }, [user, isPending, t]);

  return null;
}
