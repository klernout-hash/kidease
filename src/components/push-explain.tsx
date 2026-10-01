import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isNative } from "@/lib/native";
import { pushPromptStep } from "@/lib/push-prompt";
import { registerPushDevice } from "@/lib/push-client";
import { useCopy } from "@/lib/use-copy";

const SEEN_KEY = "ke-native-opened";
const CHOICE_KEY = "ke-push-choice";

/**
 * Native only. The first launch writes a seen flag and does not prompt.
 * A later launch shows this card. The system permission sheet opens only after Turn on.
 */
export function PushExplain() {
  const { t } = useCopy();
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNative() || !user?.id) return;
    let cancelled = false;
    void (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const seen = await Preferences.get({ key: SEEN_KEY });
      if (!seen.value) {
        await Preferences.set({ key: SEEN_KEY, value: "1" });
        return;
      }
      const choice = await Preferences.get({ key: CHOICE_KEY });
      const { getPushClientStatus } = await import("@/lib/server/push-api");
      const status = await getPushClientStatus().catch(() => ({ enabled: false }));
      const step = pushPromptStep({
        enabled: status.enabled,
        firstLaunch: false,
        choice: choice.value,
      });
      if (cancelled) return;
      if (step === "explain") setOpen(true);
      if (step === "register") await registerPushDevice({ enabled: true });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function choose(value: "yes" | "no") {
    setOpen(false);
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: CHOICE_KEY, value });
    if (value === "yes") await registerPushDevice({ enabled: true });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 px-4">
      <div className="mx-auto max-w-lg rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border">
        <p className="text-base font-semibold text-fg">{t("pushExplainTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("pushExplainBody")}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button className="min-h-11" onClick={() => void choose("yes")}>
            {t("pushExplainYes")}
          </Button>
          <Button variant="secondary" className="min-h-11" onClick={() => void choose("no")}>
            {t("pushExplainNo")}
          </Button>
        </div>
      </div>
    </div>
  );
}
