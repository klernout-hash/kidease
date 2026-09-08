import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getWaitlistInterest, setWaitlistInterest } from "@/lib/server/waitlist-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";

export function WaitlistOptIn({ daycareId }: { daycareId: string }) {
  const { t } = useCopy();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [optedIn, setOptedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPending || !user) {
      setOptedIn(false);
      return;
    }
    let live = true;
    void getWaitlistInterest({ data: daycareId })
      .then((row) => {
        if (live) setOptedIn(Boolean(row));
      })
      .catch(() => {
        if (live) setOptedIn(false);
      });
    return () => {
      live = false;
    };
  }, [daycareId, user, isPending]);

  function onToggle() {
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    void setWaitlistInterest({ data: { daycareId, optedIn: !optedIn } })
      .then((row) => {
        setOptedIn(Boolean(row));
        toast.success(row ? t("waitlistOptInSaved") : t("waitlistOptInOff"));
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : t("needSignIn"));
        void navigate({ to: "/login" });
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="rounded-lg bg-surface p-4 ring-1 ring-border">
      <p className="font-medium">{t("waitlistOptIn")}</p>
      <p className="mt-1 text-sm text-muted">{t("waitlistOptInLead")}</p>
      <p className="mt-1 text-xs text-subtle">{t("waitlistOptInSmsHint")}</p>
      <Button type="button" variant={optedIn ? "secondary" : "primary"} className="mt-3" disabled={busy} onClick={onToggle}>
        {optedIn ? t("waitlistOptInOn") : user ? t("waitlistOptIn") : t("waitlistOptInNeedSignIn")}
      </Button>
    </div>
  );
}
