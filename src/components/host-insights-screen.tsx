import { Link } from "@tanstack/react-router";
import { ChevronLeft, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { insightsCardRating, type HostInsights, type WrittenReview } from "@/lib/host-desk";
import { loadHostInsights } from "@/lib/server/host-desk";
import { useCopy } from "@/lib/use-copy";

export function HostInsightsScreen() {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const [data, setData] = useState<HostInsights | null>(null);

  useEffect(() => {
    let live = true;
    void loadHostInsights()
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => {
        if (live) {
          setData({
            ok: false,
            listingRatingX10: null,
            listingReviewCount: null,
            parentRatingX10: null,
            parentReviewCount: null,
            reviews: [],
            viewCount: null,
            requestCount: null,
            tourCount: null,
          });
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const headline = data?.ok ? insightsCardRating(data) : null;
  const hasWritten = Boolean(data?.ok && data.reviews.length);
  const noReviews = data?.ok && !headline && !hasWritten;

  return (
    <main className="ke-gutter mx-auto w-full max-w-lg pb-8 pt-4" data-ke="host-insights">
      <div className="flex items-center gap-2">
        <Link
          to="/menu"
          aria-label={t("back")}
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg touch-manipulation hover:bg-surface"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <h1 className="font-display text-2xl">{t("insightsTitle")}</h1>
      </div>

      {data == null ? <div className="mt-6 h-36 rounded-2xl bg-surface ring-1 ring-border" aria-hidden /> : null}

      {data && !data.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}

      {data?.ok ? (
        <>
          {noReviews ? (
            <div className="mt-6 rounded-2xl bg-surface p-2 ring-1 ring-border">
              <EmptyState title={t("insightsEmptyTitle")} body={t("insightsEmptyBody")} />
            </div>
          ) : null}

          {typeof data.listingRatingX10 === "number" &&
          data.listingRatingX10 > 0 &&
          typeof data.listingReviewCount === "number" &&
          data.listingReviewCount > 0 ? (
            <RatingBlock
              label={t("insightsListingRating")}
              ratingX10={data.listingRatingX10}
              count={data.listingReviewCount}
              marker="listing-rating"
            />
          ) : null}

          {typeof data.parentRatingX10 === "number" &&
          data.parentRatingX10 > 0 &&
          typeof data.parentReviewCount === "number" &&
          data.parentReviewCount > 0 ? (
            <RatingBlock
              label={t("insightsParentReviews")}
              ratingX10={data.parentRatingX10}
              count={data.parentReviewCount}
              marker="parent-rating"
            />
          ) : null}

          <ActivityCounts data={data} />

          {hasWritten || headline ? (
            <section className="mt-8" data-ke="insights-recent">
              <h2 className="font-display text-xl">{t("insightsRecent")}</h2>
              {data.reviews.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("insightsNoWritten")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} french={french} />
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function RatingBlock({
  label,
  ratingX10,
  count,
  marker,
}: {
  label: string;
  ratingX10: number;
  count: number;
  marker: string;
}) {
  return (
    <section className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke={marker}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 flex items-center gap-1.5 font-display text-3xl tabular-nums">
        <Star className="size-6 fill-current text-primary" aria-hidden />
        {(ratingX10 / 10).toFixed(1)}
        <span className="text-base font-medium text-muted">({count})</span>
      </p>
    </section>
  );
}

function ActivityCounts({ data }: { data: HostInsights }) {
  const { t } = useCopy();
  const items = [
    data.viewCount == null ? null : { id: "views", label: t("insightsViews"), value: data.viewCount, to: null },
    data.requestCount == null
      ? null
      : { id: "requests", label: t("insightsRequests"), value: data.requestCount, to: "requests" as const },
    data.tourCount == null ? null : { id: "tours", label: t("insightsTours"), value: data.tourCount, to: "requests" as const },
  ].filter((item) => item != null);
  if (!items.length) return null;
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3" data-ke="insights-counts">
      {items.map((item) => {
        const body = (
          <>
            <span className="text-sm text-muted">{item.label}</span>
            <span className="mt-1 block font-display text-2xl tabular-nums">{item.value}</span>
          </>
        );
        return (
          <li key={item.id}>
            {item.to ? (
              <Link
                to="/provider"
                search={{ desk: item.to }}
                className="block min-h-20 rounded-2xl bg-surface p-4 ring-1 ring-border touch-manipulation"
                data-ke={`insights-${item.id}`}
              >
                {body}
              </Link>
            ) : (
              <div className="min-h-20 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke={`insights-${item.id}`}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ReviewCard({ review, french }: { review: WrittenReview; french: boolean }) {
  const text = french && review.bodyFr.trim() ? review.bodyFr.trim() : review.body.trim();
  const when = formatWhen(review.createdAt, french);
  return (
    <li className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="insights-review">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium">{review.author}</p>
        <p className="flex shrink-0 items-center gap-1 text-sm tabular-nums">
          <Star className="size-3.5 fill-current text-primary" aria-hidden />
          {review.rating}
        </p>
      </div>
      {review.centreName?.trim() ? <p className="mt-1 truncate text-sm text-muted">{review.centreName.trim()}</p> : null}
      {text ? <p className="mt-2 text-sm leading-5">{text}</p> : null}
      {when ? <p className="mt-2 text-xs text-muted">{when}</p> : null}
    </li>
  );
}

function formatWhen(iso: string, french: boolean): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(french ? "fr-CA" : "en-CA", { month: "short", day: "numeric", year: "numeric" });
}
