import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequestSentDialog } from "@/components/request-sent-dialog";
import { useLiveSubmit } from "@/components/use-live-submit";
import { getFamily } from "@/lib/server/family";
import { bookTourSlot, listPublicTourSlots } from "@/lib/server/tour-calendar";
import { holdSendBeat, requestSentThumb } from "@/lib/request-sent";
import { capturePostHogEvent } from "@/lib/posthog";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import {
  formatTourDateChip,
  formatTourSlotRange,
  timezoneLabel,
  type PublicTourSlot,
  type TourEmptyReason,
} from "@/lib/tour-calendar";
import type { Child, Daycare } from "@/lib/types";

type Props = {
  daycare: Daycare;
  open: boolean;
  onClose: () => void;
  onRequestInfo?: () => void;
};

export function RequestTourSheet({ daycare, open, onClose, onRequestInfo }: Props) {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const titleId = useId();
  const loc = locale === "fr" ? "fr" : "en";
  const [childId, setChildId] = useState("");
  const [savedKids, setSavedKids] = useState<Child[]>([]);
  const [childName, setChildName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [slots, setSlots] = useState<PublicTourSlot[]>([]);
  const [empty, setEmpty] = useState<TourEmptyReason | null>("none_posted");
  const [timezone, setTimezone] = useState(daycare.timezone || "America/Winnipeg");
  const [date, setDate] = useState("");
  const [windowId, setWindowId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{
    conversationId: string;
    guest: boolean;
    detail: string;
  } | null>(null);
  const opened = useRef(false);
  const send = useLiveSubmit(open);

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    const justOpened = !opened.current;
    opened.current = true;
    if (justOpened) {
      setDone(null);
      setWindowId("");
    }
    setDate("");
    setLoading(true);
    if (user?.primaryEmail) setEmail(user.primaryEmail);
    if (user?.displayName) {
      const [first, ...rest] = user.displayName.trim().split(/\s+/);
      setFirstName(first || "");
      if (rest.length) setLastName(rest.join(" "));
    }
    void getFamily()
      .then((f) => setSavedKids(f.children))
      .catch(() => undefined);
    void listPublicTourSlots({ data: { daycareId: daycare.id } })
      .then((res) => {
        setSlots(res.slots);
        setEmpty(res.empty);
        setTimezone(res.timezone);
        const first = res.slots[0]?.date ?? "";
        setDate(first);
      })
      .catch(() => {
        setSlots([]);
        setEmpty("none_posted");
      })
      .finally(() => setLoading(false));
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
  }, [open, onClose, daycare.id, user]);

  if (!open) return null;

  const name = locale === "fr" ? daycare.nameFr : daycare.name;
  const dates = [...new Set(slots.map((slot) => slot.date))];
  const daySlots = slots.filter((slot) => slot.date === date);
  const selected = slots.find((slot) => slot.id === windowId) ?? null;
  const guest = !user;

  if (done) {
    return (
      <RequestSentDialog
        kind="tour"
        listingName={name}
        city={daycare.city}
        photo={requestSentThumb(daycare.photos)}
        detail={done.detail}
        conversationId={done.conversationId}
        canOpenMessages={!done.guest}
        onClose={() => {
          setDone(null);
          onClose();
        }}
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!windowId) {
      toast.error(t("tourTimesNeedSlot"));
      return;
    }
    if (
      guest &&
      (!firstName.trim() || !lastName.trim() || phone.trim().length < 7 || !email.trim())
    ) {
      toast.error(t("tourTimesNeedContact"));
      return;
    }
    const token = send.start();
    setBusy(true);
    try {
      const res = await bookTourSlot({
        data: {
          daycareId: daycare.id,
          windowId,
          childId: childId || undefined,
          childName: childName.trim() || undefined,
          note: message.trim() || undefined,
          locale: locale === "fr" ? "fr" : "en",
          userId: user?.id,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
      });
      capturePostHogEvent("listing_request_submitted", { intent: "tour" });
      await holdSendBeat();
      if (!send.live(token)) return;
      setDone({
        conversationId: res.conversationId,
        guest: res.guest,
        detail: selected ? formatTourSlotRange(selected, loc) : "",
      });
    } catch (err) {
      if (!send.live(token)) return;
      toast.error(err instanceof Error ? err.message : t("tourTimesFailed"));
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
        <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-xl">
                {t("bookTour")}
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
            <p className="text-sm text-muted">{t("tourTimesListingLead")}</p>
            <p className="text-sm text-muted">{t("tourHoldSlaLead")}</p>
            {loading ? (
              <p className="text-sm text-muted">{t("loading")}</p>
            ) : empty ? (
              <div className="rounded-lg bg-bg p-4 ring-1 ring-border" data-tour-empty={empty}>
                <p className="font-medium">
                  {empty === "none_open" ? t("tourTimesNoneOpen") : t("tourTimesEmpty")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {empty === "none_open" ? t("tourTimesNoneOpenLead") : t("tourTimesEmptyLead")}
                </p>
                {onRequestInfo ? (
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    onClick={() => {
                      onClose();
                      onRequestInfo();
                    }}
                  >
                    {t("requestInfo")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className="text-sm font-medium">{t("tourTimesPickDate")}</legend>
                  <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto pb-1">
                    {dates.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setDate(day);
                          setWindowId("");
                        }}
                        className={`min-h-11 shrink-0 rounded-full px-3 text-sm ring-1 ${
                          date === day
                            ? "bg-primary text-primary-fg ring-primary"
                            : "bg-bg ring-border"
                        }`}
                      >
                        {formatTourDateChip(day, loc)}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-medium">{t("tourTimesPickSlot")}</legend>
                  <p className="mt-1 text-xs text-muted">{timezoneLabel(timezone, loc)}</p>
                  <div className="mt-2 grid gap-2">
                    {daySlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setWindowId(slot.id)}
                        className={`min-h-11 rounded-lg px-3 py-2 text-left text-sm ring-1 ${
                          windowId === slot.id
                            ? "bg-primary/10 ring-2 ring-primary"
                            : "bg-bg ring-border"
                        }`}
                      >
                        <span className="font-medium">{formatTourSlotRange(slot, loc)}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {slot.remaining === 1
                            ? `1 ${t("tourTimesSpotLeft")}`
                            : `${slot.remaining} ${t("tourTimesSpotsLeft")}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {user && savedKids.length ? (
              <label className="block text-sm">
                {t("pickChild")}
                <select
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={childId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setChildId(id);
                    const kid = savedKids.find((c) => c.id === id);
                    setChildName(kid?.name ?? "");
                  }}
                >
                  <option value="">{t("newChildOption")}</option>
                  {savedKids.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {user ? (
              <label className="block text-sm">
                {t("childFullName")}
                <input
                  autoComplete="off"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder={t("optional")}
                />
              </label>
            ) : null}
            {guest && !empty ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="text-sm text-muted sm:col-span-2">{t("tourTimesGuestLead")}</p>
                <label className="text-sm">
                  {t("requestInfoFirst")}
                  <input
                    required
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <label className="text-sm">
                  {t("requestInfoLast")}
                  <input
                    required
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </label>
                <label className="text-sm">
                  {t("requestInfoPhone")}
                  <input
                    required
                    type="tel"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </label>
                <label className="text-sm">
                  {t("requestInfoEmail")}
                  <input
                    required
                    type="email"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
              </div>
            ) : null}
            {!empty ? (
              <label className="block text-sm">
                {t("optionalMessage")}
                <textarea
                  rows={3}
                  placeholder={t("tourDefaultNote")}
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
            ) : null}
            {selected ? (
              <p className="text-xs text-subtle">{formatTourSlotRange(selected, loc)}</p>
            ) : null}
          </div>
          {!empty ? (
            <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !windowId}
                size="lg"
                aria-busy={busy || undefined}
                aria-label={busy ? t("requestSentSending") : undefined}
              >
                {busy ? "…" : t("tourTimesBook")}
              </Button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
