import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startViewAs } from "@/lib/server/view-as-api";
import { useCopy } from "@/lib/use-copy";

function viewAsStartMessage(raw: string, fallback: string, blockedAdmin: string, notParent: string): string {
  if (raw.includes("target_admin") || raw.includes("self")) return blockedAdmin;
  if (raw.includes("not_daycare_or_parent") || raw.includes("missing_target")) return notParent;
  if (raw.includes("Two-factor") || raw.includes("Not authorized") || raw.includes("timed out")) return fallback;
  return fallback;
}

export function ViewAsButton({ userId }: { userId: string }) {
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setBusy(true);
    setError("");
    try {
      const result = await startViewAs({ data: { targetUserId: userId } });
      window.location.assign(result.home);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(viewAsStartMessage(raw, t("viewAsFailed"), t("viewAsBlockedAdmin"), t("viewAsNotParent")));
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        disabled={busy || !userId}
        data-ke="view-as-start"
        onClick={() => void onClick()}
      >
        {busy ? t("viewAsStarting") : t("viewAsButton")}
      </Button>
      {error ? (
        <p className="mt-1 max-w-xs text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
