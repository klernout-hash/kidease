import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { reviewReportCopy, REVIEW_REPORT_REASONS } from "@/lib/review-reports";
import { reportListingReview } from "@/lib/server/review-reports";
import { useCopy } from "@/lib/use-copy";

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const copy = reviewReportCopy(lang);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REVIEW_REPORT_REASONS)[number]>("spam");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    setMessage("");
    try {
      const result = await reportListingReview({ data: { reviewId, reason, note } });
      setMessage(result.ok ? copy.sent : copy.off);
      if (result.ok) setOpen(false);
    } catch {
      setMessage(copy.off);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2" data-ke="review-report">
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {copy.report}
      </button>
      {open ? (
        <form
          className="mt-2 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="block text-sm">
            {copy.reason}
            <select
              className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof REVIEW_REPORT_REASONS)[number])}
            >
              {REVIEW_REPORT_REASONS.map((key) => (
                <option key={key} value={key}>
                  {copy[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.note}
            <input
              className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {copy.send}
            </Button>
            <Link
              to={localePath("/help", locale)}
              className="inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.help}
            </Link>
          </div>
        </form>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
