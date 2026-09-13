import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { INBOX_STAGE_COPY, inboxInitials, type CentreInboxThread } from "@/lib/inbox-stages";
import { saveInboxStaffNote } from "@/lib/server/inbox";
import { proposeTourTime, respondTourRequest } from "@/lib/server/tours";
import { listCentreTourWindows } from "@/lib/server/tour-calendar";
import { formatSlaCountdown, tourSlaRemainingMs } from "@/lib/today-sla";
import { canProposeTourTime, declineReasonValid } from "@/lib/tour-hold";
import { formatTourSlotRange, type PublicTourSlot } from "@/lib/tour-calendar";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import type { LeadRequest } from "@/lib/lead-requests";
import type { TourRequest } from "@/lib/types";

const HOLD_COPY = {
  open: "inboxTourOpen",
  soft_hold: "inboxSoftHold",
  confirmed: "inboxConfirmedDot",
  blocked: "inboxTourBlocked",
} as const;

export function InboxDetailRail({
  thread,
  tour,
  leads,
  centreName,
  canWrite,
  onChanged,
}: {
  thread: CentreInboxThread;
  tour: TourRequest | null;
  leads: LeadRequest[];
  centreName: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [note, setNote] = useState("");
  const [staffNote, setStaffNote] = useState(thread.staffNote || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [windowId, setWindowId] = useState("");
  const [slots, setSlots] = useState<PublicTourSlot[]>([]);
  const [proposeOpen, setProposeOpen] = useState(false);
  const remainingMs =
    tour?.status === "pending"
      ? tourSlaRemainingMs(tour.createdAt, Date.now(), tour.holdExpiresAt)
      : thread.slaRemainingMs;
  const sla = formatSlaCountdown(remainingMs);
  const infoLeads = leads.filter((row) => row.kind === "info" && row.conversationId === thread.id);
  const showPropose = Boolean(canWrite && tour && canProposeTourTime(tour.status));

  useEffect(() => {
    if (!showPropose || !tour) return;
    let live = true;
    void listCentreTourWindows({ data: { daycareId: tour.daycareId } })
      .then((res) => {
        if (!live) return;
        setSlots(res.slots.filter((slot) => slot.id !== tour.windowId && slot.remaining > 0 && slot.inventory !== "blocked"));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [showPropose, tour?.daycareId, tour?.windowId, tour]);

  async function accept() {
    if (!tour) return;
    setBusy("accept");
    try {
      await respondTourRequest({ data: { tourId: tour.id, status: "accepted", note: note.trim() || undefined } });
      toast.success(t("inboxTourConfirmedBanner"));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    if (!tour) return;
    if (!declineReasonValid(note)) {
      toast.error(t("tourDeclineNeedReason"));
      return;
    }
    setBusy("decline");
    try {
      await respondTourRequest({ data: { tourId: tour.id, status: "declined", note: note.trim() } });
      toast.success(t("pipelineLost"));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function propose() {
    if (!tour) return;
    if (!windowId) {
      toast.error(t("tourProposeNeedSlot"));
      return;
    }
    setBusy("propose");
    try {
      await proposeTourTime({ data: { tourId: tour.id, windowId, note: note.trim() || undefined } });
      toast.success(t("todayProposeTime"));
      setProposeOpen(false);
      setWindowId("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function saveNote() {
    setBusy("note");
    try {
      await saveInboxStaffNote({ data: { conversationId: thread.id, note: staffNote } });
      toast.success(t("inboxStaffNoteSaved"));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  const slaLabel = thread.stage === "tour_requested"
    ? sla.overdue
      ? t("todaySlaOverdue")
      : sla.hours >= 1
        ? t("todaySlaHours").replace("{n}", String(sla.hours))
        : t("todaySlaMinutes").replace("{n}", String(Math.max(1, sla.minutes)))
    : null;

  return (
    <aside data-ke="inbox-detail" className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {inboxInitials(thread.parentName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{thread.parentName}</p>
          <p className="text-xs text-muted">{t(INBOX_STAGE_COPY[thread.stage] as CopyKey)}</p>
        </div>
      </div>

      {slaLabel ? <p className={sla.overdue ? "text-sm text-danger" : "text-sm text-muted"}>{slaLabel}</p> : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("inboxAgeProgram")}</p>
        <p className="mt-1 text-sm">
          {[thread.childAgeLabel, thread.programLabel].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{centreName}</p>
        <Link to="/daycare/$slug" params={{ slug: thread.daycareSlug }} className="mt-1 inline-block text-sm text-primary hover:underline">
          {t("inboxListingLink")}
        </Link>
      </div>

      <div className="rounded-xl bg-surface p-3 ring-1 ring-border">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("tourRequest")}</p>
        <p className="mt-1 text-sm font-medium">
          {thread.tourHold ? t(HOLD_COPY[thread.tourHold] as CopyKey) : t("inboxTourOpen")}
        </p>
        {thread.tourDatetime ? <p className="mt-1 text-sm text-muted">{thread.tourDatetime}</p> : null}
        {canWrite && tour && (tour.status === "pending" || showPropose) ? (
          <div className="mt-3 space-y-2">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tour.status === "pending" ? t("inboxDeclineReason") : t("tourRespondNote")}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {tour.status === "pending" ? (
                <Button size="sm" disabled={busy !== null} onClick={() => void accept()}>
                  {busy === "accept" ? t("loading") : t("inboxAcceptTour")}
                </Button>
              ) : null}
              {showPropose ? (
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setProposeOpen((v) => !v)}>
                  {t("todayProposeTime")}
                </Button>
              ) : null}
              {tour.status === "pending" ? (
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decline()}>
                  {busy === "decline" ? t("loading") : t("inboxDeclineTour")}
                </Button>
              ) : null}
            </div>
            {proposeOpen ? (
              <div className="space-y-2 rounded-lg bg-bg p-2 ring-1 ring-border">
                {slots.length === 0 ? (
                  <p className="text-sm text-muted">{t("tourTimesNoneOpen")}</p>
                ) : (
                  <label className="block text-xs">
                    {t("todayProposeTime")}
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-2 text-sm"
                      value={windowId}
                      onChange={(e) => setWindowId(e.target.value)}
                    >
                      <option value="">{t("tourTimesPickSlot")}</option>
                      {slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {formatTourSlotRange(slot, loc)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Button size="sm" disabled={busy !== null || !windowId} onClick={() => void propose()}>
                  {busy === "propose" ? t("loading") : t("inboxProposeSend")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link to="/provider" search={{ desk: "tours" }}>
              {t("inboxShowTour")}
            </Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/provider" search={{ desk: "tours" }}>
              {t("inboxTourCalendar")}
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("inboxStaffOnly")}</p>
        <label className="mt-1 block text-sm">
          {t("inboxStaffNote")}
          <textarea
            rows={3}
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            placeholder={t("inboxStaffNotePh")}
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </label>
        {canWrite ? (
          <Button size="sm" variant="secondary" className="mt-2" disabled={busy !== null} onClick={() => void saveNote()}>
            {busy === "note" ? t("loading") : t("inboxStaffNoteSave")}
          </Button>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("inboxRequestInfo")}</p>
        {infoLeads.length ? (
          <ul className="mt-1 space-y-1 text-sm text-muted">
            {infoLeads.map((lead) => (
              <li key={lead.id}>{lead.message || t("inboxRequestInfo")}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">{t("inboxRequestInfoEmpty")}</p>
        )}
      </div>

      {thread.subsidyNote || thread.scheduleNote ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{t("inboxSubsidyNote")}</p>
          <p className="mt-1 text-sm text-muted">{[thread.subsidyNote, thread.scheduleNote].filter(Boolean).join(" · ")}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-border">
          {thread.listingVerified ? t("inboxVerifiedFlag") : t("inboxNotVerifiedFlag")}
        </span>
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-border">
          {thread.screeningOnFile ? t("inboxScreeningFlag") : t("inboxScreeningMissing")}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/provider" search={{ desk: "licence" }}>
            {t("todayActionLicence")}
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/provider" search={{ desk: "screening" }}>
            {t("todayActionScreening")}
          </Link>
        </Button>
      </div>
    </aside>
  );
}
