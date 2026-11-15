import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { centreDocCopy } from "@/lib/centre-documents-copy";
import {
  listAdminCentreDocuments,
  reviewCentreDocument,
  type AdminDocumentCentre,
} from "@/lib/server/centre-documents";
import { useCopy } from "@/lib/use-copy";

type Filter = "all" | "missing" | "expiring" | "pending";

export function AdminCentreDocuments() {
  const { locale } = useCopy();
  const copy = centreDocCopy(locale);
  const [enabled, setEnabled] = useState(false);
  const [centres, setCentres] = useState<AdminDocumentCentre[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const result = await listAdminCentreDocuments();
    setEnabled(result.enabled);
    setCentres(result.centres);
  }

  useEffect(() => {
    void load().catch(() => setEnabled(false));
  }, []);

  const shown = useMemo(() => {
    return centres.filter((centre) => {
      if (filter === "missing") return centre.missing > 0;
      if (filter === "expiring") return centre.expiring > 0 || centre.expired > 0;
      if (filter === "pending") return centre.pending > 0;
      return true;
    });
  }, [centres, filter]);

  if (!enabled) return null;

  async function decide(documentId: string, decision: "approved" | "rejected") {
    setBusy(documentId);
    try {
      await reviewCentreDocument({ data: { documentId, decision, reason: reason[documentId] } });
      toast.success(decision === "approved" ? copy.approved : copy.rejected);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.notSaved);
    } finally {
      setBusy(null);
    }
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: copy.filterAll },
    { id: "missing", label: copy.filterMissing },
    { id: "expiring", label: copy.filterExpiring },
    { id: "pending", label: copy.filterPending },
  ];

  return (
    <section data-ke="admin-centre-documents">
      <h2 className="font-display text-2xl">{copy.title}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">{copy.lead}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={copy.title}>
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium ring-1 ring-border touch-manipulation"
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="mt-6 text-sm text-muted">{copy.empty}</p> : null}
      <ul className="mt-4 space-y-3">
        {shown.map((centre) => (
          <li key={centre.daycareId} className="rounded-xl bg-surface p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{centre.name}</p>
              <p className="text-sm tabular-nums">{copy.score.replace("{n}", String(centre.percent))}</p>
            </div>
            <p className="text-sm text-muted">{[centre.city, centre.province].filter(Boolean).join(", ")}</p>
            <ul className="mt-3 space-y-2">
              {centre.checklist.items
                .filter((item) => item.documentId)
                .map((item) => (
                  <li key={item.id} className="rounded-lg bg-bg p-3 text-sm ring-1 ring-border">
                    <p className="font-medium">{copy.kinds[item.labelKey] || item.labelKey}</p>
                    <p className="text-muted">
                      {item.reviewStatus === "approved" ? copy.approved : item.reviewStatus === "rejected" ? copy.rejected : copy.pending}
                      {item.expiresOn ? ` · ${item.expiresOn}` : ""}
                    </p>
                    <label className="mt-2 block">
                      {copy.reason}
                      <input
                        value={reason[item.documentId || ""] || ""}
                        onChange={(event) =>
                          setReason((current) => ({ ...current, [item.documentId || ""]: event.target.value }))
                        }
                        className="ke-input mt-1"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void decide(item.documentId || "", "approved")}
                      >
                        {copy.approve}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy !== null}
                        onClick={() => void decide(item.documentId || "", "rejected")}
                      >
                        {copy.reject}
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
