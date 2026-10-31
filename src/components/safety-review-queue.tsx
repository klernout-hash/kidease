import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moderationActionLabel, moderationActions, moderationLabel } from "@/lib/safety";
import { listSafetyQueue, reviewSafetyReport, type SafetyQueueRow } from "@/lib/server/safety";
import { useCopy } from "@/lib/use-copy";

export function SafetyReviewQueue({ initial }: { initial?: SafetyQueueRow[] }) {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const [rows, setRows] = useState<SafetyQueueRow[]>(initial ?? []);
  const [ready, setReady] = useState(Boolean(initial));
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancel = false;
    void listSafetyQueue()
      .then((next) => {
        if (!cancel) setRows(next);
      })
      .catch(() => {
        if (!cancel) setRows([]);
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [initial]);

  async function review(id: string, status: string) {
    setBusyId(id);
    try {
      await reviewSafetyReport({ data: { id, status } });
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the report");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-10" data-ke="safety-queue">
      <h2 className="font-display text-2xl">Safety reports</h2>
      <p className="mt-1 text-sm text-muted">
        Open reports about a listing, a centre, a message, or a review. A review uses review actions. This queue does not
        invent a safety score.
      </p>
      <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
        {!ready ? <li className="px-5 py-8 text-center text-muted">Loading reports…</li> : null}
        {ready && rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-muted">No open safety reports. New reports show up here.</li>
        ) : null}
        {rows.map((row) => (
          <li key={row.id} className="px-5 py-4">
            <p className="font-medium">
              {moderationLabel(row.target, lang)} · {row.reason}
            </p>
            <p className="text-sm text-muted">
              {[row.daycareName, row.city, row.province].filter(Boolean).join(", ") || "No listing name on file"}
            </p>
            {row.detail ? <p className="mt-1 text-sm">{row.detail}</p> : null}
            <p className="mt-1 text-xs text-subtle">{row.reporterEmail || "No email on the account"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {moderationActions(row.target).map((action, index) => (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant={index === 0 ? "primary" : "secondary"}
                  disabled={busyId === row.id}
                  onClick={() => void review(row.id, action)}
                >
                  {moderationActionLabel(action, lang)}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
