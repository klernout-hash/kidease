import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { centreDocCopy } from "@/lib/centre-documents-copy";
import type { ChecklistItem, ChecklistScore } from "@/lib/centre-documents";
import { deleteCentreDocument, listCentreDocumentChecklist, saveCentreDocument } from "@/lib/server/centre-documents";
import { useCentreWrite } from "@/lib/use-centre-write";
import { useCopy } from "@/lib/use-copy";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That file was not saved."));
    reader.readAsDataURL(file);
  });
}

function fileAllowed(file: File): "ok" | "type" | "size" {
  const named = /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
  const typed = !file.type || ALLOWED.has(file.type);
  if (!named || !typed) return "type";
  if (file.size > MAX_BYTES) return "size";
  return "ok";
}

export function CentreDocumentChecklist({ daycareId }: { daycareId: string }) {
  const { locale } = useCopy();
  const canUpload = useCentreWrite("document_upload");
  const copy = centreDocCopy(locale);
  const [checklist, setChecklist] = useState<ChecklistScore | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expiry, setExpiry] = useState("");

  async function load() {
    const result = await listCentreDocumentChecklist({ data: daycareId });
    setEnabled(result.enabled);
    setChecklist(result.checklist);
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch(() => {
      setEnabled(false);
      setLoaded(true);
    });
  }, [daycareId]);

  if (!loaded) {
    return (
      <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="centre-documents">
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
      </section>
    );
  }

  if (!enabled || !checklist) {
    return (
      <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="centre-documents">
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted">{copy.lead}</p>
        <p className="mt-3 text-sm font-medium text-muted" data-ke="centre-documents-waiting">
          {locale === "fr" ? "Pas encore en place" : "Not set up yet"}
        </p>
      </section>
    );
  }

  async function onFile(item: ChecklistItem, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || item.kind === "licence" || item.kind === "screening") return;
    const allowed = fileAllowed(file);
    if (allowed === "type") {
      toast.error(copy.typesOnly);
      return;
    }
    if (allowed === "size") {
      toast.error(copy.tooBig);
      return;
    }
    setBusy(item.id);
    try {
      const dataUrl = await readFile(file);
      const saved = await saveCentreDocument({
        data: {
          daycareId,
          kind: item.kind,
          policyKey: item.policyKey,
          dataUrl,
          mime: file.type,
          filename: file.name,
          expiresOn: item.kind === "insurance" ? expiry : null,
        },
      });
      if (!saved?.ok || !saved.id) {
        toast.error(copy.notSaved);
        return;
      }
      toast.success(copy.saved);
      if (saved.checklist) setChecklist(saved.checklist);
      else await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.notSaved);
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: ChecklistItem) {
    if (!item.documentId) return;
    setBusy(item.id);
    try {
      const removed = await deleteCentreDocument({ data: { daycareId, documentId: item.documentId } });
      toast.success(copy.removed);
      if (removed.checklist) setChecklist(removed.checklist);
      else await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.notSaved);
    } finally {
      setBusy(null);
    }
  }

  function freshnessLabel(item: ChecklistItem) {
    if (item.freshness === "missing") return copy.missing;
    if (item.freshness === "expiring") return copy.expiring;
    if (item.freshness === "expired") return copy.expired;
    return copy.uploaded;
  }

  return (
    <section className="rounded-xl bg-surface p-4 pb-24 shadow-card ring-1 ring-border" data-ke="centre-documents">
      <h2 className="ke-section-anchor font-display text-2xl">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted">{copy.lead}</p>
      <p className="mt-2 text-sm text-muted" data-ke="centre-documents-types">{copy.accepted}</p>
      <p className="mt-3 font-medium" data-ke="centre-documents-score">
        {copy.score.replace("{n}", String(checklist.percent))}
      </p>
      <p className="mt-1 text-sm text-muted" data-ke="centre-documents-score-why">{copy.scoreWhy}</p>
      {canUpload ? null : (
        <p className="mt-2 text-sm text-muted" data-ke="centre-documents-view-only">{copy.viewOnly}</p>
      )}
      <ul className="mt-4 space-y-3">
        {checklist.items.map((item) => (
          <li key={item.id} className="rounded-lg bg-bg p-3 ring-1 ring-border" data-ke="centre-document-row">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{copy.kinds[item.labelKey] || item.labelKey}</p>
              <p className="text-sm text-muted">{freshnessLabel(item)}</p>
            </div>
            {item.reviewStatus ? (
              <p className="mt-1 text-sm text-muted">
                {item.reviewStatus === "approved" ? copy.approved : item.reviewStatus === "rejected" ? copy.rejected : copy.pending}
                {item.reviewReason ? ` · ${item.reviewReason}` : ""}
              </p>
            ) : null}
            {item.kind === "licence" ? <p className="mt-1 text-sm text-muted">{copy.licenceHint}</p> : null}
            {item.kind === "screening" ? (
              <p className="mt-1 text-sm text-muted">
                {copy.screeningHint}{" "}
                <Link to="/provider" search={{ desk: "screening" }} className="text-primary underline-offset-4 hover:underline">
                  {copy.kinds.screening}
                </Link>
              </p>
            ) : null}
            {item.kind === "handbook" ? <p className="mt-1 text-sm text-muted">{copy.handbookNote}</p> : null}
            {canUpload && item.kind === "insurance" ? (
              <label className="mt-2 block text-sm">
                {copy.expiry}
                <input
                  type="date"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  className="ke-input mt-1"
                />
              </label>
            ) : null}
            {canUpload && item.kind !== "licence" && item.kind !== "screening" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <label
                  htmlFor={`centre-doc-${item.id}`}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                >
                  {item.documentId ? copy.replace : copy.upload}
                </label>
                <input
                  id={`centre-doc-${item.id}`}
                  data-ke="centre-document-file"
                  data-kind={item.kind}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="ke-file-input"
                  disabled={busy !== null}
                  onChange={(event) => void onFile(item, event)}
                />
                {item.documentId ? (
                  <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => void remove(item)}>
                    {copy.remove}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
