import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  MULTI_APPLY_MAX,
  centreAcceptsOnlineRequests,
  safeExternalUrl,
} from "@/lib/multi-apply";
import { capturePostHogEvent } from "@/lib/posthog";
import { createMultiSpotRequest } from "@/lib/server/multi-apply";
import { useCopy } from "@/lib/use-copy";
import type { DaycareCard } from "@/lib/types";

type Centre = Pick<DaycareCard, "id" | "name" | "nameFr" | "slug" | "live" | "phone"> & {
  website?: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function MultiApplyPanel({ centres, returnTo = "/compare" }: { centres: Centre[]; returnTo?: string }) {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  if (!centres.length) return null;
  const accepting = centres.filter((centre) => centreAcceptsOnlineRequests(centre));
  const selected = centres.filter((centre) => picked.includes(centre.id) && centreAcceptsOnlineRequests(centre));

  function toggle(id: string, live: boolean) {
    if (!live) return;
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((item) => item !== id);
      if (cur.length >= MULTI_APPLY_MAX) return cur;
      return [...cur, id];
    });
  }

  return (
    <section data-ke="multi-apply" className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border">
      <h2 className="font-display text-2xl">{t("multiApplyTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("multiApplyLead")}</p>
      <ul className="mt-4 space-y-2">
        {centres.map((centre) => {
          const live = centreAcceptsOnlineRequests(centre);
          const on = picked.includes(centre.id);
          const atCap = !on && selected.length >= MULTI_APPLY_MAX;
          const name = locale === "fr" ? centre.nameFr || centre.name : centre.name;
          const site = safeExternalUrl(centre.website);
          return (
            <li key={centre.id} className="rounded-lg bg-bg px-3 py-2 ring-1 ring-border">
              {live ? (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={on}
                    disabled={atCap}
                    onChange={() => toggle(centre.id, true)}
                  />
                  <span className="font-medium text-fg">{name}</span>
                </label>
              ) : (
                <div className="py-1">
                  <p className="font-medium text-fg">{name}</p>
                  <p className="mt-1 text-sm text-muted">{t("multiApplyNotAccepting")}</p>
                  <p className="mt-2 flex flex-wrap gap-3 text-sm">
                    {centre.phone ? (
                      <a className="inline-flex min-h-11 items-center font-medium text-primary" href={`tel:${centre.phone}`}>
                        {t("multiApplyCall")}
                      </a>
                    ) : null}
                    {site ? (
                      <a className="inline-flex min-h-11 items-center font-medium text-primary" href={site} target="_blank" rel="noreferrer">
                        {t("multiApplySite")}
                      </a>
                    ) : null}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {picked.length >= MULTI_APPLY_MAX ? <p className="mt-2 text-xs text-subtle">{t("multiApplyMax")}</p> : null}
      {!accepting.length ? <p className="mt-3 text-sm text-muted">{t("multiApplyNone")}</p> : null}
      {selected.length ? (
        user ? (
          <Button
            className="mt-4 w-full touch-manipulation sm:w-auto"
            onClick={() => {
              capturePostHogEvent("multi_apply_started", { count: selected.length });
              setOpen(true);
            }}
          >
            {t("multiApplyCta")}
          </Button>
        ) : (
          <Button className="mt-4 w-full touch-manipulation sm:w-auto" asChild>
            <Link to="/login" search={parentLoginSearch(returnTo)}>
              {t("multiApplyNeedSignIn")}
            </Link>
          </Button>
        )
      ) : null}
      {open ? (
        <MultiApplySheet
          centres={selected}
          onClose={() => setOpen(false)}
          onNeedSignIn={() => {
            setOpen(false);
            void navigate({ to: "/login", search: parentLoginSearch(returnTo) });
          }}
        />
      ) : null}
    </section>
  );
}

function MultiApplySheet({
  centres,
  onClose,
  onNeedSignIn,
}: {
  centres: Centre[];
  onClose: () => void;
  onNeedSignIn: () => void;
}) {
  const { t, locale } = useCopy();
  const titleId = useId();
  const [childName, setChildName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [schedule, setSchedule] = useState<"full" | "part">("full");
  const [subsidy, setSubsidy] = useState<"yes" | "no" | "">("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  useEffect(() => {
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
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      toast.error(t("multiApplyConsentNeed"));
      return;
    }
    if (!childName.trim() || !birthdate || !startDate || !subsidy) return;
    setBusy(true);
    try {
      const res = await createMultiSpotRequest({
        data: {
          daycareIds: centres.map((centre) => centre.id),
          childName: childName.trim(),
          birthdate,
          startDate,
          schedule,
          subsidyInterest: subsidy === "yes",
          message: message.trim(),
          shareConsent: true,
          locale,
        },
      });
      if (!res.ok) {
        toast.error(
          res.error === "rate"
            ? t("multiApplyRate")
            : res.error === "consent"
              ? t("multiApplyConsentNeed")
              : res.skipped.some((row) => row.reason === "duplicate")
                ? t("multiApplyDuplicate")
                : t("multiApplyNoneSent"),
        );
        return;
      }
      capturePostHogEvent("multi_apply_submitted", { count: res.sent.length });
      setSentCount(res.sent.length);
      if (res.skipped.length) toast.message(t("multiApplySkipped"));
    } catch {
      toast.error(t("needSignIn"));
      onNeedSignIn();
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
        {sentCount != null ? (
          <div className="space-y-4 px-5 py-6">
            <h2 id={titleId} className="font-display text-xl">{t("multiApplySent")}</h2>
            <p className="text-sm text-muted">{t("multiApplySentCount").replace("{count}", String(sentCount))}</p>
            <Button asChild>
              <Link to="/parent" search={{ tab: "requests" }}>{t("myRequests")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 id={titleId} className="font-display text-xl">{t("multiApplyTitle")}</h2>
                <p className="mt-0.5 text-sm text-muted">{t("multiApplyLead")}</p>
              </div>
              <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-md text-muted hover:bg-bg" aria-label={t("cancel")}>
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <ul className="text-sm text-muted">
                {centres.map((centre) => (
                  <li key={centre.id}>{locale === "fr" ? centre.nameFr || centre.name : centre.name}</li>
                ))}
              </ul>
              <label className="block text-sm">
                {t("multiApplyChild")}
                <input
                  required
                  autoComplete="given-name"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                />
              </label>
              <label className="block text-sm">
                {t("birthdate")}
                <input
                  required
                  type="date"
                  max={todayIso()}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
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
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                />
              </label>
              <fieldset>
                <legend className="text-sm">{t("multiApplyDays")}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["full", "part"] as const).map((value) => (
                    <label key={value} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-bg px-3 text-sm ring-1 ring-border">
                      <input type="radio" name="schedule" checked={schedule === value} onChange={() => setSchedule(value)} />
                      {t(value === "full" ? "fullTime" : "partTime")}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm">{t("multiApplySubsidy")}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["yes", "no"] as const).map((value) => (
                    <label key={value} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-bg px-3 text-sm ring-1 ring-border">
                      <input type="radio" name="subsidy" required checked={subsidy === value} onChange={() => setSubsidy(value)} />
                      {t(value === "yes" ? "multiApplyYes" : "multiApplyNo")}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm">
                {t("optionalMessage")}
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                />
              </label>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>{t("multiApplyConsent")}</span>
              </label>
            </div>
            <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button type="submit" className="w-full touch-manipulation" disabled={busy}>
                {busy ? t("loading") : t("multiApplySend")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
