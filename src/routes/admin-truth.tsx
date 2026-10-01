import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { approveTruthChange, listTruthQueue } from "@/lib/server/admin-tools";
import { AdminToolFrame } from "@/components/admin-tool-frame";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin-truth")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listTruthQueue(),
  head: () => ({
    meta: [
      { title: "Listing changes · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TruthPage,
});

function TruthPage() {
  const initial = Route.useLoaderData();
  const { t } = useCopy();
  const [rows, setRows] = useState(initial.rows);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await approveTruthChange({ data: id });
      if (!result.ok) {
        setError(t("adminTruthApproveFailed"));
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
      setConfirmId(null);
    } catch {
      setError(t("adminTruthApproveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminToolFrame title={t("adminTruthTitle")} lead={t("adminTruthLead")} on={initial.on}>
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length ? (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border">
              <p className="font-medium">{row.name}</p>
              <p className="mt-1 text-sm text-muted">
                {row.field}: {row.current || "—"} → {row.proposed}
              </p>
              {confirmId === row.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                    disabled={busy}
                    onClick={() => void approve(row.id)}
                  >
                    {t("adminTruthApprove")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium ring-1 ring-border touch-manipulation"
                    disabled={busy}
                    onClick={() => setConfirmId(null)}
                  >
                    {t("adminToolCancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                  onClick={() => setConfirmId(row.id)}
                >
                  {t("adminTruthReview")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">{t("adminTruthEmpty")}</p>
      )}
    </AdminToolFrame>
  );
}
