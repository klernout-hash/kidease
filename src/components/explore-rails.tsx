import { useMemo, useSyncExternalStore } from "react";
import type { DaycareCard as Card } from "@/lib/types";
import { ListingRail } from "@/components/listing-rail";
import { uniqueById } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";
import { readRecent } from "@/lib/recent";
import { useAppStore } from "@/lib/store";

function take(rows: Card[], n = 12) {
  return uniqueById(rows).slice(0, n);
}

function fill(preferred: Card[], pool: Card[], n = 12) {
  const out = take(preferred, n);
  if (out.length >= n) return out;
  const seen = new Set(out.map((r) => r.id));
  for (const row of pool) {
    if (out.length >= n) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function subscribeRecent(cb: () => void) {
  window.addEventListener("kidease-recent", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("kidease-recent", cb);
    window.removeEventListener("storage", cb);
  };
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
  const recent = useSyncExternalStore(subscribeRecent, readRecent, () => [] as Card[]);

  const rows = useMemo(() => {
    const byDistance = [...items].sort((a, b) => a.distanceKm - b.distanceKm);
    const available = items
      .filter((r) => (r.live || r.availabilityKnown) && r.spotsTotal > 0)
      .sort((a, b) => b.spotsTotal - a.spotsTotal || a.distanceKm - b.distanceKm);
    const nextMonth = items.filter((r) => !available.slice(0, 6).some((x) => x.id === r.id));
    const rated = items
      .filter((r) => r.ratingX10 > 0 && r.reviewCount > 0)
      .sort((a, b) => b.ratingX10 - a.ratingX10 || b.reviewCount - a.reviewCount);
    const priority = items
      .filter((r) => r.priority)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const recentHits = recent.filter((r) => items.some((i) => i.id === r.id));
    const first = recentHits.length ? take(recentHits) : fill(priority, byDistance);
    return {
      first,
      firstTitle: recentHits.length
        ? t("recentlyViewed")
        : fr
          ? "Réservations prioritaires"
          : "Priority listings",
      available: fill(available, byDistance),
      nextMonth: fill(nextMonth, byDistance),
      near: take(byDistance),
      rated: fill(rated, byDistance),
    };
  }, [items, recent, t, fr]);

  if (!items.length) return null;

  return (
    <div
      className="pb-8"
      onMouseOver={(e) => {
        const node = (e.target as HTMLElement).closest("[data-slug]");
        const slug = node?.getAttribute("data-slug");
        if (slug) onHover?.(slug);
      }}
    >
      <ListingRail title={rows.firstTitle} items={rows.first} />
      <ListingRail title={t("availableNow")} items={rows.available} />
      <ListingRail title={t("availableNextMonth")} items={rows.nextMonth} />
      <ListingRail
        title={fr ? `Garderies près de ${city}` : `Popular daycares near ${city}`}
        items={rows.near}
      />
      <ListingRail title={fr ? "Mieux notées" : "Highest rated"} items={rows.rated} />
    </div>
  );
}
