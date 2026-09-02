import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listPlatformEvents } from "@/lib/server/notify";
import { decideCentre, listAdminCentres, type AdminCentreRow, type Decision } from "@/lib/server/admin-centres";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [tab, setTab] = useState<"centres" | "activity">("centres");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPlatformEvents>>>([]);
  const [centres, setCentres] = useState<AdminCentreRow[]>([]);
  const [filter, setFilter] = useState<"all" | "waiting" | "approved" | "declined">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function refresh() {
    const [events, list] = await Promise.all([
      listPlatformEvents().catch(() => []),
      listAdminCentres().catch(() => []),
    ]);
    setRows(events);
    setCentres(list);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  const admin = (user.primaryEmail || "").trim().toLowerCase() === "kyle@kidease.ca";
  if (!admin) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This page is only for the KidEase operator.</p>
        </main>
      </Shell>
    );
  }

  const visible = useMemo(() => {
    if (filter === "all") return centres;
    return centres.filter((c) => c.claimStatus === filter);
  }, [centres, filter]);

  const counts = useMemo(() => {
    const waiting = centres.filter((c) => c.claimStatus === "waiting" || c.claimStatus === "pending").length;
    const approved = centres.filter((c) => c.claimStatus === "approved").length;
    const declined = centres.filter((c) => c.claimStatus === "declined").length;
    return { waiting, approved, declined, all: centres.length };
  }, [centres]);

  async function onDecide(daycareId: string, decision: Decision) {
    setBusy(`${daycareId}:${decision}`);
    try {
      await decideCentre({ data: { daycareId, decision, note } });
      setNote("");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save that decision");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Admin</p>
        <h1 className="mt-2 font-display text-4xl">Operator portal</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Master list of daycares that signed up or claimed a listing. Approve to go live, decline to keep them off
          search, or hold them in waiting. Each decision emails the daycare.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="sm" variant={tab === "centres" ? "primary" : "secondary"} onClick={() => setTab("centres")}>
            Daycares
          </Button>
          <Button size="sm" variant={tab === "activity" ? "primary" : "secondary"} onClick={() => setTab("activity")}>
            Activity
          </Button>
        </div>

        {tab === "centres" ? (
          <section className="mt-8">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", `All (${counts.all})`],
                  ["waiting", `Waiting (${counts.waiting})`],
                  ["approved", `Live (${counts.approved})`],
                  ["declined", `Declined (${counts.declined})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={
                    filter === key
                      ? "rounded-full bg-primary px-3 py-1.5 text-sm text-primary-fg"
                      : "rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm text-muted">
              Optional note on the next decision
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-md bg-surface px-3 py-2 text-fg ring-1 ring-border"
                placeholder="Shown only in your activity log"
              />
            </label>
            <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
              {visible.length === 0 ? (
                <li className="p-8 text-center text-muted">No daycares in this list yet.</li>
              ) : (
                visible.map((c) => (
                  <li key={c.daycareId} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted">
                          {[c.address, c.city, c.province].filter(Boolean).join(", ")}
                        </p>
                        <p className="mt-1 text-sm">
                          {c.providerName || "—"} · {c.providerEmail || c.contactEmail || "no email"}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-subtle">
                          {c.live ? "Live" : c.claimStatus} · {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Link
                          to="/daycare/$slug"
                          params={{ slug: c.slug }}
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          View listing
                        </Link>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant={c.claimStatus === "approved" ? "primary" : "secondary"}
                            disabled={busy !== null}
                            onClick={() => void onDecide(c.daycareId, "approve")}
                          >
                            {busy === `${c.daycareId}:approve` ? "…" : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant={c.claimStatus === "waiting" || c.claimStatus === "pending" ? "primary" : "secondary"}
                            disabled={busy !== null}
                            onClick={() => void onDecide(c.daycareId, "waiting")}
                          >
                            {busy === `${c.daycareId}:waiting` ? "…" : "Waiting"}
                          </Button>
                          <Button
                            size="sm"
                            variant={c.claimStatus === "declined" ? "danger" : "secondary"}
                            disabled={busy !== null}
                            onClick={() => void onDecide(c.daycareId, "decline")}
                          >
                            {busy === `${c.daycareId}:decline` ? "…" : "Decline"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : (
          <section className="mt-8">
            <p className="text-muted">
              Accounts, claims, spot requests, payments, and messages. Instant alerts and a morning digest go to
              kyle@kidease.ca.
            </p>
            <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
              {rows.length === 0 ? (
                <li className="p-8 text-center text-muted">No activity yet.</li>
              ) : (
                rows.map((r) => (
                  <li key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-subtle">{r.kind}</p>
                        <p className="font-medium">{r.daycare_name || (r.kind === "account" ? "New account" : "Activity")}</p>
                        <p className="text-sm text-muted">{[r.address, r.city, r.province].filter(Boolean).join(", ") || "—"}</p>
                        <p className="mt-1 text-sm">
                          {r.provider_name || "—"} · {r.provider_email || "no email"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <p>{new Date(r.created_at).toLocaleString()}</p>
                        <p className="mt-1">email {r.email_status}</p>
                        {r.slug ? (
                          <Link to="/daycare/$slug" params={{ slug: r.slug }} className="text-primary underline-offset-4 hover:underline">
                            View listing
                          </Link>
                        ) : (
                          <Link to="/provider" className="text-primary underline-offset-4 hover:underline">
                            Dashboard
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}
      </main>
    </Shell>
  );
}
