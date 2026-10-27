import { Link } from "@tanstack/react-router";
import { Star, Utensils, Sun, Trees, Sparkles, type LucideIcon } from "lucide-react";
import { ListingPhotoFallback } from "@/components/building-photo";
import { amenityLabel } from "@/lib/amenities";
import type { WrittenReview } from "@/lib/host-desk";
import type { ProfileListingCard } from "@/lib/profile-desk";
import { useCopy } from "@/lib/use-copy";

const FEATURE_ICON: Record<string, LucideIcon> = {
  meals: Utensils,
  outdoor: Sun,
  yard: Trees,
  nature: Trees,
  park: Trees,
};

export function ProfileDeskExtras({
  listings,
  reviews,
}: {
  listings: readonly ProfileListingCard[];
  reviews: readonly WrittenReview[];
}) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const features = listings.flatMap((listing) => listing.features).filter((key, index, all) => all.indexOf(key) === index).slice(0, 8);
  const licensed = listings.some((listing) => listing.licensed);

  return (
    <div data-ke="profile-desk" data-licensed={licensed ? "1" : undefined}>
      {reviews.length ? (
        <section className="mt-8" data-ke="profile-reviews">
          <h2 className="font-display text-xl">{t("insightsRecent")}</h2>
          <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {reviews.map((review) => {
              const text = french && review.bodyFr.trim() ? review.bodyFr.trim() : review.body.trim();
              return (
                <li key={review.id} className="w-[16rem] shrink-0 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border" data-ke="profile-review">
                  <p className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{review.author}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums">
                      <Star className="size-3.5 fill-current text-primary" aria-hidden />
                      {review.rating}
                    </span>
                  </p>
                  {text ? <p className="mt-2 line-clamp-4 text-sm leading-5">{text}</p> : null}
                </li>
              );
            })}
          </ul>
          <Link
            to="/menu"
            search={{ screen: "insights" }}
            data-ke="profile-more-reviews"
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-fg px-4 text-sm font-semibold touch-manipulation"
          >
            {t("profileShowMoreReviews")}
          </Link>
        </section>
      ) : null}

      {features.length ? (
        <section className="mt-8" data-ke="profile-features">
          <h2 className="font-display text-xl">{t("amenities")}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {features.map((key) => {
              const Icon = FEATURE_ICON[key] ?? Sparkles;
              return (
                <li key={key} className="flex min-h-14 items-center gap-2 rounded-[1.25rem] bg-surface px-3 py-2 ring-1 ring-border">
                  <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 text-sm leading-snug">{amenityLabel(key, french ? "fr" : "en")}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {listings.length ? (
        <section className="mt-8" data-ke="profile-listings">
          <h2 className="font-display text-xl">{t("profileListings")}</h2>
          <ul className="mt-3 space-y-3">
            {listings.map((listing) => (
              <li key={listing.id}>
                <Link
                  to="/daycare/$slug"
                  params={{ slug: listing.slug }}
                  className="ke-press flex min-h-20 items-center gap-3 rounded-[1.25rem] bg-surface p-3 ring-1 ring-border touch-manipulation"
                  data-ke="profile-listing"
                >
                  {listing.photo ? (
                    <img src={listing.photo} alt="" width={72} height={72} className="size-[4.5rem] shrink-0 rounded-xl object-cover" />
                  ) : (
                    <ListingPhotoFallback quiet className="size-[4.5rem] shrink-0 rounded-xl" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{listing.name}</span>
                    {listing.city ? <span className="block truncate text-sm text-muted">{listing.city}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
