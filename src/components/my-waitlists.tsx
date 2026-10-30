import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AreaWaitlistForm } from "@/components/area-waitlist-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { areaWaitlistCopy, centreWaitlistStatus } from "@/lib/area-waitlist-copy";
import { capturePostHogEvent } from "@/lib/posthog";
import { removeAreaWaitlist } from "@/lib/server/area-waitlist";
import { withdrawDaycareWaitlist } from "@/lib/server/spot-offers";
import {
  listMyWaitlists,
  withdrawMyWaitlist,
  type AreaWaitlistRow,
  type CentreWaitlistRow,
  type MyWaitlistsResult,
  type WaitlistRow,
} from "@/lib/server/waitlist-tracker";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { canWithdrawWaitlist, waitlistEventProps, type ParentWaitlistStatus } from "@/lib/waitlist-tracker";

const STATUS_KEY: Record<ParentWaitlistStatus, CopyKey> = {
  sent: "waitlistStatusSent",
  seen: "waitlistStatusSeen",
  waitlisted: "waitlistStatusWaitlisted",
  offered: "waitlistStatusOffered",
  declined: "waitlistStatusDeclined",
  withdrawn: "waitlistStatusWithdrawn",
};

function when(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
}

function canLeaveCentre(status: string) {
  return status === "waiting" || status === "offered";
}

export function MyWaitlists() {
  const { t, locale } = useCopy();
  const copy = areaWaitlistCopy(locale);
  const [data, setData] = useState<MyWaitlistsResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function load() {
    return listMyWaitlists()
      .then((next) => {
        setData(next);
        capturePostHogEvent("waitlist_viewed", waitlistEventProps({ count: next.requests.length + next.centres.length }));
      })
      .catch(() => setData({ requests: [], centres: [], areas: [] }));
  }

  useEffect(() => {
    let stop = false;
    void listMyWaitlists()
      .then((next) => {
        if (stop) return;
        setData(next);
        capturePostHogEvent("waitlist_viewed", waitlistEventProps({ count: next.requests.length + next.centres.length }));
      })
      .catch(() => {
        if (!stop) setData({ requests: [], centres: [], areas: [] });
      });
    return () => {
      stop = true;
    };
  }, []);

  async function withdraw(row: WaitlistRow) {
    setBusy(row.id);
    setNote(null);
    try {
      const res = await withdrawMyWaitlist({ data: { bookingId: row.id } });
      if (!res.ok) return;
      capturePostHogEvent("waitlist_withdrawn", waitlistEventProps({ daycareId: res.daycareId, status: "withdrawn" }));
      setData((cur) =>
        cur
          ? {
              ...cur,
              requests: cur.requests.map((item) =>
                item.id === row.id ? { ...item, status: "withdrawn", updatedAt: new Date().toISOString() } : item,
              ),
            }
          : cur,
      );
      setNote(t("waitlistWithdrawnDone"));
    } finally {
      setBusy(null);
    }
  }

  async function leaveCentre(row: CentreWaitlistRow) {
    setBusy(row.id);
    setNote(null);
    try {
      await withdrawDaycareWaitlist({ data: { id: row.id } });
      setData((cur) =>
        cur
          ? { ...cur, centres: cur.centres.map((item) => (item.id === row.id ? { ...item, status: "withdrawn" } : item)) }
          : cur,
      );
      setNote(copy.withdrawn);
    } catch {
      setNote(copy.noOffer);
    } finally {
      setBusy(null);
    }
  }

  async function removeArea(row: AreaWaitlistRow) {
    setBusy(row.id);
    setNote(null);
    try {
      const res = await removeAreaWaitlist({ data: { id: row.id } });
      if (!res.ok) return;
      setData((cur) => (cur ? { ...cur, areas: cur.areas.filter((item) => item.id !== row.id) } : cur));
      setNote(copy.removed);
    } finally {
      setBusy(null);
    }
  }

  const empty = data && !data.requests.length && !data.centres.length && !data.areas.length;

  return (
    <div className="mt-4">
      <AreaWaitlistForm onJoined={() => void load()} />
      {note ? (
        <p className="mt-3 text-sm text-muted" role="status">
          {note}
        </p>
      ) : null}
      {!data ? <div className="ke-skel mt-6 h-40 rounded-xl" aria-hidden="true" /> : null}
      {empty ? (
        <EmptyState
          title={t("myWaitlistsEmpty")}
          body={t("myWaitlistsEmptyLead")}
          action={t("emptyFindCare")}
          actionTo="/search"
        />
      ) : null}
      {data && data.areas.length ? (
        <section className="mt-6" data-ke="area-waitlist-list">
          <h3 className="font-display text-xl">{copy.yoursTitle}</h3>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {data.areas.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{row.label}</p>
                  <p className="mt-1 text-sm text-muted">
                    {row.postalCode ? `${row.postalCode} · ` : ""}
                    {copy.radiusKm.replace("{n}", String(row.radiusKm))}
                    {" · "}
                    {row.ageGroup}
                    {row.startDate ? ` · ${row.startDate}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="secondary" className="min-h-11" disabled={busy === row.id} onClick={() => void removeArea(row)}>
                  {copy.remove}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data && data.centres.length ? (
        <section className="mt-6" data-ke="centre-waitlist-list">
          <h3 className="font-display text-xl">{copy.centreTitle}</h3>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {data.centres.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/daycare/$slug" params={{ slug: row.daycareSlug }} className="font-medium hover:underline">
                      {row.daycareName}
                    </Link>
                    <span className="inline-flex min-h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs ring-1 ring-border">
                      {centreWaitlistStatus(row.status, locale)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{row.ageGroup}</p>
                  <p className="mt-1 text-xs text-subtle">{copy.joinedOn.replace("{date}", when(row.joinedAt, locale))}</p>
                  {row.offerStatus === "open" && row.offerExpiresAt ? (
                    <p className="mt-1 text-sm text-muted">
                      {copy.offerOpen.replace("{date}", when(row.offerExpiresAt, locale))}
                      {" · "}
                      <Link to="/parent/spot-offers" className="font-medium text-primary">
                        {copy.offerAnswer}
                      </Link>
                    </p>
                  ) : row.status === "waiting" ? (
                    <p className="mt-1 text-xs text-subtle">{copy.noOffer}</p>
                  ) : null}
                </div>
                {canLeaveCentre(row.status) ? (
                  <Button size="sm" variant="secondary" className="min-h-11" disabled={busy === row.id} onClick={() => void leaveCentre(row)}>
                    {copy.withdraw}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data && data.requests.length ? (
        <section className="mt-6">
          <h3 className="font-display text-xl">{copy.requestsTitle}</h3>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {data.requests.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/daycare/$slug" params={{ slug: row.daycareSlug }} className="font-medium hover:underline">
                      {row.daycareName}
                    </Link>
                    <span className="inline-flex min-h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs ring-1 ring-border">
                      {t(STATUS_KEY[row.status])}
                    </span>
                  </div>
                  {row.city ? <p className="mt-1 text-sm text-muted">{row.city}</p> : null}
                  <p className="mt-1 text-xs text-subtle">
                    {t("waitlistSentOn").replace("{date}", when(row.sentAt, locale))}
                    {" · "}
                    {t("waitlistUpdatedOn").replace("{date}", when(row.updatedAt, locale))}
                  </p>
                </div>
                {canWithdrawWaitlist(row.status) ? (
                  <Button size="sm" variant="secondary" className="min-h-11" disabled={busy === row.id} onClick={() => void withdraw(row)}>
                    {t("waitlistWithdraw")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
