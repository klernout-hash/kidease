import { ListingRail } from "@/components/listing-rail";
import {
  EXPLORE_AGE_RAIL_COPY,
  exploreAgeRailItems,
  exploreAgeRailItemsWithFill,
  exploreNearYouItems,
  exploreOpeningsItems,
  exploreRailsToShow,
} from "@/lib/explore-category-rails";
import type { RailAge } from "@/lib/care-type";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";

export function ExploreCategoryRails({
  items,
  directory,
  selectedAges,
  openingsSelected,
  onHover,
}: {
  items: Card[];
  directory?: Card[];
  selectedAges?: readonly RailAge[];
  openingsSelected?: boolean;
  onHover?: (slug: string) => void;
}) {
  const { t } = useCopy();
  const picked = selectedAges ?? [];
  const filtered = picked.length > 0;
  const pool = items;
  const fillPool = directory?.length ? directory : items;
  const nearYou = exploreNearYouItems(pool);
  const openings = exploreOpeningsItems(pool);
  const showOpenings = openingsSelected || (!filtered && openings.length > 0);
  const ages = exploreRailsToShow(picked);

  return (
    <div
      className="ke-explore-rail-stack min-h-[22rem] pb-8"
      data-ke="explore-category-rails"
      data-explore-rails={filtered ? "selected" : "all"}
      onMouseOver={(e) => {
        const node = (e.target as HTMLElement).closest("[data-slug]");
        const slug = node?.getAttribute("data-slug");
        if (slug) onHover?.(slug);
      }}
    >
      <ListingRail title={t("nearYou")} items={nearYou} railId="near-you" persist={filtered} />
      {showOpenings ? (
        <ListingRail
          title={t("openingsRail")}
          items={openings}
          railId="openings"
          persist={openingsSelected}
          empty={
            openingsSelected && !openings.length
              ? { title: t("openingsRail"), body: t("openingsRailEmpty") }
              : undefined
          }
        />
      ) : null}
      {ages.map((age) => {
        const forced = filtered && picked.includes(age);
        const ageItems = forced ? exploreAgeRailItemsWithFill(fillPool, age) : exploreAgeRailItems(items, age);
        return (
          <ListingRail
            key={age}
            title={t(EXPLORE_AGE_RAIL_COPY[age])}
            items={ageItems}
            railId={age}
            persist={forced}
            empty={
              forced && !ageItems.length
                ? {
                    title: t(EXPLORE_AGE_RAIL_COPY[age]),
                    body: t("noFacilityTypeResultsLead").replace(
                      "{type}",
                      t(EXPLORE_AGE_RAIL_COPY[age]).toLowerCase(),
                    ),
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
