import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listQcHomeRequests, reviewQcHomeRequest, type QcHomeAdminRequest } from "@/lib/server/qc-home-daycares";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-qc-home")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listQcHomeRequests(),
  head: () => ({
    meta: [
      { title: "Quebec home daycare requests · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminQcHomePage,
});

function AdminQcHomePage() {
  const initial = Route.useLoaderData();
  const [rows, setRows] = useState<QcHomeAdminRequest[]>(initial);
  const [error, setError] = useState<string | null>(null);

  async function mark(id: string) {
    setError(null);
    try {
      await reviewQcHomeRequest({ data: { id } });
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: "reviewed" } : row)));
    } catch {
      setError("Could not update that request.");
    }
  }

  return (
    <Shell>
      <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8">
        <h1 className="font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">Quebec home daycare requests</h1>
        <p className="mt-3 max-w-prose text-base leading-6">
          Correction and removal requests for recognized home daycares. KidEase does not email or text these providers.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <div className="mt-8">
            <p className="text-sm leading-6">No requests yet.</p>
            <div className="mt-4">
              <Button asChild>
                <Link to="/admin">Back to admin</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {rows.map((row) => (
              <li key={row.id} className="space-y-2 p-4 text-sm leading-6">
                <p className="font-medium">
                  {row.kind === "removal" ? "Removal" : "Correction"} · {row.status}
                </p>
                <p>
                  Source file: {row.sourceName}
                  {row.personalName ? " (hidden on the public page)" : ""}
                  {row.municipality ? ` · ${row.municipality}` : ""}
                </p>
                <p>{row.message}</p>
                <p className="text-muted">
                  {row.contactName} · {row.contactEmail}
                </p>
                {row.status === "pending" ? (
                  <Button type="button" variant="secondary" onClick={() => void mark(row.id)}>
                    Mark reviewed
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}
