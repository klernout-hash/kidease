import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { List, Map, SlidersHorizontal } from "lucide-react";
import { ChipButton } from "@/components/chip";
import { ChipCarousel } from "@/components/chip-carousel";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

function IconToggle({
  pressed,
  label,
  count,
  onClick,
  children,
  "data-ke": dataKe,
}: {
  pressed: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  children: ReactNode;
  "data-ke"?: string;
}) {
  return (
    <button
      type="button"
      className="ke-explore-icon-btn"
      aria-pressed={pressed}
      aria-label={count ? `${label} · ${count}` : label}
      title={label}
      data-ke={dataKe}
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
  ageChips,
  nearMeOn,
  onNearMe,
  openSpotsOn,
  onOpenSpots,
  openSpotsSearch,
  tenOn,
  onTen,
  filtersOpen,
  filterCount,
  onFilters,
  mapOn,
  onMap,
  className,
}: {
  ageChips: ReactNode;
  nearMeOn: boolean;
  onNearMe: () => void;
  openSpotsOn: boolean;
  onOpenSpots: () => void;
  openSpotsSearch?: Record<string, unknown>;
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
      <ChipCarousel
        compact
        arrows={false}
        className="ke-explore-filter-scroll"
        label={t("searchRowFilters")}
      >
        {ageChips}
        <ChipButton on={nearMeOn} aria-pressed={nearMeOn} onClick={onNearMe}>
          {t("nearMe")}
        </ChipButton>
        {openSpotsSearch ? (
          <Link
            to="/search"
            search={openSpotsSearch as never}
            className={cn("ke-chip", openSpotsOn && "ke-chip-on")}
            aria-pressed={openSpotsOn}
            onClick={onOpenSpots}
          >
            {t("sortOpen")}
          </Link>
        ) : (
          <ChipButton on={openSpotsOn} aria-pressed={openSpotsOn} onClick={onOpenSpots}>
            {t("sortOpen")}
          </ChipButton>
        )}
        <ChipButton on={tenOn} aria-pressed={tenOn} onClick={onTen}>
          {t("filterTen")}
        </ChipButton>
      </ChipCarousel>

      <div className="ke-explore-filter-actions">
        <IconToggle
          pressed={filtersOpen || filterCount > 0}
          label={t("filters")}
          count={filterCount || undefined}
          data-ke="explore-filters-toggle"
          onClick={onFilters}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
        </IconToggle>
        <IconToggle
          pressed={mapOn}
          label={mapOn ? t("list") : t("map")}
          onClick={onMap}
          data-ke="explore-map-toggle"
        >
          {mapOn ? (
            <List className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Map className="size-4 shrink-0" aria-hidden="true" />
          )}
        </IconToggle>
      </div>
    </div>
  );
}
