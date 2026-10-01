import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AI_FLAGS } from "@/lib/ai/flags";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { listingWriterEventProps, type ListingDraft } from "@/lib/ai/listing-writer";
import { capturePostHogEvent } from "@/lib/posthog";
import { draftListingCopy } from "@/lib/server/listing-writer";
import { useCopy } from "@/lib/use-copy";

function track(event: "listing_writer_used" | "listing_writer_published", daycareId: string) {
  capturePostHogEvent(event, listingWriterEventProps({ daycare_id: daycareId }));
}

export function ListingWriter({
  daycareId,
  website,
  onUse,
}: {
  daycareId: string;
  website?: string | null;
  onUse: (draft: ListingDraft) => void;
}) {
  const { t } = useCopy();
  const on = useAiFeatureFlag(AI_FLAGS.listingWriter);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [notice, setNotice] = useState<"empty" | "failed" | "used" | null>(null);

  if (!on) return null;

  async function write() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await draftListingCopy({ data: { daycareId, notes } });
      track("listing_writer_used", daycareId);
      const next = result.draft;
      setDraft(next);
      const blank = !next.description && !next.programSummary && next.highlights.length === 0;
      setNotice(result.source === "fallback" ? "failed" : blank ? "empty" : null);
    } catch {
      setDraft(null);
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-bg p-3 ring-1 ring-border" data-ke="listing-writer">
      <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
        {t("listingWriterCta")}
      </Button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{t("listingWriterLead")}</p>
          <p className="text-sm">
            <span className="font-medium">{t("listingWriterWebsite")}: </span>
            {website?.trim() ? website.trim() : t("listingWriterNoWebsite")}
          </p>
          <label className="block text-sm">
            {t("listingWriterNotes")}
            <textarea
              className="ke-input mt-1 min-h-24 w-full"
              maxLength={800}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
            />
            <span className="mt-1 block text-muted">{t("listingWriterNotesHint")}</span>
          </label>
          <Button type="button" disabled={busy} onClick={() => void write()}>
            {busy ? t("listingWriterWorking") : t("listingWriterCta")}
          </Button>
          {notice === "empty" ? <p className="text-sm">{t("listingWriterEmpty")}</p> : null}
          {notice === "failed" ? <p className="text-sm" role="alert">{t("listingWriterFailed")}</p> : null}
          {draft && (draft.description || draft.programSummary || draft.highlights.length || draft.unsourced.length) ? (
            <div className="space-y-3" aria-live="polite">
              <p className="text-sm font-medium">{t("listingWriterDraft")}</p>
              <label className="block text-sm">
                {t("listingWriterDescription")}
                <textarea
                  className="ke-input mt-1 min-h-24 w-full"
                  maxLength={600}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                {t("listingWriterProgram")}
                <textarea
                  className="ke-input mt-1 min-h-20 w-full"
                  maxLength={400}
                  value={draft.programSummary}
                  onChange={(event) => setDraft({ ...draft, programSummary: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                {t("listingWriterHighlights")}
                <textarea
                  className="ke-input mt-1 min-h-20 w-full"
                  maxLength={600}
                  value={draft.highlights.join("\n")}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      highlights: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5),
                    })
                  }
                />
              </label>
              {draft.unsourced.length ? (
                <div>
                  <p className="text-sm font-medium">{t("listingWriterUnsourced")}</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {draft.unsourced.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onUse(draft);
                  setNotice("used");
                }}
              >
                {t("listingWriterUse")}
              </Button>
              {notice === "used" ? <p className="text-sm">{t("listingWriterUsed")}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
