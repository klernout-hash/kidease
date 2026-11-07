import { useState } from "react";
import { DaycareCard } from "@/components/daycare-card";
import { ListingRail } from "@/components/listing-rail";
import { ChipButton } from "@/components/chip";
import { ChipCarousel } from "@/components/chip-carousel";
import {
  BROWSE_DAYCARE_TYPES,
  BROWSE_RAIL_CAP,
  BROWSE_RAIL_COPY,
  BROWSE_RAIL_PAGE,
  type BrowseDaycareType,
} from "@/components/facility-type-rails";
import { matchesListedDaycareType } from "@/lib/care-type";
import { homeRailItems } from "@/lib/now-loops";
import { matchesFacilityType, type FacilityType } from "@/lib/facility-type";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { localePath } from "@/lib/locale-path";
import { uniqueById } from "@/lib/utils";

function matchesBrowseDaycareType(
  item: { amenities?: string | null; hours?: string | null; name?: string | null; facilityType?: string | null },
  type: BrowseDaycareType,
): boolean {
  if (type === "before_after") return matchesListedDaycareType(item, "before_after");
  return matchesListedDaycareType(item, type);
}

function take(rows: Card[], n = BROWSE_RAIL_CAP) {
  return uniqueById(rows).slice(0, n);
}

export function facilityTypeRailItems(items: Card[], type: FacilityType, n = BROWSE_RAIL_CAP, skipLiveLooking = false): Card[] {
  const pool = skipLiveLooking ? items : homeRailItems(items);
  const byDistance = [...pool].sort((a, b) => a.distanceKm - b.distanceKm);
  return take(
    byDistance.filter((row) => matchesFacilityType(row, type)),
    n,
  );
}

export function browseTypeRailItems(items: Card[], type: BrowseDaycareType, n = BROWSE_RAIL_CAP, skipLiveLooking = false): Card[] {
  if (type !== "before_after") return facilityTypeRailItems(items, type, n, skipLiveLooking);
  const pool = skipLiveLooking ? items : homeRailItems(items);
  const byDistance = [...pool].sort((a, b) => a.distanceKm - b.distanceKm);
  return take(
    byDistance.filter((row) => matchesBrowseDaycareType(row, "before_after")),
    n,
  );
}

function DaycareTypeMenu({
  selected,
  onSelect,
}: {
  selected?: BrowseDaycareType;
  onSelect: (type?: BrowseDaycareType) => void;
}) {
  const { t } = useCopy();
  return (
    <div className="mt-4" data-ke="daycare-type-menu">
      <ChipCarousel arrows={false} label={t("railByCare")} className="ke-daycare-type-menu">
        <ChipButton
          on={!selected}
          aria-pressed={!selected}
          data-browse-type="all"
          onClick={() => onSelect(undefined)}
        >
          {t("catAll")}
        </ChipButton>
        {BROWSE_DAYCARE_TYPES.map((type) => (
          <ChipButton
            key={type}
            on={selected === type}
            aria-pressed={selected === type}
            data-browse-type={type}
            onClick={() => onSelect(selected === type ? undefined : type)}
          >
            {t(BROWSE_RAIL_COPY[type])}
          </ChipButton>
        ))}
      </ChipCarousel>
    </div>
  );
}

