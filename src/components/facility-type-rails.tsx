import { ListingRail } from "@/components/listing-rail";
import type { CopyKey } from "@/lib/copy";
import { FACILITY_TYPES, matchesFacilityType, type FacilityType } from "@/lib/facility-type";
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

function take(rows: Card[], n = 12) {
  return uniqueById(rows).slice(0, n);
}

export function facilityTypeRailItems(items: Card[], type: FacilityType, n = 12): Card[] {
  const byDistance = [...homeRailItems(items)].sort((a, b) => a.distanceKm - b.distanceKm);
  return take(
    byDistance.filter((row) => matchesFacilityType(row, type)),
    n,
  );
}

/** Canada facility-type rows. Empty types stay hidden. US aliases never appear. */
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
    child_care_centre: rows?.child_care_centre ?? facilityTypeRailItems(items ?? [], "child_care_centre"),
    family_home: rows?.family_home ?? facilityTypeRailItems(items ?? [], "family_home"),
    group_home: rows?.group_home ?? facilityTypeRailItems(items ?? [], "group_home"),
    nursery_preschool: rows?.nursery_preschool ?? facilityTypeRailItems(items ?? [], "nursery_preschool"),
    school_age: rows?.school_age ?? facilityTypeRailItems(items ?? [], "school_age"),
  };

  return (
    <>
      {FACILITY_TYPES.map((kind) => (
        <ListingRail
          key={kind}
          title={t(FACILITY_RAIL_COPY[kind])}
          items={resolved[kind]}
          seeAllHref={`/search?fac=${kind}`}
          eagerThumbs={eagerThumbs}
        />
      ))}
    </>
  );
}
