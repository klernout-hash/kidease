import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { advanceTourRequest, respondTourRequest } from "@/lib/server/tours";
import { formatPreferredTimes } from "@/lib/threads";
import { PipelineBadge } from "@/components/pipeline-badge";
import { useCopy } from "@/lib/use-copy";
import type { TourRequest, TourStatus } from "@/lib/types";

export function TourStatusPill({ status }: { status: TourStatus }) {
  return <PipelineBadge tourStatus={status} />;
}

export function TourCard({
  tour,
  canRespond,
  onChanged,
}: {
  tour: TourRequest;
  canRespond?: boolean;
  onChanged?: () => void;
}) {
  const { t, locale } = useCopy();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function respond(status: "accepted" | "declined") {
    setBusy(status);
    try {
      await respondTourRequest({ data: { tourId: tour.id, status, note: note.trim() || undefined } });
      toast.success(status === "accepted" ? t("pipelineConfirmed") : t("pipelineLost"));
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function advance(status: "completed" | "enrolled" | "lost") {
    setBusy(status);
    try {
      await advanceTourRequest({ data: { tourId: tour.id, status, note: note.trim() || undefined } });
      toast.success(
        status === "completed" ? t("pipelineCompleted") : status === "enrolled" ? t("pipelineEnrolled") : t("pipelineLost"),
      );
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("tourRequest")}</p>
          <p className="mt-1 font-medium">
            {tour.parentName ? `${tour.parentName}` : t("parentLabel")}
            {tour.childName ? ` · ${tour.childName}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            {tour.daycareName} · {formatPreferredTimes(tour.preferredTimes, locale)}
          </p>
        </div>
        <TourStatusPill status={tour.status} />
      </div>
      {tour.parentNote ? <p className="mt-2 text-sm text-muted">{tour.parentNote}</p> : null}
      {tour.centreNote ? (
        <p className="mt-2 text-sm text-muted">
          {t("tourCentreNote")}: {tour.centreNote}
        </p>
      ) : null}
      {canRespond && (tour.status === "pending" || tour.status === "accepted" || tour.status === "completed") ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={2}
            placeholder={t("tourRespondNote")}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {tour.status === "pending" ? (
              <>
                <Button size="sm" disabled={busy !== null} onClick={() => void respond("accepted")}>
                  {busy === "accepted" ? t("loading") : t("confirmTour")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void respond("declined")}>
                  {busy === "declined" ? t("loading") : t("markTourLost")}
                </Button>
              </>
            ) : null}
            {tour.status === "accepted" ? (
              <>
                <Button size="sm" disabled={busy !== null} onClick={() => void advance("completed")}>
                  {busy === "completed" ? t("loading") : t("markTourCompleted")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void advance("lost")}>
                  {busy === "lost" ? t("loading") : t("markTourLost")}
                </Button>
              </>
            ) : null}
            {tour.status === "completed" ? (
              <>
                <Button size="sm" disabled={busy !== null} onClick={() => void advance("enrolled")}>
                  {busy === "enrolled" ? t("loading") : t("markTourEnrolled")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void advance("lost")}>
                  {busy === "lost" ? t("loading") : t("markTourLost")}
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" asChild>
              <Link to="/inbox/$id" params={{ id: tour.conversationId }}>
                {t("openChat")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!canRespond && tour.status === "accepted" ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void advance("completed")}>
              {busy === "completed" ? t("loading") : t("markTourCompleted")}
            </Button>
          ) : null}
          {tour.conversationId ? (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/inbox/$id" params={{ id: tour.conversationId }}>
                {t("openChat")}
              </Link>
            </Button>
          ) : null}
          {tour.status === "accepted" && !canRespond ? (
            <Button size="sm" asChild>
              <Link to="/book/$slug" params={{ slug: tour.daycareSlug }}>
                {t("book")}
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
