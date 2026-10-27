import { monthTick } from "@/lib/host-desk";
import type { MonthBucket } from "@/lib/earnings-desk";

export function PerformanceBars({
  bars,
  showUpcoming,
  label,
  french,
}: {
  bars: readonly MonthBucket[];
  showUpcoming: boolean;
  label: string;
  french: boolean;
}) {
  const totals = bars.map((bar) => (bar.paidCents ?? 0) + (showUpcoming ? (bar.upcomingCents ?? 0) : 0));
  const max = Math.max(...totals, 1);
  return (
    <div className="mt-4" data-ke="earnings-bars">
      <div className="flex h-28 items-end gap-1.5" role="img" aria-label={label}>
        {bars.map((bar, index) => {
          const paid = Math.max(0, bar.paidCents ?? 0);
          const upcoming = showUpcoming ? Math.max(0, bar.upcomingCents ?? 0) : 0;
          const paidHeight = paid > 0 ? Math.max(8, Math.round((paid / max) * 100)) : 0;
          const upHeight = upcoming > 0 ? Math.max(8, Math.round((upcoming / max) * 100)) : 0;
          return (
            <div key={bar.period} className="flex h-full min-w-0 flex-1 items-end">
              <div className="flex h-full w-full flex-col justify-end gap-0.5">
                {upHeight > 0 ? (
                  <div
                    className="ke-bar-grow w-full rounded-t-md border-2 border-primary bg-transparent"
                    style={{ height: `${upHeight}%`, animationDelay: `${index * 45}ms` }}
                  />
                ) : null}
                <div
                  className={`ke-bar-grow w-full ${paid > 0 ? "bg-primary" : "bg-border"} ${upHeight > 0 ? "" : "rounded-t-md"}`}
                  style={{ height: `${paid > 0 ? paidHeight : upHeight > 0 ? 0 : 6}%`, animationDelay: `${index * 45}ms` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {bars.map((bar) => (
          <span key={bar.period} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">
            {monthTick(bar.period, french)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EarningsLine({
  thisYear,
  lastYear,
  label,
  french,
}: {
  thisYear: readonly MonthBucket[];
  lastYear: readonly MonthBucket[];
  label: string;
  french: boolean;
}) {
  const values = [...thisYear, ...lastYear].map((bar) => bar.paidCents ?? 0);
  const max = Math.max(...values, 1);
  const point = (bars: readonly MonthBucket[], index: number) => {
    const x = bars.length <= 1 ? 8 : 8 + (index * 304) / (bars.length - 1);
    const y = 108 - ((bars[index]?.paidCents ?? 0) / max) * 92;
    return `${x},${y}`;
  };
  return (
    <div className="mt-4" data-ke="earnings-line">
      <svg viewBox="0 0 320 120" className="h-28 w-full" role="img" aria-label={label}>
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth="2"
          strokeDasharray="4 4"
          points={lastYear.map((_, index) => point(lastYear, index)).join(" ")}
        />
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth="2.5"
          points={thisYear.map((_, index) => point(thisYear, index)).join(" ")}
        />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{monthTick(thisYear[0]?.period || "", french)}</span>
        <span>{monthTick(thisYear[thisYear.length - 1]?.period || "", french)}</span>
      </div>
    </div>
  );
}
