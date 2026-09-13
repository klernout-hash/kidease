import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { respondTourRequest } from "@/lib/server/tours";
import { listInbox } from "@/lib/server/inbox";
import { listProviderScreening } from "@/lib/server/provider-screening";
import type { LeadRequest } from "@/lib/lead-requests";
import {
  buildTodayRows,
  formatSlaCountdown,
  todayEmptyTruth,
  type TodayHref,
  type TodayRow,
  type TodayTone,
} from "@/lib/today-urgency";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { Conversation, Daycare, TourRequest } from "@/lib/types";

const TONE_DOT: Record<TodayTone, string> = {
  navy: "bg-primary",
  ok: "bg-ok",
  danger: "bg-danger",
};

const ACTION_DETAIL: Record<string, CopyKey> = {
  verified: "todayActionVerified",
  licence: "todayActionLicence",
  listing: "todayActionListing",
  screening: "todayActionScreening",
  unread: "todayUnread",
};

function TodayLink({
  href,
  className,
  children,
}: {
  href: TodayHref;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.to === "/inbox/$id") {
    return (
      <Link to="/inbox/$id" params={href.params} search={href.search} className={className}>
        {children}
      </Link>
    );
  }
  if (href.to === "/inbox") {
    return (
      <Link to="/inbox" search={href.search} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/provider" search={href.search} className={className}>
      {children}
    </Link>
  );
}

function slaLabel(row: TodayRow, t: (key: CopyKey) => string) {
  const sla = formatSlaCountdown(row.slaRemainingMs ?? null);
  if (sla.overdue) return t("todaySlaOverdue");
  if (row.slaRemainingMs == null) return t("todaySlaUnknown");
  if (sla.hours >= 1) return t("todaySlaHours").replace("{n}", String(sla.hours));
  return t("todaySlaMinutes").replace("{n}", String(Math.max(1, sla.minutes)));
}

function emptyUntilLabel(iso: string | null, locale: string, t: (key: CopyKey) => string) {
  if (!iso) return t("todayAllSetSoon");
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return t("todayAllSetSoon");
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ts);
}

export function TodayUrgencyHome({
  listings,
  tours,
  leads,
  onChanged,
  onOpenDesk,
}: {
  listings: Daycare[];
  tours: TourRequest[];
  leads: LeadRequest[];
  onChanged: () => void;
  onOpenDesk: (desk: "listings" | "tours" | "licence" | "screening" | "requests") => void;
}) {
  const { t, locale } = useCopy();
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [screening, setScreening] = useState<Array<{ daycareId: string; daycareName: string; screeningOnFile: boolean; people: Array<{ docs: Array<{ status: string }> }> }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void listInbox({ data: { view: "centre" } })
      .then(setThreads)
      .catch(() => setThreads([]));
    void listProviderScreening()
      .then((payload) =>
        setScreening(
          payload.centres.map((centre) => ({
            daycareId: centre.daycareId,
            daycareName: centre.daycareName,
            screeningOnFile: centre.screeningOnFile,
            people: centre.people.map((person) => ({ docs: person.docs.map((doc) => ({ status: doc.status })) })),
          })),
        ),
      )
      .catch(() => setScreening([]));
  }, [listings.length, tours.length]);

  const rows = useMemo(
    () =>
      buildTodayRows({
        tours,
        threads,
        listings,
        screening,
        fallbackName: t("parentLabel"),
      }),
    [tours, threads, listings, screening, t],
  );
  const empty = useMemo(() => todayEmptyTruth({ rows, tours, leads }), [rows, tours, leads]);
  const emptyHref = empty?.href;
  const emptyDesk = emptyHref?.to === "/provider" ? emptyHref.search.desk : null;

  async function decide(tourId: string, status: "accepted" | "declined") {
    setBusy(`${tourId}:${status}`);
    try {
      await respondTourRequest({ data: { tourId, status } });
      toast.success(status === "accepted" ? t("tourAccepted") : t("tourDeclined"));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tourRespondFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{t("todayHome")}</h2>
        <p className="mt-1 text-sm text-muted">{t("todayHomeLead")}</p>
      </div>
      {empty ? (
        <div className="rounded-xl bg-surface px-5 py-8 ring-1 ring-border">
          <p className="font-medium">
            {t("todayAllSet").replace("{when}", emptyUntilLabel(empty.untilLabel, locale, t))}
          </p>
          <p className="mt-2 text-sm text-muted">{t("todayAllSetLead")}</p>
          <div className="mt-4">
            {emptyDesk ? (
              <Button size="sm" variant="secondary" onClick={() => onOpenDesk(emptyDesk)}>
                {emptyDesk === "requests" ? t("leadInbox") : t("tourTimes")}
              </Button>
            ) : emptyHref ? (
              <Button size="sm" variant="secondary" asChild>
                <TodayLink href={emptyHref}>{t("messages")}</TodayLink>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${TONE_DOT[row.tone]}`}
                      aria-hidden="true"
                    />
                    <p className="truncate font-medium">{row.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {row.kind === "tour_request"
                      ? `${row.detail} · ${slaLabel(row, t)}`
                      : row.kind === "confirmed_tour"
                        ? `${t("todayConfirmed")} · ${row.detail}`
                        : t(ACTION_DETAIL[row.detail] ?? "todayActionListing")}
                  </p>
                </div>
                {row.kind === "tour_request" && row.tourId ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void decide(row.tourId!, "accepted")}
                    >
                      {busy === `${row.tourId}:accepted` ? t("loading") : t("acceptTour")}
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <TodayLink href={row.href}>{t("todayProposeTime")}</TodayLink>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => void decide(row.tourId!, "declined")}
                    >
                      {busy === `${row.tourId}:declined` ? t("loading") : t("declineTour")}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" asChild>
                    <TodayLink href={row.href}>
                      {row.kind === "unread"
                        ? t("openChat")
                        : row.kind === "confirmed_tour"
                          ? t("openChat")
                          : t("todayOpenItem")}
                    </TodayLink>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
