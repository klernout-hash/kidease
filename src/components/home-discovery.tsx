import { DaycareCard } from "@/components/daycare-card";
import { EmptyState } from "@/components/empty-state";
import { localePath } from "@/lib/locale-path";
import type { DaycareCard as Card } from "@/lib/types";
import { listingThumb } from "@/lib/photo";
import { homeGridItems } from "@/lib/now-loops";
import { useCopy } from "@/lib/use-copy";

export function HomeDiscovery({
  ready,
  shown,
  liveOnly,
  hasPublic,
  onShowAll,
  city,
}: {
  ready: boolean;
  shown: Card[];
  liveOnly: boolean;
  hasPublic: boolean;
  onShowAll: () => void;
  city?: string;
}) {
  const { t, locale } = useCopy();
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
  const cards = homeGridItems(shown, { city, label: city });
  const leadPhoto = cards.findIndex((item) => {
    const photo = listingThumb(item.photos);
    return Boolean(photo && !photo.includes("storefront-placeholder"));
  });
  return (
    <div data-ke="explore-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {cards.map((item, index) => (
        <DaycareCard key={item.id} item={item} presentation="visual" eager={index < 2} priority={index === leadPhoto} />
      ))}
    </div>
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
