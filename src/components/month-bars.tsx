import type { MonthBar } from "@/lib/host-desk";

export function MonthBars({
  bars,
  label,
  compact = false,
}: {
  bars: readonly MonthBar[];
  label: string;
  compact?: boolean;
}) {
  const max = Math.max(...bars.map((bar) => bar.cents), 1);
  return (
    <div
      className={`flex items-end gap-1.5 ${compact ? "h-8" : "mt-4 h-24"}`}
      role="img"
      aria-label={label}
      data-ke="month-bars"
    >
      {bars.map((bar) => {
        const height = bar.cents > 0 ? Math.max(12, Math.round((bar.cents / max) * 100)) : 6;
        return (
          <div key={bar.period} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className={`w-full rounded-t-md ${bar.cents > 0 ? "bg-primary" : "bg-border"}`}
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
