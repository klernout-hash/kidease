import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { respondTourRequest } from "@/lib/server/tours";
import { formatPreferredTimes } from "@/lib/threads";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { TourRequest, TourStatus } from "@/lib/types";

export function TourStatusPill({ status }: { status: TourStatus }) {
  const { t } = useCopy();
  const label = status === "pending" ? t("tourPending") : status === "accepted" ? t("tourAccepted") : t("tourDeclined");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        status === "pending"
          ? "bg-primary/10 text-primary ring-primary/20"
          : status === "accepted"
            ? "bg-ok/10 text-ok ring-ok/20"
            : "bg-danger/10 text-danger ring-danger/20",
      )}
    >
      {label}
    </span>
  );
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
  const [busy, setBusy] = useState<"accepted" | "declined" | null>(null);

  async function respond(status: "accepted" | "declined") {
    setBusy(status);
    try {
      await respondTourRequest({ data: { tourId: tour.id, status, note: note.trim() || undefined } });
      toast.success(status === "accepted" ? t("tourAccepted") : t("tourDeclined"));
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
      {canRespond && tour.status === "pending" ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={2}
            placeholder={t("tourRespondNote")}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => void respond("accepted")}>
              {busy === "accepted" ? t("loading") : t("acceptTour")}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void respond("declined")}>
              {busy === "declined" ? t("loading") : t("declineTour")}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/inbox/$id" params={{ id: tour.conversationId }}>
                {t("openChat")}
              </Link>
            </Button>
          </div>
        </div>
      ) : tour.conversationId ? (
        <div className="mt-3">
          <Button size="sm" variant="secondary" asChild>
            <Link to="/inbox/$id" params={{ id: tour.conversationId }}>
              {t("openChat")}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
