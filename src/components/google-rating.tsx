import { Star } from "lucide-react";
import { googleReviewsUrl, type GoogleBits } from "@/lib/google-reviews";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function GoogleStars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.min(1, Math.max(0, rating - (n - 1)));
        const width = fill >= 0.75 ? "w-full" : fill >= 0.25 ? "w-1/2" : "w-0";
        return (
          <span key={n} className="relative inline-block size-3.5 shrink-0">
            <Star className="size-3.5 text-subtle" />
            <span className={cn("absolute inset-y-0 left-0 overflow-hidden", width)}>
              <Star className="size-3.5 fill-primary text-primary" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function GoogleRating({
  item,
  ratingX10,
  reviewCount,
  compact = false,
  asButton = false,
}: {
  item: GoogleBits;
  ratingX10: number;
  reviewCount: number;
  compact?: boolean;
  asButton?: boolean;
}) {
  const { t } = useCopy();
  if (ratingX10 <= 0 || reviewCount <= 0) return null;
  const rating = ratingX10 / 10;
  const href = googleReviewsUrl(item);
  const label = `${rating.toFixed(1)} · ${reviewCount} ${t("reviews")} · ${t("googleReviews")}`;
  const inner = (
    <>
      <GoogleStars rating={rating} />
      <span className="tabular-nums font-medium">{rating.toFixed(1)}</span>
      {compact ? (
        <span className="text-muted">({reviewCount})</span>
      ) : (
        <span className="text-muted">
          · {reviewCount} {t("reviews")}
        </span>
      )}
    </>
  );
  const cls = "inline-flex items-center gap-1 text-sm hover:underline";
  if (asButton) {
    return (
      <button
        type="button"
        className={cls}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(href, "_blank", "noopener,noreferrer");
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={label} onClick={(e) => e.stopPropagation()}>
      {inner}
    </a>
  );
}
