import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { canVisitDesk } from "@/lib/desks";
import { cn } from "@/lib/utils";

type CampaignRow = {
  campaign: string;
  delivered: number;
  bounced: number;
  complained: number;
  bounceRate: number;
  complaintRate: number;
  warn: boolean;
};

type HealthPayload = {
  ok?: boolean;
  error?: string;
  days?: number;
  suppressed?: number;
  thresholds?: { bouncePct: number; complaintPct: number };
  campaigns?: CampaignRow[];
};

export const Route = createFileRoute("/admin-email-health")({
  beforeLoad: beforeLoadAdminDesk,
  head: () => ({
    meta: [
      { title: "Email health · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EmailHealthPage,
});

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

function EmailHealthPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [days, setDays] = useState<7 | 30>(7);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const admin = Boolean(ready && session && canVisitDesk(session.desks, "admin", session.role));

  useEffect(() => {
    if (!user || !admin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/admin/email-suppressions?view=stats&days=${days}`, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as HealthPayload;
        if (!res.ok || !data.ok) throw new Error(data.error || "Could not load email health");
        return data;
      })
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof Error ? err.message : "Could not load email health");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, admin, days]);

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
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This page is only for KidEase staff with profiles.role = admin.</p>
        </main>
      </Shell>
    );
  }

  const campaigns = health?.campaigns ?? [];
  const anyWarn = campaigns.some((row) => row.warn);
  const bounceLine = health?.thresholds?.bouncePct ?? 2;
  const complaintLine = health?.thresholds?.complaintPct ?? 0.08;

  return (
    <TwoFactorGate next="/admin-email-health">
      <DeskShell
        desk="admin"
        active="mail"
        onSelect={() => {
          if (typeof window !== "undefined") window.location.assign("/admin?tab=mail");
        }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Outreach</p>
              <h1 className="mt-1 font-display text-3xl">Email health</h1>
              <p className="mt-2 max-w-xl text-sm text-muted">
                Delivered, hard bounces, and complaints by campaign tag. Soft bounces are logged and are not in the
                bounce rate. Suppressed addresses: {health?.suppressed ?? "—"}.
              </p>
            </div>
            <div className="flex gap-2">
              {([7, 30] as const).map((window) => (
                <button
                  key={window}
                  type="button"
                  className={cn(
                    "inline-flex h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ring-border",
                    days === window ? "bg-primary text-primary-fg" : "bg-surface",
                  )}
                  onClick={() => setDays(window)}
                >
                  {window} days
                </button>
              ))}
            </div>
          </div>

          {anyWarn ? (
            <p className="mt-4 rounded-2xl bg-surface px-5 py-4 text-sm text-danger ring-1 ring-danger">
              Pause the highlighted campaign before the next blast. Bounce rate is at least {bounceLine}% or complaint
              rate is at least {complaintLine}%.
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-2xl bg-surface px-5 py-4 text-sm text-muted ring-1 ring-border">{error}</p>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-2xl bg-surface ring-1 ring-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                <tr>
                  <th className="px-4 py-3 font-semibold">Campaign</th>
                  <th className="px-4 py-3 font-semibold">Delivered</th>
                  <th className="px-4 py-3 font-semibold">Bounced</th>
                  <th className="px-4 py-3 font-semibold">Complained</th>
                  <th className="px-4 py-3 font-semibold">Bounce rate</th>
                  <th className="px-4 py-3 font-semibold">Complaint rate</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-muted" colSpan={6}>
                      Loading…
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted" colSpan={6}>
                      No email events in the last {days} days.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((row) => (
                    <tr key={row.campaign} className={cn("border-t border-border", row.warn && "bg-soft text-danger")}>
                      <td className="px-4 py-3 font-medium">{row.campaign}</td>
                      <td className="px-4 py-3">{row.delivered}</td>
                      <td className="px-4 py-3">{row.bounced}</td>
                      <td className="px-4 py-3">{row.complained}</td>
                      <td className="px-4 py-3">{pct(row.bounceRate)}</td>
                      <td className="px-4 py-3">{pct(row.complaintRate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">
            <Link to="/admin" search={{ tab: "mail" }} className="underline">
              Back to Mail
            </Link>
          </p>
        </div>
      </DeskShell>
    </TwoFactorGate>
  );
}
