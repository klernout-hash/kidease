import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RequestSentDialog } from "@/components/request-sent-dialog";
import { useLiveSubmit } from "@/components/use-live-submit";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getDaycare } from "@/lib/server/daycares";
import { createSpotRequest } from "@/lib/server/family";
import { holdSendBeat, requestSentThumb } from "@/lib/request-sent";
import { useCopy } from "@/lib/use-copy";
import { noteHappyMoment } from "@/lib/store-review";
import type { Daycare, Schedule } from "@/lib/types";

export const Route = createFileRoute("/book/$slug")({ component: BookPage });

const DAYS = [
  ["Mon", "dayMon"],
  ["Tue", "dayTue"],
  ["Wed", "dayWed"],
  ["Thu", "dayThu"],
  ["Fri", "dayFri"],
] as const;

function BookPage() {
  const { slug } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const [daycare, setDaycare] = useState<Daycare | null>(null);
  const [childName, setChildName] = useState("");
  const [birth, setBirth] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [schedule, setSchedule] = useState<Schedule>("full");
  const [days, setDays] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ conversationId: string } | null>(null);
  const send = useLiveSubmit(true);

  useEffect(() => {
    void getDaycare({ data: slug }).then((res) => {
      if (res) setDaycare(res.daycare);
    });
  }, [slug]);

  if (isPending) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-4 py-16 text-muted">{t("loading")}</div>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!daycare) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-4 py-16 text-muted">{t("loading")}</div>
      </Shell>
    );
  }

  const name = locale === "fr" ? daycare.nameFr : daycare.name;
  const centre = daycare;
  const parent = user;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!childName.trim() || !birth) return;
    const token = send.start();
    setBusy(true);
    try {
      const res = await createSpotRequest({
        data: {
          daycareId: centre.id,
          childName: childName.trim(),
          birthdate: birth,
          startDate,
          schedule,
          days,
          message: message.trim(),
          parentName: parent.displayName ?? undefined,
          locale,
        },
      });
      noteHappyMoment("booking");
      await holdSendBeat();
      if (!send.live(token)) return;
      setSent({ conversationId: res.conversationId });
    } catch (err) {
      if (!send.live(token)) return;
      toast.error(err instanceof Error ? err.message : t("needSignIn"));
    } finally {
      if (send.live(token)) setBusy(false);
    }
  }

  function backToListing() {
    void navigate({ to: "/daycare/$slug", params: { slug } });
  }

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-4 py-8">
        <Link to="/daycare/$slug" params={{ slug }} className="text-sm text-muted hover:text-fg">
          ← {t("back")}
        </Link>
        <h1 className="mt-3 font-display text-3xl">{t("requestSpotTitle")}</h1>
        <p className="mt-1 text-muted">{name}</p>
        <form
          onSubmit={submit}
          className="mt-6 space-y-5 rounded-xl bg-surface p-5 ring-1 ring-border"
        >
          <label className="block text-sm">
            {t("childFullName")}
            <input
              required
              className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t("birthdate")}
            <input
              required
              type="date"
              className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t("desiredStart")}
            <input
              required
              type="date"
              className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="text-sm">{t("schedule")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["full", "part", "custom"] as Schedule[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSchedule(s)}
                  className={
                    schedule === s
                      ? "rounded-full bg-primary px-3 py-1.5 text-sm text-primary-fg"
                      : "rounded-full px-3 py-1.5 text-sm ring-1 ring-border"
                  }
                >
                  {s === "full" ? t("fullTime") : s === "part" ? t("partTime") : t("specificDays")}
                </button>
              ))}
            </div>
          </fieldset>
          {schedule === "custom" ? (
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([key, copyKey]) => {
                const on = days.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setDays((cur) => (on ? cur.filter((d) => d !== key) : [...cur, key]))
                    }
                    className={
                      on
                        ? "h-10 rounded-full bg-fg px-3 text-sm text-bg"
                        : "h-10 rounded-full px-3 text-sm ring-1 ring-border"
                    }
                  >
                    {t(copyKey)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="block text-sm">
            {t("optionalMessage")}
            <textarea
              rows={3}
              placeholder={t("messagePh")}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            className="w-full"
            disabled={busy}
            aria-busy={busy || undefined}
            aria-label={busy ? t("requestSentSending") : undefined}
          >
            {busy ? "…" : t("sendRequest")}
          </Button>
        </form>
        {sent ? (
          <RequestSentDialog
            kind="spot"
            listingName={name}
            city={centre.city}
            photo={requestSentThumb(centre.photos)}
            conversationId={sent.conversationId}
            canOpenMessages
            onClose={backToListing}
          />
        ) : null}
      </main>
    </Shell>
  );
}
