import type { DaycareCard } from "@/lib/types";
import { listingThumb } from "@/lib/listing-photo";
import { confirmedFeeProgramBadge } from "@/lib/now-loops";
import { isCatalogueMatchedBadge, licenseBadge, type TrustCopyKey } from "@/lib/trust";

/**
 * Legacy single-pill choice. Search and directory photos no longer call this —
 * they paint Live and the confirmed fee pill side by side and omit registry-checked.
 * Licensed only when we actually know. Unverified and catalogue-matched stay off.
 */
export function listingPill(item: Pick<DaycareCard, "province" | "live" | "priority" | "licenseStatus" | "registryMatchState" | "amenities" | "feeConfirmed">): {
  labelKey: "badgeTen" | "badgeFifteen" | "badgeReducedQc" | "live" | TrustCopyKey;
} | null {
  const fee = confirmedFeeProgramBadge(item);
  if (fee) return { labelKey: fee };
  if (item.live) return { labelKey: "live" };
  const license = licenseBadge(item);
  if (license.id === "license_unverified" || isCatalogueMatchedBadge(license)) return null;
  return { labelKey: license.labelKey };
}

export function cardPhotos(item: Pick<DaycareCard, "photos">) {
  const list = (item.photos ?? []).filter((p) => p && !p.includes("-logo"));
  const cover = listingThumb(item.photos);
  const rest = list.filter((p) => p !== cover);
  return [cover, ...rest];
}
