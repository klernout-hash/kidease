import { tourCountLabels, type TourCountSummary } from "@/lib/tour-counts";

/** The same three labels on every screen that counts tours. */
export function TourCountSummary({ counts, locale }: { counts: TourCountSummary; locale: string }) {
  const labels = tourCountLabels(locale);
  const rows = [
    ["openRequests", counts.openRequests, labels.openRequests],
    ["bookedSeats", counts.bookedSeats, labels.bookedSeats],
    ["postedTimes", counts.postedTimes, labels.postedTimes],
  ] as const;
  return (
    <div data-ke="tour-counts">
      <dl className="grid gap-2 sm:grid-cols-3">
        {rows.map(([key, value, label]) => (
          <div key={key} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-border">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">{labels.meaning}</p>
    </div>
  );
}
