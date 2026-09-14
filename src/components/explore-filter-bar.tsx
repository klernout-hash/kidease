import type { ReactNode } from "react";
import { Map, SlidersHorizontal } from "lucide-react";
import { ChipButton } from "@/components/chip";
import { ChipCarousel } from "@/components/chip-carousel";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

function LiveAllSegment({
  liveOnly,
  listingCount,
  onLiveOnly,
  className,
}: {
  liveOnly: boolean;
  listingCount?: number;
  onLiveOnly: (live: boolean) => void;
  className?: string;
}) {
  const { t } = useCopy();
  return (
    <div
      className={cn("ke-explore-scope", className)}
      role="tablist"
      aria-label={t("searchRowScope")}
    >
      <button
        type="button"
        role="tab"
        aria-selected={liveOnly}
        className="ke-explore-scope-tab"
        onClick={() => onLiveOnly(true)}
      >
        {t("live")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!liveOnly}
        data-listing-count={listingCount}
        className="ke-explore-scope-tab"
        onClick={() => onLiveOnly(false)}
      >
        {t("scopeAll")}
      </button>
    </div>
  );
}

function IconToggle({
  pressed,
  label,
  count,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ke-explore-icon-btn"
      aria-pressed={pressed}
      aria-label={count ? `${label} · ${count}` : label}
      title={label}
      onClick={onClick}
    >
      {children}
      <span className="ke-explore-icon-btn-label">{label}</span>
      {count ? (
        <span className="ke-explore-icon-btn-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function ExploreFilterBar({
  liveOnly,
  listingCount,
  onLiveOnly,
  ageChips,
  nearMeOn,
  onNearMe,
  openSpotsOn,
  onOpenSpots,
  tenOn,
  onTen,
  filtersOpen,
  filterCount,
  onFilters,
  mapOn,
  onMap,
  className,
}: {
  liveOnly: boolean;
  listingCount?: number;
  onLiveOnly: (live: boolean) => void;
  ageChips: ReactNode;
  nearMeOn: boolean;
  onNearMe: () => void;
  openSpotsOn: boolean;
  onOpenSpots: () => void;
  tenOn: boolean;
  onTen: () => void;
  filtersOpen: boolean;
  filterCount: number;
  onFilters: () => void;
  mapOn: boolean;
  onMap: () => void;
  className?: string;
}) {
  const { t } = useCopy();

  return (
    <div
      className={cn("ke-explore-filter-bar", className)}
      data-ke="explore-filter-bar"
      data-search-row="filter-bar"
    >
      <LiveAllSegment
        liveOnly={liveOnly}
        listingCount={listingCount}
        onLiveOnly={onLiveOnly}
        className="ke-explore-scope--docked hidden lg:inline-flex"
      />

      <ChipCarousel
        compact
        className="ke-explore-filter-scroll min-w-0 flex-1"
        label={t("searchRowFilters")}
      >
        <LiveAllSegment
          liveOnly={liveOnly}
          listingCount={listingCount}
          onLiveOnly={onLiveOnly}
          className="ke-explore-scope--scroll lg:hidden"
        />
        {ageChips}
        <ChipButton on={nearMeOn} aria-pressed={nearMeOn} onClick={onNearMe}>
          {t("nearMe")}
        </ChipButton>
        <ChipButton on={openSpotsOn} aria-pressed={openSpotsOn} onClick={onOpenSpots}>
          {t("sortOpen")}
        </ChipButton>
        <ChipButton on={tenOn} aria-pressed={tenOn} onClick={onTen}>
          {t("filterTen")}
        </ChipButton>
      </ChipCarousel>

      <div className="ke-explore-filter-actions">
        <IconToggle
          pressed={filtersOpen || filterCount > 0}
          label={t("filters")}
          count={filterCount || undefined}
          onClick={onFilters}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
        </IconToggle>
        <IconToggle pressed={mapOn} label={t("map")} onClick={onMap}>
          <Map className="size-4 shrink-0" aria-hidden="true" />
        </IconToggle>
      </div>
    </div>
  );
}
