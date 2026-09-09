import { useEffect, useMemo, useState } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { ListingRail } from "@/components/listing-rail";
import { FacilityTypeRails, facilityTypeRailItems } from "@/components/facility-type-rails";
import { uniqueById } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";
import { readRecent } from "@/lib/recent";
import { useAppStore } from "@/lib/store";
import { honestVacancy, isLiveLookingCard, liveLookingOnly } from "@/lib/now-loops";

function take(rows: Card[], n = 12) {
  return uniqueById(rows).slice(0, n);
}

export function ExploreRails({
  items,
  onHover,
}: {
  items: Card[];
  onHover?: (slug: string) => void;
}) {
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const originLabel = useAppStore((s) => s.origin.label);
  const city = originLabel.split(",")[0]?.trim() || "your area";
  const [recent, setRecent] = useState<Card[]>([]);

  useEffect(() => {
    function sync() {
      setRecent(readRecent());
    }
    sync();
    window.addEventListener("kidease-recent", sync);
    return () => window.removeEventListener("kidease-recent", sync);
  }, []);

  const rows = useMemo(() => {
    const looking = liveLookingOnly(items);
    const byDistance = [...looking].sort((a, b) => a.distanceKm - b.distanceKm);
    const available = looking
      .filter((r) => honestVacancy(r).kind === "open")
      .sort((a, b) => b.spotsTotal - a.spotsTotal || a.distanceKm - b.distanceKm);
    const nextMonth = looking.filter((r) => honestVacancy(r).kind === "open" && !available.slice(0, 6).some((x) => x.id === r.id));
    const priority = looking.filter((r) => r.priority).sort((a, b) => a.distanceKm - b.distanceKm);
    const liveNear = take(
      looking.filter((r) => r.live).sort((a, b) => a.distanceKm - b.distanceKm),
    );
    const recentHits = recent.filter((r) => looking.some((i) => i.id === r.id) && isLiveLookingCard(r));
    return {
      first: liveNear.length ? liveNear : recentHits.length ? take(recentHits) : take(priority.length ? priority : byDistance),
      firstTitle: liveNear.length ? "live" : recentHits.length ? "recent" : "priority",
      available: take(available),
      nextMonth: take(nextMonth),
      centre: facilityTypeRailItems(looking, "centre"),
      nursery: facilityTypeRailItems(looking, "nursery"),
      home: facilityTypeRailItems(looking, "home"),
    };
  }, [items, recent]);

  if (!items.length) return null;

  const firstTitle =
    rows.firstTitle === "live"
      ? fr
        ? `Fiches actives près de ${city}`
        : `Live listings near ${city}`
      : rows.firstTitle === "recent"
        ? t("recentlyViewed")
        : fr
          ? "Réservations prioritaires"
          : "Priority listings";

  return (
    <div
      className="min-h-[22rem] pb-8"
      onMouseOver={(e) => {
        const node = (e.target as HTMLElement).closest("[data-slug]");
        const slug = node?.getAttribute("data-slug");
        if (slug) onHover?.(slug);
      }}
    >
      <ListingRail title={firstTitle} items={rows.first} />
      <ListingRail title={t("availableNow")} items={rows.available} />
      <ListingRail title={t("availableNextMonth")} items={rows.nextMonth} />
      <FacilityTypeRails rows={rows} />
    </div>
  );
}