/** Canada daycare-type rows. Same six-type menu on Explore and Search. */
export function DaycareTypeRails({
  items,
  rows,
  eagerThumbs = false,
  visual = false,
  labelFar = false,
  skipLiveLooking = false,
  menu = true,
  seeAll = true,
  selected,
  onSelect,
  city,
  ratingFloor,
  /** Search uses one readable column. Explore keeps the horizontal rails. */
  layout = "rails",
}: {
  items?: Card[];
  rows?: Partial<Record<BrowseDaycareType, Card[]>>;
  eagerThumbs?: boolean;
  visual?: boolean;
  /** Name search labels far centres with province and kilometres. */
  labelFar?: boolean;
  /** Home featured rail: show the same centres the chip counted, including incomplete cards. */
  skipLiveLooking?: boolean;
  menu?: boolean;
  /** Home links each row to search. Search itself stays in the row. */
  seeAll?: boolean;
  selected?: BrowseDaycareType;
  onSelect?: (type?: BrowseDaycareType) => void;
  city?: string;
  ratingFloor?: number;
  layout?: "rails" | "stack";
}) {
  const { t, locale } = useCopy();
  const [localType, setLocalType] = useState<BrowseDaycareType | undefined>();
  const active = onSelect ? selected : localType;
  function pick(type?: BrowseDaycareType) {
    if (onSelect) onSelect(type);
    else setLocalType(type);
  }
  const source = items ?? [];
  const resolved: Record<BrowseDaycareType, Card[]> = {
    child_care_centre: rows?.child_care_centre ?? browseTypeRailItems(source, "child_care_centre", BROWSE_RAIL_CAP, skipLiveLooking),
    family_home: rows?.family_home ?? browseTypeRailItems(source, "family_home", BROWSE_RAIL_CAP, skipLiveLooking),
    group_home: rows?.group_home ?? browseTypeRailItems(source, "group_home", BROWSE_RAIL_CAP, skipLiveLooking),
    nursery_preschool: rows?.nursery_preschool ?? browseTypeRailItems(source, "nursery_preschool", BROWSE_RAIL_CAP, skipLiveLooking),
    school_age: rows?.school_age ?? browseTypeRailItems(source, "school_age", BROWSE_RAIL_CAP, skipLiveLooking),
    before_after: rows?.before_after ?? browseTypeRailItems(source, "before_after", BROWSE_RAIL_CAP, skipLiveLooking),
  };
  const kinds = active ? BROWSE_DAYCARE_TYPES.filter((kind) => kind === active) : BROWSE_DAYCARE_TYPES;
  const stackItems = active ? resolved[active] : uniqueById(source);

  if (layout === "stack") {
    return (
      <div data-ke="daycare-type-browse" data-ke-layout="guest-stack">
        {menu ? <DaycareTypeMenu selected={active} onSelect={pick} /> : null}
        {stackItems.length ? (
          <div className="ke-result-stack mt-4" data-ke="guest-search-stack">
            {stackItems.map((item, index) => (
              <DaycareCard
                key={item.id}
                item={item}
                presentation="visual"
                eager={index < 2}
                priority={index === 0}
                labelFar={labelFar}
                ratingFloor={ratingFloor}
              />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("noFacilityTypeResultsLead").replace("{type}", active ? t(BROWSE_RAIL_COPY[active]).toLowerCase() : t("catAll").toLowerCase())}</p>
        )}
      </div>
    );
  }

  return (
    <div data-ke="daycare-type-browse">
      {menu ? <DaycareTypeMenu selected={active} onSelect={pick} /> : null}
      <div data-ke="daycare-type-rails">
        {kinds.map((kind) => {
          const title = t(BROWSE_RAIL_COPY[kind]);
          const row = resolved[kind];
          const forced = active === kind;
          return (
            <ListingRail
              key={kind}
              title={title}
              items={row}
              railId={kind}
              expandable
              pageSize={BROWSE_RAIL_PAGE}
              seeAllHref={
                seeAll
                  ? localePath(
                      `${
                        kind === "before_after" ? "/search?cat=before-after" : `/search?fac=${kind}`
                      }${city?.trim() ? `&q=${encodeURIComponent(city.trim())}` : ""}`,
                      locale,
                    )
                  : undefined
              }
              eagerThumbs={Boolean(eagerThumbs) && kind === kinds[0]}
              visual={visual}
              labelFar={labelFar}
              ratingFloor={ratingFloor}
              persist={forced}
              empty={
                forced && !row.length
                  ? {
                      title,
                      body: t("noFacilityTypeResultsLead").replace("{type}", title.toLowerCase()),
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated alias: Explore home still mounts this name. */
export function FacilityTypeRails(props: {
  items?: Card[];
  rows?: Partial<Record<BrowseDaycareType, Card[]>>;
  eagerThumbs?: boolean;
  visual?: boolean;
  skipLiveLooking?: boolean;
  menu?: boolean;
  seeAll?: boolean;
  selected?: BrowseDaycareType;
  onSelect?: (type?: BrowseDaycareType) => void;
  city?: string;
}) {
  return <DaycareTypeRails {...props} />;
}
