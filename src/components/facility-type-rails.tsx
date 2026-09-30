import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ListingRail } from "@/components/listing-rail";
import { ChipButton } from "@/components/chip";
import { ChipCarousel } from "@/components/chip-carousel";
import type { CopyKey } from "@/lib/copy";
import { matchesListedDaycareType } from "@/lib/care-type";
import { classifyFacilityType, FACILITY_TYPES, matchesFacilityType, type FacilityType } from "@/lib/facility-type";
import { homeRailItems } from "@/lib/now-loops";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { uniqueById } from "@/lib/utils";

export const FACILITY_RAIL_COPY: Record<FacilityType, CopyKey> = {
  child_care_centre: "railDaycareCentres",
  nursery_preschool: "railNursery",
  family_home: "railHome",
  group_home: "railGroupHome",
  school_age: "railSchool",
};

/** Licensed facility classes, then before-and-after programs that are not already school-age. */
export const BROWSE_DAYCARE_TYPES = [...FACILITY_TYPES, "before_after"] as const;
export type BrowseDaycareType = (typeof BROWSE_DAYCARE_TYPES)[number];

export const BROWSE_RAIL_COPY: Record<BrowseDaycareType, CopyKey> = {
  ...FACILITY_RAIL_COPY,
  before_after: "catBeforeAfter",
};

/** First screen of a row. Further centres stay behind the show-more card. */
export const BROWSE_RAIL_PAGE = 12;
/** Enough for several in-row pages without mounting the whole city. */
export const BROWSE_RAIL_CAP = 96;

function take(rows: Card[], n = BROWSE_RAIL_CAP) {
  return uniqueById(rows).slice(0, n);
}

export function isBrowseDaycareType(value: string): value is BrowseDaycareType {
  return (BROWSE_DAYCARE_TYPES as readonly string[]).includes(value);
}

/** Search URL for one of the six header types. Keeps the city when one is already chosen. */
export function browseTypeSearch(
  type: BrowseDaycareType,
  city?: string,
): { fac: BrowseDaycareType; q?: string } | { cat: "before-after"; q?: string } {
  const q = city?.trim();
  if (type === "before_after") return q ? { cat: "before-after", q } : { cat: "before-after" };
  return q ? { fac: type, q } : { fac: type };
}

export function selectedBrowseType(search: unknown): BrowseDaycareType | undefined {
  const bag: Record<string, unknown> =
    typeof search === "string"
      ? Object.fromEntries(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search))
      : search && typeof search === "object"
        ? (search as Record<string, unknown>)
        : {};
  const fac = typeof bag.fac === "string" ? bag.fac : "";
  if (fac && !fac.includes(",") && isBrowseDaycareType(fac) && fac !== "before_after") return fac;
  if (bag.cat === "before-after") return "before_after";
  return undefined;
}

export function matchesBrowseDaycareType(
  item: { amenities?: string | null; hours?: string | null; name?: string | null; facilityType?: string | null },
  type: BrowseDaycareType,
): boolean {
  if (type === "before_after") return matchesListedDaycareType(item, "before_after");
  return matchesListedDaycareType(item, type);
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

const CARE_TYPE_EMOJI: Record<BrowseDaycareType, string> = {
  child_care_centre: "🏫",
  family_home: "🏡",
  group_home: "🏘️",
  nursery_preschool: "🧸",
  school_age: "🎒",
  before_after: "🌅",
};

/** Six licensed childcare types, in daycare-type order, for the home header row. */
export function HomeCareTypeRow({
  selected,
  onSelect,
  compact = false,
  toSearch = false,
  city,
}: {
  selected?: BrowseDaycareType;
  onSelect: (type?: BrowseDaycareType) => void;
  /** Header size. Same six types, tighter so they sit on one line. */
  compact?: boolean;
  /** Header tabs open /search?fac= or ?cat=before-after. */
  toSearch?: boolean;
  /** Current city, kept on the category URL. */
  city?: string;
}) {
  const { t } = useCopy();
  return (
    <div
      className={`flex w-full min-w-0 justify-start overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] lg:[justify-content:safe_center] [&::-webkit-scrollbar]:hidden ${
        compact ? "gap-1 px-0.5" : "gap-1 pb-1"
      }`}
      data-ke="home-care-types"
      role="tablist"
      aria-label={t("railByCare")}
    >
      {BROWSE_DAYCARE_TYPES.map((type) => {
        const on = selected === type;
        const className =
          compact
            ? `flex min-h-11 w-max max-w-none shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1 text-center transition-colors duration-150 ease-out ${
                on ? "text-fg" : "text-muted hover:bg-surface hover:text-fg"
              }`
            : `flex w-max max-w-none shrink-0 flex-col items-center gap-1.5 rounded-xl px-2.5 pb-2 pt-1.5 text-center transition-colors duration-150 ease-out ${
                on ? "text-fg" : "text-muted hover:text-fg"
              }`;
        const body = (
          <>
            <span
              className={`leading-none [font-family:'Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji',sans-serif] ${
                compact ? "text-[1.45rem] sm:text-[1.65rem]" : "text-[2.65rem]"
              }`}
              aria-hidden
            >
              {CARE_TYPE_EMOJI[type]}
            </span>
            <span
              className={`whitespace-nowrap font-semibold leading-tight ${
                compact ? "text-[12px] leading-tight" : "text-[13px]"
              } ${on ? "underline decoration-2 underline-offset-4" : ""}`}
            >
              {t(BROWSE_RAIL_COPY[type])}
            </span>
          </>
        );
        if (toSearch) {
          return (
            <Link
              key={type}
              to="/search"
              search={browseTypeSearch(type, city)}
              data-browse-type={type}
              aria-current={on ? "page" : undefined}
              className={className}
            >
              {body}
            </Link>
          );
        }
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={on}
            data-browse-type={type}
            className={className}
            onClick={() => onSelect(on ? undefined : type)}
          >
            {body}
          </button>
        );
      })}
    </div>
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
  skipLiveLooking = false,
  menu = true,
  seeAll = true,
  selected,
  onSelect,
  city,
}: {
  items?: Card[];
  rows?: Partial<Record<BrowseDaycareType, Card[]>>;
  eagerThumbs?: boolean;
  visual?: boolean;
  /** Home featured rail: show the same centres the chip counted, including incomplete cards. */
  skipLiveLooking?: boolean;
  menu?: boolean;
  /** Home links each row to search. Search itself stays in the row. */
  seeAll?: boolean;
  selected?: BrowseDaycareType;
  onSelect?: (type?: BrowseDaycareType) => void;
  city?: string;
}) {
  const { t } = useCopy();
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
                  ? `${
                      kind === "before_after" ? "/search?cat=before-after" : `/search?fac=${kind}`
                    }${city?.trim() ? `&q=${encodeURIComponent(city.trim())}` : ""}`
                  : undefined
              }
              eagerThumbs={eagerThumbs}
              visual={visual}
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

/** @deprecated alias — Explore home still mounts this name. */
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
