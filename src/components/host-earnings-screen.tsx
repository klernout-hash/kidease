import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { CountUp } from "@/components/count-up";
import { EmptyState } from "@/components/empty-state";
import { KidBlocks } from "@/components/kid-art";
import { MonthBars } from "@/components/month-bars";
import { billLabel, chartHasEarnings, monthTick, type HostBill, type HostEarnings } from "@/lib/host-desk";
import { loadHostEarnings } from "@/lib/server/host-desk";
import { periodLabel } from "@/lib/stripe-methods";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useMounted } from "@/lib/use-mounted";
import { useCopy } from "@/lib/use-copy";

export function HostEarningsScreen({ initial }: { initial?: HostEarnings | null }) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const mounted = useMounted();
  const [data, setData] = useState<HostEarnings | null>(initial ?? null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    void loadHostEarnings()
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => {
        if (live) setData({ ok: false, thisMonthCents: null, bars: [], paid: [], upcoming: [] });
      });
    return () => {
      live = false;
    };
  }, [initial]);

  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const showChart = data?.ok && chartHasEarnings(data.bars);
  const empty = data?.ok && data.thisMonthCents == null && !showChart && data.paid.length === 0 && data.upcoming.length === 0;

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-10 pt-4" data-ke="host-earnings">
      <div className="flex items-center gap-2">
        <Link
          to="/menu"
          aria-label={t("back")}
          className="ke-press grid size-11 shrink-0 place-items-center rounded-full text-fg touch-manipulation hover:bg-surface"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <h1 className="font-display text-2xl">{t("earningsTitle")}</h1>
      </div>

      {data == null && mounted ? <SoftSkeleton /> : null}

      {data && !data.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}

      {data?.ok && empty ? (
        <div className="mt-6 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border">
          <EmptyState title={t("earningsEmptyTitle")} body={t("earningsEmptyBody")} art={<KidBlocks className="mx-auto h-20 w-32 text-primary" />} />
        </div>
      ) : null}

      {data?.ok && !empty ? (
        <>
          <section className="mt-6 rounded-[1.25rem] bg-surface p-5 ring-1 ring-border" data-ke="earnings-month">
            <p className="text-sm text-muted">{t("earningsThisMonth")}</p>
            {data.thisMonthCents == null ? (
              <p className="mt-2 font-display text-2xl">{t("earningsNoneThisMonth")}</p>
            ) : (
              <CountUp value={data.thisMonthCents} format={cad} className="mt-2 block font-display text-3xl tabular-nums" />
            )}
            {showChart ? (
              <>
                <MonthBars bars={data.bars} label={chartLabel(data.bars, cad, t("earningsByMonth"), french)} />
                <div className="mt-2 flex gap-1.5">
                  {data.bars.map((bar) => (
                    <span key={bar.period} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">
                      {monthTick(bar.period, french)}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="mt-8" data-ke="earnings-upcoming">
            <h2 className="font-display text-xl">{t("earningsUpcoming")}</h2>
            {data.upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("earningsUpcomingEmpty")}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.upcoming.map((bill) => (
                  <BillRow key={bill.id} bill={bill} cad={cad} french={french} status={t("earningsScheduled")} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8" data-ke="earnings-paid">
            <h2 className="font-display text-xl">{t("earningsPaid")}</h2>
            {data.paid.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("earningsPaidEmpty")}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.paid.map((bill) => (
                  <BillRow key={bill.id} bill={bill} cad={cad} french={french} status={t("earningsPaid")} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function BillRow({
  bill,
  cad,
  french,
  status,
}: {
  bill: HostBill;
  cad: (cents: number) => string;
  french: boolean;
  status: string;
}) {
  const when = bill.paidAt || bill.dueAt;
  const date = when ? formatWhen(when, french) : bill.period ? periodLabel(bill.period, french ? "fr" : "en") : null;
  const title = billLabel(bill);
  return (
    <li className="rounded-[1.25rem] bg-surface p-5 ring-1 ring-border" data-ke="earnings-bill">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title || status}</p>
          {bill.childName?.trim() ? <p className="truncate text-sm text-muted">{bill.childName.trim()}</p> : null}
          {bill.centreName?.trim() ? <p className="truncate text-sm text-muted">{bill.centreName.trim()}</p> : null}
        </div>
        <p className="shrink-0 font-display text-lg tabular-nums">{cad(bill.netCents)}</p>
      </div>
      <p className="mt-2 text-sm text-muted">
        {status}
        {date ? ` · ${date}` : ""}
      </p>
    </li>
  );
}

function formatWhen(iso: string, french: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString(french ? "fr-CA" : "en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function SoftSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden>
      <div className="ke-skeleton h-36 rounded-[1.25rem]" />
      <div className="ke-skeleton h-16 rounded-[1.25rem]" />
    </div>
  );
}

function chartLabel(
  bars: HostEarnings["bars"],
  cad: (cents: number) => string,
  title: string,
  french: boolean,
): string {
  const parts = bars.map((bar) => `${monthTick(bar.period, french)} ${cad(bar.cents)}`);
  return `${title}. ${parts.join(", ")}`;
}
