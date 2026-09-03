import { useMemo } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { ListingRail } from "@/components/listing-rail";
import { uniqueById } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";

function take(rows: Card[], n = 12) {
  return uniqueById(rows).slice(0, n);
}

export function ExploreRails({
  items,
  onHover,
}: {
  items: Card[];
  onHover?: (slug: string) => void;
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";

  const rows = useMemo(() => {
    const priority = take(
      items.filter((r) => r.priority).sort((a, b) => a.distanceKm - b.distanceKm),
    );
    const closest = take([...items].sort((a, b) => a.distanceKm - b.distanceKm));
    const spots = take(
      items
        .filter((r) => (r.live || r.availabilityKnown) && r.spotsTotal > 0)
        .sort((a, b) => b.spotsTotal - a.spotsTotal || a.distanceKm - b.distanceKm),
    );
    const ratings = take(
      items
        .filter((r) => r.ratingX10 > 0 && r.reviewCount > 0)
        .sort((a, b) => b.ratingX10 - a.ratingX10 || b.reviewCount - a.reviewCount),
    );
    const ages = take(
      items
        .filter((r) => Boolean(r.agesKnown) && r.ageMaxMonths > r.ageMinMonths)
        .sort((a, b) => a.ageMinMonths - b.ageMinMonths || a.ageMaxMonths - b.ageMaxMonths),
    );
    return { priority, closest, spots, ratings, ages };
  }, [items]);

  if (!items.length) return null;

  return (
    <div
      className="pb-8"
      onMouseOver={(e) => {
        const node = (e.target as HTMLElement).closest("[data-slug]");
        const slug = node?.getAttribute("data-slug");
        if (slug) onHover?.(slug);
      }}
    >
      <ListingRail title={fr ? "Réservations prioritaires" : "Priority Bookings"} items={rows.priority} />
      <ListingRail title={fr ? "Plus proches" : "Closest Proximity"} items={rows.closest} />
      <ListingRail title={fr ? "Places disponibles" : "Spots Available"} items={rows.spots} />
      <ListingRail title={fr ? "Mieux notées" : "Ratings"} items={rows.ratings} />
      <ListingRail title={fr ? "Âges acceptés" : "Childcare Ages"} items={rows.ages} />
    </div>
  );
}
