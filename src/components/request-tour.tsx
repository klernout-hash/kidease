import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFamily } from "@/lib/server/family";
import { createTourRequest } from "@/lib/server/tours";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { MAX_TOUR_SLOTS, type PreferredTime } from "@/lib/threads";
import type { Child, Daycare } from "@/lib/types";

type Props = {
  daycare: Daycare;
  open: boolean;
  onClose: () => void;
};

function emptySlot(): PreferredTime {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setMinutes(0, 0, 0);
  if (d.getHours() < 9) d.setHours(9);
  if (d.getHours() > 16) d.setHours(10);
  return { date: d.toISOString().slice(0, 10), time: `${String(d.getHours()).padStart(2, "0")}:00` };
}

export function RequestTourSheet({ daycare, open, onClose }: Props) {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const titleId = useId();
  const [childId, setChildId] = useState("");
  const [savedKids, setSavedKids] = useState<Child[]>([]);
  const [childName, setChildName] = useState("");
  const [times, setTimes] = useState<PreferredTime[]>([emptySlot()]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ conversationId: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDone(null);
    void getFamily()
      .then((f) => setSavedKids(f.children))
      .catch(() => undefined);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    if (times.length === 0) return;
    setBusy(true);
    try {
      const res = await createTourRequest({
        data: {
          daycareId: daycare.id,
          preferredTimes: times,
          childId: childId || undefined,
          childName: childName.trim() || undefined,
          note: message.trim() || undefined,
          locale: locale === "fr" ? "fr" : "en",
        },
      });
      toast.success(t("requestSentTitleTour"));
      setDone({ conversationId: res.conversationId });
      window.setTimeout(() => {
        void navigate({ to: "/inbox/$id", params: { id: res.conversationId } });
      }, 1400);
    } catch {
      toast.error(t("needSignIn"));
      void navigate({ to: "/login" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("cancel")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border md:rounded-xl"
      >
        {done ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-ok text-primary-fg">
              <Check className="size-7" strokeWidth={2.5} />
            </span>
            <h2 id={titleId} className="mt-5 font-display text-2xl">
              {t("requestSentTitleTour")}
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted">{t("requestSentBodyTour")}</p>
            <p className="mt-1 text-xs text-subtle">{t("notifyCentre")}</p>
            <Button className="mt-6 w-full" asChild>
              <Link to="/inbox/$id" params={{ id: done.conversationId }}>
                {t("goToConversation")}
              </Link>
            </Button>
            <button type="button" className="mt-3 text-sm text-muted hover:text-fg" onClick={onClose}>
              {t("cancel")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
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
              <p className="text-sm text-muted">{t("tourLead")}</p>
              {savedKids.length ? (
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
              <fieldset>
                <legend className="text-sm">{t("preferredTimes")}</legend>
                <p className="mt-1 text-xs text-muted">{t("preferredTimesLead")}</p>
                <div className="mt-2 space-y-2">
                  {times.map((slot, i) => (
                    <div key={`${slot.date}-${i}`} className="flex flex-wrap items-center gap-2">
                      <input
                        required
                        type="date"
                        min={todayIso()}
                        className="h-11 flex-1 rounded-md border border-border bg-bg px-3"
                        value={slot.date}
                        onChange={(e) =>
                          setTimes((cur) => cur.map((s, idx) => (idx === i ? { ...s, date: e.target.value } : s)))
                        }
                      />
                      <input
                        required
                        type="time"
                        className="h-11 w-32 rounded-md border border-border bg-bg px-3"
                        value={slot.time}
                        onChange={(e) =>
                          setTimes((cur) => cur.map((s, idx) => (idx === i ? { ...s, time: e.target.value } : s)))
                        }
                      />
                      {times.length > 1 ? (
                        <button
                          type="button"
                          className="grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2"
                          aria-label={t("removeTime")}
                          onClick={() => setTimes((cur) => cur.filter((_, idx) => idx !== i))}
                        >
                          <X className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {times.length < MAX_TOUR_SLOTS ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary"
                    onClick={() => setTimes((cur) => [...cur, emptySlot()])}
                  >
                    <Plus className="size-4" />
                    {t("addTime")}
                  </button>
                ) : null}
              </fieldset>
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
            </div>
            <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button type="submit" className="w-full" disabled={busy} size="lg">
                {busy ? t("loading") : t("sendTourRequest")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
