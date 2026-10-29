import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CountUp } from "@/components/count-up";
import { EarningsHeader } from "@/components/earnings-header";
import { PerformanceBars } from "@/components/earnings-bars";
import { EmptyState } from "@/components/empty-state";
import { KidBlocks } from "@/components/kid-art";
import { formatEarnDate, type EarnBill, type EarningsResult } from "@/lib/earnings-desk";
import { monthTick } from "@/lib/host-desk";
import { loadEarningsDesk } from "@/lib/server/earnings-desk";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useMounted } from "@/lib/use-mounted";
import { useCopy } from "@/lib/use-copy";

export function HostEarningsScreen({ initial }: { initial?: EarningsResult | null }) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const mounted = useMounted();
  const [data, setData] = useState<EarningsResult | null>(initial ?? null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    void loadEarningsDesk()
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => {
        if (live) setData({ ok: false });
      });
    return () => {
      live = false;
    };
  }, [initial]);

  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const desk = data?.ok ? data : null;
  const showChart = Boolean(desk?.bars.some((bar) => (bar.paidCents ?? 0) > 0 || (bar.upcomingCents ?? 0) > 0));
  const empty = Boolean(desk && desk.paid.length === 0 && desk.upcoming.length === 0 && !showChart);

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-10 pt-4" data-ke="host-earnings">
      <EarningsHeader title={t("earningsTitle")} back={{}} gear />

      {data == null && mounted ? <SoftSkeleton /> : null}

      {data && !data.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}

      {desk && empty ? (
        <div className="mt-6 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border">
          <EmptyState
            title={t("earningsEmptyTitle")}
            body={t("earningsEmptyBody")}
            art={<KidBlocks className="mx-auto h-20 w-32 text-primary" />}
          />
        </div>
      ) : null}

      {desk && !empty ? (
        <>
          <section className="mt-6 rounded-[1.25rem] bg-surface-2 p-5" data-ke="earnings-performance">
            <p className="text-sm text-muted">{t("earningsThisMonth")}</p>
            {desk.thisMonthTotalCents == null ? (
              <p className="mt-2 font-display text-2xl">{t("earningsNoneThisMonth")}</p>
            ) : (
              <CountUp value={desk.thisMonthTotalCents} format={cad} className="mt-2 block font-display text-4xl tabular-nums" />
            )}
            {showChart ? (
              <PerformanceBars
                bars={desk.bars}
                showUpcoming
                french={french}
                label={chartLabel(desk.bars, cad, t("earningsByMonth"), french)}
              />
            ) : null}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Legend swatch="solid" label={t("earningsPaid")} amount={desk.thisMonthPaidCents == null ? null : cad(desk.thisMonthPaidCents)} />
              <Legend
                swatch="hollow"
                label={t("earningsUpcoming")}
                amount={desk.thisMonthUpcomingCents == null ? null : cad(desk.thisMonthUpcomingCents)}
              />
            </div>
            <Link
              to="/menu"
              search={{ screen: "earnings", view: "details" }}
              data-ke="earnings-view-details"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
            >
              {t("earningsViewDetails")}
            </Link>
          </section>

          <BillStrip
            title={t("earningsUpcoming")}
            empty={t("earningsUpcomingEmpty")}
            action={t("earningsViewUpcoming")}
            view="upcoming"
            bills={desk.upcoming.slice(0, 3)}
            status={t("earningsScheduled")}
            cad={cad}
            french={french}
            marker="earnings-upcoming"
          />
          <BillStrip
            title={t("earningsPaid")}
            empty={t("earningsPaidEmpty")}
            action={t("earningsViewPaid")}
            view="paid"
            bills={desk.paid.slice(0, 3)}
            status={t("earningsSent")}
            cad={cad}
            french={french}
            marker="earnings-paid"
          />

          <section className="mt-8" data-ke="earnings-reports">
            <h2 className="font-display text-xl">{t("statementsTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("statementsLead")}</p>
            <Link
              to="/menu"
              search={{ screen: "earnings", view: "statement" }}
              data-ke="earnings-view-statements"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
            >
              {t("statementsViewAll")}
            </Link>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Legend({ swatch, label, amount }: { swatch: "solid" | "hollow"; label: string; amount: string | null }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2">
      <span
        className={`size-2.5 rounded-full ${swatch === "solid" ? "bg-primary" : "border-2 border-primary bg-transparent"}`}
        aria-hidden
      />
      <span>
        {label}
        {amount ? <span className="ml-1 tabular-nums">{amount}</span> : null}
      </span>
    </span>
  );
}

function BillStrip({
  title,
  empty,
  action,
  view,
  bills,
  status,
  cad,
  french,
  marker,
}: {
  title: string;
  empty: string;
  action: string;
  view: "upcoming" | "paid";
  bills: EarnBill[];
  status: string;
  cad: (cents: number) => string;
  french: boolean;
  marker: string;
}) {
  return (
    <section className="mt-8" data-ke={marker}>
      <h2 className="font-display text-xl">{title}</h2>
      {bills.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {bills.map((bill) => (
            <li key={bill.id} className="w-64 shrink-0">
              <Link
                to="/menu"
                search={{ screen: "earnings", view, bill: bill.id }}
                data-ke="earnings-bill"
                className="ke-press block rounded-[1.25rem] bg-surface p-4 ring-1 ring-border touch-manipulation"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-muted">{formatEarnDate(bill.paidAt || bill.dueAt || bill.payoutOn, french) || ""}</p>
                  <p className="font-display text-lg tabular-nums">{bill.netCents == null ? "" : cad(bill.netCents)}</p>
                </div>
                <p className="mt-1 text-sm">{status}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Face name={bill.parentName} image={bill.parentImage} />
                  <div className="min-w-0 flex-1">
                    {bill.parentName ? <p className="truncate text-sm font-medium">{bill.parentName}</p> : null}
                    {bill.childName ? <p className="truncate text-sm text-muted">{bill.childName}</p> : null}
                  </div>
                  <Thumb name={bill.centreName} image={bill.centrePhoto} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {bills.length > 0 ? (
        <Link
          to="/menu"
          search={{ screen: "earnings", view }}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-fg px-4 text-sm font-semibold touch-manipulation"
        >
          {action}
        </Link>
      ) : null}
    </section>
  );
}

function Face({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return <img src={image} alt={name || ""} width={40} height={40} className="size-10 rounded-full object-cover" />;
  }
  const letter = name?.trim().slice(0, 1);
  if (!letter) return null;
  return (
    <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-sm font-semibold" aria-hidden>
      {letter}
    </span>
  );
}

function Thumb({ name, image }: { name: string | null; image: string | null }) {
  if (!image) return null;
  return <img src={image} alt={name || ""} width={40} height={40} className="size-10 rounded-lg object-cover" />;
}

function SoftSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden>
      <div className="ke-skeleton h-44 rounded-[1.25rem]" />
      <div className="ke-skeleton h-28 rounded-[1.25rem]" />
    </div>
  );
}

function chartLabel(
  bars: readonly { period: string; paidCents: number | null; upcomingCents: number | null }[],
  cad: (cents: number) => string,
  title: string,
  french: boolean,
): string {
  const parts = bars.map((bar) => {
    const paid = bar.paidCents == null ? "" : cad(bar.paidCents);
    const upcoming = bar.upcomingCents == null ? "" : cad(bar.upcomingCents);
    return `${monthTick(bar.period, french)} ${paid} ${upcoming}`.trim();
  });
  return `${title}. ${parts.join(", ")}`;
}
