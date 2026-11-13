import { useMemo } from "react";
import { FacilityTypeRails } from "@/components/facility-type-rail-list";
import type { BrowseDaycareType } from "@/components/facility-type-rails";
import { ListingRail } from "@/components/listing-rail";
import { EmptyState } from "@/components/empty-state";
import { honestVacancy, homeRailItems, liveLookingOnly } from "@/lib/now-loops";
import { localePath } from "@/lib/locale-path";
import type { DaycareCard as Card } from "@/lib/types";
import { uniqueById } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";

export function HomeDiscovery({
  ready,
  shown,
  publicFeatured,
  placeLabel,
  /** First photo is the phone LCP when no live rail sits above these cards. */
  priorityFirst = false,
  liveOnly,
  hasPublic,
  onShowAll,
  careType,
  onCareType,
  city,
}: {
  ready: boolean;
  shown: Card[];
  publicFeatured: Card[];
  placeLabel?: string;
  priorityFirst?: boolean;
  liveOnly: boolean;
  hasPublic: boolean;
  onShowAll: () => void;
  careType?: BrowseDaycareType;
  onCareType?: (type?: BrowseDaycareType) => void;
  city?: string;
}) {
  const { t, locale } = useCopy();
  const liveLookingRail = useMemo(
    () => homeRailItems(liveLookingOnly(publicFeatured), { city: placeLabel, label: placeLabel }),
    [placeLabel, publicFeatured],
  );
  const availableNow = useMemo(() => {
    return uniqueById(liveLookingRail.filter((row) => honestVacancy(row).kind === "open")).slice(0, 18);
  }, [liveLookingRail]);
  const availableNextMonth = useMemo(() => {
    const top = new Set(availableNow.slice(0, 6).map((row) => row.id));
    return shown.filter((row) => honestVacancy(row).kind === "open" && !top.has(row.id)).slice(0, 18);
  }, [availableNow, shown]);
  if (!ready && shown.length === 0) return <HomeCardSkeleton />;
  if (shown.length === 0) {
    return (
      <div className="mt-6 rounded-xl bg-bg ring-1 ring-border">
        <EmptyState
          title={liveOnly && hasPublic ? t("noLiveResults") : t("noResults")}
          body={liveOnly && hasPublic ? t("noLiveResultsLead") : t("noResultsLead")}
          action={liveOnly && hasPublic ? t("showAll") : t("changeLocation")}
          onAction={liveOnly && hasPublic ? onShowAll : undefined}
          actionTo={liveOnly && hasPublic ? undefined : `${localePath("/", locale)}?change=1`}
          secondary={liveOnly && hasPublic ? t("noLiveResultsClaim") : undefined}
          secondaryTo={liveOnly && hasPublic ? "/claim" : undefined}
        />
      </div>
    );
  }
  return (
    <>
      <ListingRail title={t("availableNow")} items={availableNow} eagerThumbs={priorityFirst} visual />
      <ListingRail title={t("availableNextMonth")} items={availableNextMonth} eagerThumbs={false} visual />
      <FacilityTypeRails items={shown} visual skipLiveLooking menu={!onCareType} selected={careType} onSelect={onCareType} city={city} />
    </>
  );
}

function HomeCardSkeleton() {
  return (
    <div className="ke-rail ke-rail--visual mt-6" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="ke-rail-card flex-col space-y-2" aria-hidden="true">
          <div className="ke-skel ke-card-photo w-full" />
          <div className="ke-skel h-4 w-3/4" />
          <div className="ke-skel h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
