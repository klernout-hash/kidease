import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canVisitDesk } from "@/lib/desks";
import { ghlLeadDesk, retryGhlLeadPushes } from "@/lib/server/ghl-lead-push";

type Desk = Awaited<ReturnType<typeof ghlLeadDesk>>;

export function GhlLeadDeskPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const admin = Boolean(ready && session && canVisitDesk(session.desks, "admin", session.role));

  useEffect(() => {
    if (!user || !admin) return;
    let cancelled = false;
    void ghlLeadDesk()
      .then((data) => {
        if (!cancelled) setDesk(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the signup check.");
      });
    return () => {
      cancelled = true;
    };
  }, [user, admin]);

  if (isPending || !ready) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!admin) {
    return (
      <Shell>
        <p className="p-8">This page is for KidEase staff.</p>
      </Shell>
    );
  }

  const enabled = desk && desk.ok && desk.enabled;
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      await retryGhlLeadPushes();
      setDesk(await ghlLeadDesk());
    } catch {
      setError("Could not retry. No email or text was sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TwoFactorGate next="/admin-ghl-leads">
      <DeskShell
        desk="admin"
        active="ghl-leads"
        onSelect={() => {
          if (typeof window !== "undefined") window.location.assign("/admin");
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <h1 className="font-display text-3xl">Signup check</h1>
          <p className="mt-3 text-base leading-6">KidEase signups in GoHighLevel. This does not email or text anyone.</p>
          <p className="mt-4 text-base leading-6">
            Parents go to Parent Onboard. Daycares and listing claims go to Daycare Sign Up. A centre’s own families stay out of this list.
          </p>
          {desk && desk.ok ? (
            <p className="mt-4 text-base leading-6">
              {enabled
                ? "The signup push is on."
                : "The signup push is off until Kyle turns it on."}{" "}
              Line type lookup is {desk.lineTypeEnabled ? "on" : "off"}. Each lookup costs ${desk.lineTypeUsd.toFixed(3)}.
            </p>
          ) : null}
          {desk && desk.ok && desk.latest ? (
            <ul className="mt-6 space-y-2 text-base leading-6">
              <li>Checked: {desk.latest.checked}</li>
              <li>Missing contact: {desk.latest.missingContact}</li>
              <li>Missing opportunity: {desk.latest.missingOpportunity}</li>
              <li>No welcome email in the first hour: {desk.latest.missingWelcome}</li>
              <li>Retried: {desk.latest.retried}</li>
            </ul>
          ) : (
            <p className="mt-6 text-base leading-6">No check has run yet.</p>
          )}
          {error ? <p className="mt-4 text-base text-destructive">{error}</p> : null}
          <Button className="mt-6 min-h-11" disabled={!enabled || busy} onClick={() => void retry()}>
            {enabled ? "Retry failed signups" : "Push is off"}
          </Button>
        </div>
      </DeskShell>
    </TwoFactorGate>
  );
}
