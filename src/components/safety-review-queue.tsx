import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFrCaPack } from "@/components/fr-ca-boot";
import { Button } from "@/components/ui/button";
import { frCaScreen } from "@/lib/fr-ca";
import { listSafetyQueue, reviewSafetyReport, type SafetyQueueRow } from "@/lib/server/safety";
import { useCopy } from "@/lib/use-copy";

export function SafetyReviewQueue({ initial }: { initial?: SafetyQueueRow[] }) {
  const { locale } = useCopy();
  const frCa = useFrCaPack();
  const text = (key: string) => frCaScreen("admin", key, locale, frCa);
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

  async function review(id: string, status: "reviewed" | "dismissed") {
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
      <h2 className="font-display text-2xl">{text("safetyTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{text("safetyLead")}</p>
      <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
        {!ready ? <li className="px-5 py-8 text-center text-muted">{text("safetyLoading")}</li> : null}
        {ready && rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-muted">{text("safetyEmpty")}</li>
        ) : null}
        {rows.map((row) => (
          <li key={row.id} className="px-5 py-4">
            <p className="font-medium">
              {row.target} · {row.reason}
            </p>
            <p className="text-sm text-muted">
              {[row.daycareName, row.city, row.province].filter(Boolean).join(", ") || text("noListing")}
            </p>
            {row.detail ? <p className="mt-1 text-sm">{row.detail}</p> : null}
            <p className="mt-1 text-xs text-subtle">{row.reporterEmail || text("noEmail")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyId === row.id}
                onClick={() => void review(row.id, "reviewed")}
              >
                {text("markReviewed")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyId === row.id}
                onClick={() => void review(row.id, "dismissed")}
              >
                {text("dismiss")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
