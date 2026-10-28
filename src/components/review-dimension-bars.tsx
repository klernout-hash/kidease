import { Link } from "@tanstack/react-router";
import { REVIEW_DIMENSIONS, reviewDimensionBars, type ReviewDimensionId } from "@/lib/review-dimensions";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

export function ReviewDimensionBars({
  reviews,
  slug,
  signedIn,
}: {
  reviews: Array<{ dimensions?: Partial<Record<ReviewDimensionId, number>> | null } | object>;
  slug: string;
  signedIn: boolean;
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const bars = reviewDimensionBars(
    reviews.map((review) => {
      if (!review || typeof review !== "object") return {};
      const row = review as { rating?: number; dimensions?: Partial<Record<ReviewDimensionId, number>> | null };
      return { rating: row.rating, dimensions: row.dimensions };
    }),
  );
  const login = localePath("/login", locale);
  const next = localePath(`/daycare/${slug}`, locale);

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80" data-ke="review-dimensions">
      <h3 className="text-sm font-semibold">{fr ? "Cinq points, parents vérifiés" : "Five scores from verified parents"}</h3>
      <ul className="mt-3 space-y-3">
        {bars.map((bar) => {
          const label = REVIEW_DIMENSIONS.find((dim) => dim.id === bar.id);
          const width = bar.average == null ? 0 : (bar.average / 5) * 100;
          return (
            <li key={bar.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{fr ? label?.fr : label?.en}</span>
                <span className="tabular-nums text-muted">{bar.average == null ? (fr ? "Pas encore noté" : "Not rated yet") : bar.average.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {signedIn ? null : (
        <p className="mt-3 text-sm">
          <Link to={login} search={{ next, role: "parent", desk: "parent", intent: "in" }} className="font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Écrire un avis" : "Write a review"}
          </Link>
        </p>
      )}
    </div>
  );
}
