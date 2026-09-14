import { ListingRail } from "@/components/listing-rail";
import {
  EXPLORE_AGE_RAIL_COPY,
  EXPLORE_RAIL_AGES,
  exploreAgeRailItems,
  exploreNearYouItems,
  exploreOpeningsItems,
} from "@/lib/explore-category-rails";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

export function ExploreCategoryRails({
  items,
  onHover,
}: {
  items: Card[];
  onHover?: (slug: string) => void;
}) {
  const { t } = useCopy();
  const nearYou = exploreNearYouItems(items);
  const openings = exploreOpeningsItems(items);

  return (
    <div
      className="min-h-[22rem] pb-8"
      data-ke="explore-category-rails"
      onMouseOver={(e) => {
        const node = (e.target as HTMLElement).closest("[data-slug]");
        const slug = node?.getAttribute("data-slug");
        if (slug) onHover?.(slug);
      }}
    >
      <ListingRail title={t("nearYou")} items={nearYou} railId="near-you" />
      {openings.length ? (
        <ListingRail title={t("openingsRail")} items={openings} railId="openings" />
      ) : null}
      {EXPLORE_RAIL_AGES.map((age) => (
        <ListingRail
          key={age}
          title={t(EXPLORE_AGE_RAIL_COPY[age])}
          items={exploreAgeRailItems(items, age)}
          railId={age}
        />
      ))}
    </div>
  );
}
