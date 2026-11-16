import { useEffect, useState } from "react";
import { acceptMyStaffInvite, listMyStaffInvites } from "@/lib/server/centre-members";
import { useCopy } from "@/lib/use-copy";

type StaffInvite = { id: string; centre: string; role: string };

/** First screen for a signed-in parent whose email has a live staff invite. */
export function StaffInviteBanner() {
  const { t } = useCopy();
  const [invite, setInvite] = useState<StaffInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    void listMyStaffInvites()
      .then((result) => {
        if (!cancel) setInvite(result.invites[0] ?? null);
      })
      .catch(() => {
        if (!cancel) setInvite(null);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!invite) return null;
  return (
    <div data-ke="staff-invite-banner" className="border-b border-border bg-surface px-4 py-3" role="status">
      <p className="text-sm text-fg">{t("staffInviteBanner").replace("{centre}", invite.centre)}</p>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void acceptMyStaffInvite({ data: { id: invite.id } })
            .then(() => {
              window.location.assign("/provider");
            })
            .catch(() => {
              setBusy(false);
              setError(t("staffInviteAcceptFailed"));
            });
        }}
      >
        {t("staffInviteAccept")}
      </button>
    </div>
  );
}
