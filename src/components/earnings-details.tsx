import { useMemo, useState } from "react";
import { EarningsHeader } from "@/components/earnings-header";
import { EarningsLine, PerformanceBars } from "@/components/earnings-bars";
import { EmptyState } from "@/components/empty-state";
import { bucketTotal, yearBuckets, type EarningsResult, type MonthBucket } from "@/lib/earnings-desk";
import { monthTick } from "@/lib/host-desk";
import { currentPeriod, periodLabel } from "@/lib/stripe-methods";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useCopy } from "@/lib/use-copy";

export function EarningsDetailsScreen({ desk }: { desk: EarningsResult | null }) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const now = useMemo(() => new Date(), []);
  const [yearOffset, setYearOffset] = useState<0 | 1>(0);
  const [chart, setChart] = useState<"bar" | "line">("bar");
  const [showFuture, setShowFuture] = useState(true);
  const year = now.getFullYear() - yearOffset;
  const months = desk?.ok ? yearBuckets(desk.byMonth, year) : [];
  const visible = showFuture ? months : months.filter((month) => month.period <= currentPeriod(now));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = visible.find((month) => month.period === picked) ?? visible.find((month) => month.period === currentPeriod(now)) ?? visible[visible.length - 1];
  const statement = desk?.ok ? desk.statements.find((item) => item.period === selected?.period) : null;
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const paid = selected?.paidCents ?? null;
  const upcoming = showFuture ? (selected?.upcomingCents ?? null) : null;
  const total = bucketTotal(selected, showFuture);

  if (!desk?.ok) {
    return (
      <main className="ke-gutter mx-auto w-full max-w-lg pb-10 pt-4" data-ke="earnings-details">
        <EarningsHeader title={t("earningsTitle")} back={{ screen: "earnings" }} />
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      </main>
    );
  }

  const thisYear = yearBuckets(desk.byMonth, now.getFullYear());
  const lastYear = yearBuckets(desk.byMonth, now.getFullYear() - 1);

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-10 pt-4" data-ke="earnings-details">
      <EarningsHeader title={t("earningsTitle")} back={{ screen: "earnings" }} />
      <label className="mt-5 block text-sm text-muted" htmlFor="earnings-year">
        {t("earningsMonthlyView")}
      </label>
      <select
        id="earnings-year"
        value={String(yearOffset)}
        onChange={(event) => setYearOffset(event.target.value === "1" ? 1 : 0)}
        className="mt-1 min-h-11 w-full rounded-full border border-border bg-surface px-4 text-sm"
      >
        <option value="0">{t("earningsThisYear")}</option>
        <option value="1">{t("earningsLastYear")}</option>
      </select>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-full bg-surface-2 p-1" role="group" aria-label={t("earningsMonthlyView")}>
        <Toggle pressed={chart === "bar"} onClick={() => setChart("bar")} label={t("earningsBars")} />
        <Toggle pressed={chart === "line"} onClick={() => setChart("line")} label={t("earningsLine")} />
      </div>
      {chart === "bar" ? (
        <PerformanceBars bars={visible} showUpcoming={showFuture} french={french} label={barLabel(visible, showFuture, cad, french)} />
      ) : (
        <EarningsLine
          thisYear={thisYear}
          lastYear={lastYear}
          french={french}
          label={`${t("earningsThisYear")} ${t("earningsLastYear")}`}
        />
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-primary" aria-hidden />
          {chart === "line" ? t("earningsThisYear") : t("earningsPaid")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${chart === "line" ? "border-2 border-muted" : "border-2 border-primary"}`} aria-hidden />
          {chart === "line" ? t("earningsLastYear") : t("earningsUpcoming")}
        </span>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" data-ke="earnings-months">
        {visible.map((month) => (
          <button
            key={month.period}
            type="button"
            aria-pressed={month.period === selected?.period}
            onClick={() => setPicked(month.period)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium touch-manipulation ${month.period === selected?.period ? "bg-fg text-bg" : "bg-surface"}`}
          >
            {monthTick(month.period, french)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm" data-ke="earnings-month-summary">
        <Summary label={t("earningsPaid")} value={paid == null ? null : cad(paid)} />
        <Summary label={t("earningsUpcoming")} value={upcoming == null ? null : cad(upcoming)} />
        <Summary label={t("earningsNet")} value={total == null ? null : cad(total)} />
      </div>
      <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
        <span id="future-earnings" className="text-sm">
          {t("earningsFuture")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={showFuture}
          aria-labelledby="future-earnings"
          data-ke="earnings-future"
          onClick={() => setShowFuture((value) => !value)}
          className={`relative h-7 w-12 rounded-full touch-manipulation ${showFuture ? "bg-fg" : "bg-border"}`}
        >
          <span className={`absolute top-0.5 size-6 rounded-full bg-bg ${showFuture ? "end-0.5" : "start-0.5"}`} />
        </button>
      </div>
      <details className="mt-4 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border" data-ke="earnings-paid-breakdown">
        <summary className="min-h-11 cursor-pointer font-medium">{t("earningsPaidBreakdown")}</summary>
        <Breakdown
          rows={[
            [t("earningsGross"), selected?.paidGrossCents ?? null],
            [t("earningsServiceFee"), selected?.paidFeeCents == null ? null : -selected.paidFeeCents],
            [t("earningsNet"), selected?.paidCents ?? null],
          ]}
          cad={cad}
          empty={t("earningsPaidEmpty")}
        />
      </details>
      <details className="mt-3 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border" data-ke="earnings-stats">
        <summary className="min-h-11 cursor-pointer font-medium">{t("earningsStats")}</summary>
        {statement ? (
          <ul className="mt-2 space-y-2 text-sm">
            {statement.daysAttended != null ? <li>{t("earningsDaysAttended")}: {statement.daysAttended}</li> : null}
            {statement.enrolledChildren != null ? <li>{t("earningsEnrolled")}: {statement.enrolledChildren}</li> : null}
            {statement.tours != null ? <li>{t("insightsTours")}: {statement.tours}</li> : null}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{t("earningsPaidEmpty")}</p>
        )}
      </details>
      {selected ? <p className="mt-3 text-sm text-muted">{periodLabel(selected.period, french ? "fr" : "en")}</p> : null}
    </main>
  );
}

function Toggle({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 rounded-full text-sm font-semibold touch-manipulation ${pressed ? "bg-bg text-fg shadow-sm" : "text-muted"}`}
    >
      {label}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string | null }) {
  if (!value) return <p className="text-muted">{label}</p>;
  return (
    <p>
      <span className="block text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </p>
  );
}

function Breakdown({
  rows,
  cad,
  empty,
}: {
  rows: Array<[string, number | null]>;
  cad: (cents: number) => string;
  empty: string;
}) {
  const shown = rows.filter((row) => row[1] != null) as Array<[string, number]>;
  if (!shown.length) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {shown.map(([label, cents]) => (
        <li key={label} className="flex justify-between gap-3">
          <span>{label}</span>
          <span className="tabular-nums">{cad(cents)}</span>
        </li>
      ))}
    </ul>
  );
}

function barLabel(bars: readonly MonthBucket[], showUpcoming: boolean, cad: (cents: number) => string, french: boolean): string {
  return bars
    .map((bar) => {
      const total = bucketTotal(bar, showUpcoming);
      return `${monthTick(bar.period, french)} ${total == null ? "" : cad(total)}`.trim();
    })
    .join(", ");
}
