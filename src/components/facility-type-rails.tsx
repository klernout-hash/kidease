import { ListingRail } from "@/components/listing-rail";
import type { CopyKey } from "@/lib/copy";
import { FACILITY_TYPES, matchesFacilityType, type FacilityType } from "@/lib/facility-type";
import { parentRailSearchHref } from "@/lib/parent-rails";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { uniqueById } from "@/lib/utils";

export const FACILITY_RAIL_COPY: Record<FacilityType, CopyKey> = {
  centre: "railDaycareCentres",
  nursery: "railNursery",
  home: "railHome",
};

function take(rows: Card[], n = 12) {
  return uniqueById(rows).slice(0, n);
}

export function facilityTypeRailItems(items: Card[], type: FacilityType, n = 12): Card[] {
  const byDistance = [...items].sort((a, b) => a.distanceKm - b.distanceKm);
  return take(
    byDistance.filter((row) => matchesFacilityType(row, type)),
    n,
  );
}

/** Nursery / Home / Daycare Centres category rows. Empty types stay hidden. */
export function FacilityTypeRails({
  items,
  rows,
  eagerThumbs = false,
}: {
  items?: Card[];
  rows?: Partial<Record<FacilityType, Card[]>>;
  eagerThumbs?: boolean;
}) {
  const { t } = useCopy();
  const resolved: Record<FacilityType, Card[]> = {
    centre: rows?.centre ?? facilityTypeRailItems(items ?? [], "centre"),
    nursery: rows?.nursery ?? facilityTypeRailItems(items ?? [], "nursery"),
    home: rows?.home ?? facilityTypeRailItems(items ?? [], "home"),
  };

  return (
    <>
      {FACILITY_TYPES.map((kind) => (
        <ListingRail
          key={kind}
          title={t(FACILITY_RAIL_COPY[kind])}
          items={resolved[kind]}
          seeAllHref={parentRailSearchHref({ care: kind })}
          eagerThumbs={eagerThumbs}
        />
      ))}
    </>
  );
}
