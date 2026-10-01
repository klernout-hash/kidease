import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { photoCheckEventProps } from "@/lib/ai/photo-check";
import { capturePostHogEvent } from "@/lib/posthog";
import { listHeldPhotos, resolveHeldPhoto } from "@/lib/server/photo-check";
import { useCopy } from "@/lib/use-copy";

type Held = { id: string; daycareId: string; preview: string; createdAt: string };

export function PhotoCheckReview() {
  const { t } = useCopy();
  const [rows, setRows] = useState<Held[] | null>(null);
  const [notice, setNotice] = useState<"allowed" | "rejected" | "full" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    void listHeldPhotos()
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  async function resolve(row: Held, action: "allow" | "reject") {
    if (busy) return;
    setBusy(row.id);
    setNotice(null);
    try {
      const result = await resolveHeldPhoto({ data: { id: row.id, action } });
      if (!result.ok && result.error === "full") {
        setNotice("full");
        return;
      }
      if (!result.ok) return;
      setRows((list) => (list ?? []).filter((item) => item.id !== row.id));
      setNotice(action === "allow" ? "allowed" : "rejected");
      capturePostHogEvent(action === "allow" ? "photo_check_allowed" : "photo_check_rejected", photoCheckEventProps({ daycare_id: row.daycareId }));
    } catch {
      setNotice(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-10" data-ke="photo-check-review">
      <h2 className="font-display text-2xl">{t("photoCheckReviewTitle")}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">{t("photoCheckReviewLead")}</p>
      {notice === "allowed" ? <p className="mt-3 text-sm" role="status">{t("photoCheckAllowed")}</p> : null}
      {notice === "rejected" ? <p className="mt-3 text-sm" role="status">{t("photoCheckRejected")}</p> : null}
      {notice === "full" ? <p className="mt-3 text-sm" role="alert">{t("photoCheckFull")}</p> : null}
      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("photoCheckReviewEmpty")}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg bg-surface p-3 ring-1 ring-border">
              {row.preview ? (
                <img src={row.preview} alt="" className="aspect-[4/3] w-full max-w-xs rounded-md object-cover" width={320} height={240} />
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" className="min-h-11" disabled={busy === row.id} onClick={() => void resolve(row, "allow")}>
                  {t("photoCheckAllow")}
                </Button>
                <Button type="button" variant="secondary" className="min-h-11" disabled={busy === row.id} onClick={() => void resolve(row, "reject")}>
                  {t("photoCheckReject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
