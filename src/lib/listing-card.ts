import type { DaycareCard } from "@/lib/types";
import { feeProgramBadgeKey } from "@/lib/licensing";
import { listingThumb } from "@/lib/listing-photo";

/** One pill max, Airbnb-style top-left. */
export function listingPill(item: Pick<DaycareCard, "province" | "live" | "priority">): {
  labelKey: "badgeTen" | "badgeFifteen" | "badgeReducedQc" | "licensed" | "live";
} | null {
  const fee = feeProgramBadgeKey(item.province);
  if (fee) return { labelKey: fee };
  if (item.live) return { labelKey: "live" };
  return { labelKey: "licensed" };
}

export function cardPhotos(item: Pick<DaycareCard, "photos">) {
  const list = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));
  const cover = listingThumb(item.photos);
  const rest = list.filter((p) => p !== cover);
  return [cover, ...rest];
}
