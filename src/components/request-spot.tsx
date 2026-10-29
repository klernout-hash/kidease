import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequestSentDialog } from "@/components/request-sent-dialog";
import { useLiveSubmit } from "@/components/use-live-submit";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { createSpotRequest } from "@/lib/server/family";
import { spotAgePublicLabel, type SpotAge } from "@/lib/spot-offers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { noteHappyMoment } from "@/lib/store-review";
import type { Daycare, Schedule } from "@/lib/types";
import { holdSendBeat, requestSentThumb } from "@/lib/request-sent";
import { captureLeadSubmitted } from "@/lib/marketplace-funnel";
import { capturePostHogEvent } from "@/lib/posthog";
import { captureRankingEvent } from "@/lib/ranking/events";
import { rankingContextFor } from "@/lib/ranking/context";

const DAYS = [
  ["Mon", "dayMon"],
  ["Tue", "dayTue"],
  ["Wed", "dayWed"],
  ["Thu", "dayThu"],
  ["Fri", "dayFri"],
] as const;

type Props = {
  daycare: Daycare;
  open: boolean;
  onClose: () => void;
  intent?: "spot" | "tour";
};

export function RequestSpotSheet({ daycare, open, onClose, intent = "spot" }: Props) {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const titleId = useId();
  const [ageGroup, setAgeGroup] = useState<SpotAge>("toddler");
  const [startDate, setStartDate] = useState(defaultStart);
  const [schedule, setSchedule] = useState<Schedule>("full");
  const [days, setDays] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ conversationId: string } | null>(null);
  const opened = useRef(false);
  const send = useLiveSubmit(open);

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    const justOpened = !opened.current;
    opened.current = true;
    if (justOpened) setDone(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const name = locale === "fr" ? daycare.nameFr : daycare.name;

  if (done) {
    return (
      <RequestSentDialog
        kind={intent === "tour" ? "tour" : "spot"}
        listingName={name}
        city={daycare.city}
        photo={requestSentThumb(daycare.photos)}
        conversationId={done.conversationId}
        canOpenMessages
        onClose={() => {
          setDone(null);
          onClose();
        }}
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      void navigate({ to: "/login", search: parentLoginSearch(`/daycare/${daycare.slug}`) });
      return;
    }
    if (!startDate) return;
    if (schedule === "custom" && days.length === 0) return;
    const token = send.start();
    setBusy(true);
    try {
      const res = await createSpotRequest({
        data: {
          daycareId: daycare.id,
          ageGroup,
          childName: spotAgePublicLabel(ageGroup, locale === "fr" ? "fr" : "en"),
          startDate,
          schedule,
          days,
          message:
            intent === "tour"
              ? `${t("bookTour")}: ${message.trim() || t("tourDefaultNote")}`
              : message.trim(),
          parentName: user.displayName ?? undefined,
          locale,
        },
      });
      capturePostHogEvent("listing_request_submitted", { intent });
      captureLeadSubmitted({
        daycareSlug: daycare.slug,
        requestType: intent === "tour" ? "tour" : "availability",
        role: "parent",
      });
      if (intent === "spot") {
        const ctx = rankingContextFor(daycare.id);
        captureRankingEvent("spot_requested", {
          listing_id: daycare.id,
          position: ctx.position,
          sort: ctx.sort,
          variant: ctx.variant,
        });
      }
      noteHappyMoment("booking");
      await holdSendBeat();
      if (!send.live(token)) return;
      setDone({ conversationId: res.conversationId });
    } catch {
      if (!send.live(token)) return;
      toast.error(t("needSignIn"));
      void navigate({ to: "/login", search: parentLoginSearch(`/daycare/${daycare.slug}`) });
    } finally {
      if (send.live(token)) setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-fg/40"
        aria-label={t("cancel")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border md:rounded-xl"
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-xl">
                {t(intent === "tour" ? "bookTour" : "requestSpotTitle")}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              aria-label={t("cancel")}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <p className="text-sm text-muted">
              {t(intent === "tour" ? "tourLead" : "requestSpotLead")}
            </p>
            <Field label={locale === "fr" ? "Tranche d’âge" : "Age range"}>
              <select
                className="h-11 w-full rounded-md border border-border bg-bg px-3"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as SpotAge)}
              >
                <option value="infant">{spotAgePublicLabel("infant", locale === "fr" ? "fr" : "en")}</option>
                <option value="toddler">{spotAgePublicLabel("toddler", locale === "fr" ? "fr" : "en")}</option>
                <option value="preschool">{spotAgePublicLabel("preschool", locale === "fr" ? "fr" : "en")}</option>
                <option value="any">{spotAgePublicLabel("any", locale === "fr" ? "fr" : "en")}</option>
              </select>
            </Field>
            <Field label={intent === "tour" ? t("bookTour") : t("desiredStart")}>
              <input
                required
                type="date"
                className="h-11 w-full rounded-md border border-border bg-bg px-3"
                value={startDate}
                min={todayIso()}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <fieldset>
              <legend className="text-sm">{t("schedule")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["full", t("fullTime")],
                    ["part", t("partTime")],
                    ["custom", t("specificDays")],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSchedule(key)}
                    className={cn(
                      "h-10 rounded-full px-3.5 text-sm",
                      schedule === key
                        ? "bg-primary text-primary-fg"
                        : "ring-1 ring-border hover:bg-surface-2",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            {schedule === "custom" ? (
              <fieldset>
                <legend className="text-sm">{t("specificDays")}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DAYS.map(([key, copyKey]) => {
                    const on = days.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setDays((cur) => (on ? cur.filter((d) => d !== key) : [...cur, key]))
                        }
                        className={cn(
                          "h-10 min-w-11 rounded-full px-3 text-sm",
                          on ? "bg-fg text-bg" : "ring-1 ring-border hover:bg-surface-2",
                        )}
                      >
                        {t(copyKey)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            <Field label={t("optionalMessage")}>
              <textarea
                rows={3}
                placeholder={t("messagePh")}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
          </div>
          <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="submit"
              className="w-full"
              disabled={busy}
              size="lg"
              aria-busy={busy || undefined}
              aria-label={busy ? t("requestSentSending") : undefined}
            >
              {busy ? "…" : t("sendRequest")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultStart() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
