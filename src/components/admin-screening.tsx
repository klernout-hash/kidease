import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  reviewScreeningDocument,
  type AdminScreeningQueueRow,
} from "@/lib/server/provider-screening";
import { docKindLabel } from "@/lib/provider-screening";
import { openPrivateDocHref, screeningDocHref } from "@/lib/private-docs";
import { useCopy } from "@/lib/use-copy";
import { useReauthPrompt, withReauth } from "@/components/reauth-dialog";
import { looksLikeTestFixture } from "@/lib/listing-visibility";

export function AdminScreeningQueue({
  rows,
  onChanged,
}: {
  rows: AdminScreeningQueueRow[];
  onChanged: () => void;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [showQa, setShowQa] = useState(false);
  const reauth = useReauthPrompt();
  const qaCount = rows.filter((row) => looksLikeTestFixture({ name: row.daycareName, slug: row.slug })).length;
  const visible = showQa ? rows : rows.filter((row) => !looksLikeTestFixture({ name: row.daycareName, slug: row.slug }));

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      await withReauth(
        () =>
          reviewScreeningDocument({
            data: { documentId: id, action, reason: reason[id] },
          }),
        reauth.prompt,
      );
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("screeningReviewed"));
    } finally {
      setBusy(null);
    }
  }

  function openFile(id: string) {
    openPrivateDocHref(screeningDocHref(id));
  }

  return (
    <section>
      <h2 className="font-display text-2xl">{t("screeningQueueTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("screeningQueueLead")}</p>
      <label className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm ring-1 ring-border">
        <input type="checkbox" checked={showQa} onChange={(e) => setShowQa(e.target.checked)} />
        Show QA listings{qaCount ? ` · ${qaCount}` : ""}
      </label>
      <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
        {visible.length === 0 ? (
          <li className="px-5 py-8 text-center text-muted">{t("screeningQueueEmpty")}</li>
        ) : (
          visible.map((row) => (
            <li key={row.id} className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.daycareName}</p>
                  <p className="text-sm text-muted">
                    {[row.city, row.province].filter(Boolean).join(", ")} · {row.personName} ·{" "}
                    {docKindLabel(row.kind, loc)}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    {row.filename || "—"}
                    {row.issuedOn ? ` · ${row.issuedOn}` : ""}
                    {row.expiresOn ? ` → ${row.expiresOn}` : ""}
                  </p>
                </div>
                <Link
                  to="/daycare/$slug"
                  params={{ slug: row.slug }}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {row.slug}
                </Link>
              </div>
              <input
                value={reason[row.id] || ""}
                onChange={(e) => setReason((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder={t("screeningRejectReason")}
                className="h-11 w-full rounded-full bg-bg px-4 text-sm ring-1 ring-border"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => openFile(row.id)}>
                  {t("screeningViewFile")}
                </Button>
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decide(row.id, "approve")}>
                  {t("screeningApprove")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void decide(row.id, "reject")}
                >
                  {t("screeningReject")}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
      {reauth.dialog}
    </section>
  );
}
