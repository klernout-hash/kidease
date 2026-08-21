import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSpotRequest, getFamily } from "@/lib/server/family";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Child, Daycare, Schedule } from "@/lib/types";

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
  const [childId, setChildId] = useState("");
  const [savedKids, setSavedKids] = useState<Child[]>([]);
  const [childName, setChildName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [schedule, setSchedule] = useState<Schedule>("full");
  const [days, setDays] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ conversationId: string } | null>(null);

  useEffect(() => {
    if (!open) return;
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
    if (!childName.trim() || !startDate) return;
    if (intent === "spot" && !birthdate) return;
    if (schedule === "custom" && days.length === 0) return;
    setBusy(true);
    try {
      const res = await createSpotRequest({
        data: {
          daycareId: daycare.id,
          childId: childId || undefined,
          childName: childName.trim(),
          birthdate: birthdate || startDate,
          startDate,
          schedule,
          days,
          message: (intent === "tour" ? `${t("bookTour")}: ${message.trim() || t("tourDefaultNote")}` : message.trim()),
          parentName: user.displayName ?? undefined,
          locale,
        },
      });
      toast.success(t("requestSentTitle"));
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
        {done ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-ok text-primary-fg">
              <Check className="size-7" strokeWidth={2.5} />
            </span>
            <h2 id={titleId} className="mt-5 font-display text-2xl">
              {t(intent === "tour" ? "requestSentTitleTour" : "requestSentTitle")}
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted">{t(intent === "tour" ? "requestSentBodyTour" : "requestSentBody")}</p>
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
              <p className="text-sm text-muted">{t(intent === "tour" ? "tourLead" : "requestSpotLead")}</p>
              {savedKids.length ? (
                <Field label={t("pickChild")}>
                  <select
                    className="h-11 w-full rounded-md border border-border bg-bg px-3"
                    value={childId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setChildId(id);
                      const kid = savedKids.find((c) => c.id === id);
                      if (kid) {
                        setChildName(kid.name);
                        setBirthdate(kid.birthdate);
                      } else {
                        setChildName("");
                        setBirthdate("");
                      }
                    }}
                  >
                    <option value="">{t("newChildOption")}</option>
                    {savedKids.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label={t("childFullName")}>
                <input
                  required
                  autoComplete="off"
                  className="h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                />
              </Field>
              <Field label={t("birthdate")}>
                <input
                  required={intent === "spot"}
                  type="date"
                  className="h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={birthdate}
                  max={todayIso()}
                  onChange={(e) => setBirthdate(e.target.value)}
                />
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
              <Button type="submit" className="w-full" disabled={busy} size="lg">
                {busy ? t("loading") : t("sendRequest")}
              </Button>
            </div>
          </form>
        )}
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
