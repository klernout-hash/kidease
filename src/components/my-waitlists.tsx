import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { capturePostHogEvent } from "@/lib/posthog";
import { listMyWaitlists, withdrawMyWaitlist, type WaitlistRow } from "@/lib/server/waitlist-tracker";
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

export function MyWaitlists() {
  const { t, locale } = useCopy();
  const [rows, setRows] = useState<WaitlistRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    void listMyWaitlists()
      .then((next) => {
        if (stop) return;
        setRows(next);
        capturePostHogEvent("waitlist_viewed", waitlistEventProps({ count: next.length }));
      })
      .catch(() => {
        if (!stop) setRows([]);
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
      setRows((cur) => (cur || []).map((item) => (item.id === row.id ? { ...item, status: "withdrawn", updatedAt: new Date().toISOString() } : item)));
      setNote(t("waitlistWithdrawnDone"));
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return <div className="ke-skel mt-6 h-40 rounded-xl" aria-hidden="true" />;
  if (!rows.length) {
    return (
      <EmptyState
        title={t("myWaitlistsEmpty")}
        body={t("myWaitlistsEmptyLead")}
        action={t("emptyFindCare")}
        actionTo="/search"
      />
    );
  }

  return (
    <div className="mt-4">
      {note ? <p className="mb-3 text-sm text-muted">{note}</p> : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
        {rows.map((row) => (
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
              <Button
                size="sm"
                variant="secondary"
                className="min-h-11"
                disabled={busy === row.id}
                onClick={() => void withdraw(row)}
              >
                {t("waitlistWithdraw")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
