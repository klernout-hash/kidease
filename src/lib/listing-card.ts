import type { DaycareCard } from "@/lib/types";
import { feeProgramBadgeKey } from "@/lib/licensing";
import { listingThumb } from "@/lib/listing-photo";
import { licenseBadge, type TrustCopyKey } from "@/lib/trust";

/** One pill max, Airbnb-style top-left. Honest licence label when no fee program. */
export function listingPill(item: Pick<DaycareCard, "province" | "live" | "priority" | "licenseStatus" | "registryMatchState">): {
  labelKey: "badgeTen" | "badgeFifteen" | "badgeReducedQc" | "live" | TrustCopyKey;
} | null {
  const fee = feeProgramBadgeKey(item.province);
  if (fee) return { labelKey: fee };
  if (item.live) return { labelKey: "live" };
  return { labelKey: licenseBadge(item).labelKey };
}

export function cardPhotos(item: Pick<DaycareCard, "photos">) {
  const list = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));
  const cover = listingThumb(item.photos);
  const rest = list.filter((p) => p !== cover);
  return [cover, ...rest];
}
