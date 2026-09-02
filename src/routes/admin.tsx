import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listPlatformEvents } from "@/lib/server/notify";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPlatformEvents>>>([]);

  useEffect(() => {
    if (!user) return;
    void listPlatformEvents().then(setRows).catch(() => setRows([]));
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

  return (
    <Shell>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Admin</p>
        <h1 className="mt-2 font-display text-4xl">Platform activity</h1>
        <p className="mt-2 text-muted">
          Accounts, claims, spot requests, payments, and messages. Instant alerts and a morning digest go to kyle@kidease.ca.
        </p>
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
          {rows.length === 0 ? (
            <li className="p-8 text-center text-muted">No activity yet.</li>
          ) : (
            rows.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-subtle">{r.kind}</p>
                    <p className="font-medium">{r.daycare_name || (r.kind === "account" ? "New account" : "Activity")}</p>
                    <p className="text-sm text-muted">
                      {[r.address, r.city, r.province].filter(Boolean).join(", ") || "—"}
                    </p>
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
      </main>
    </Shell>
  );
}
