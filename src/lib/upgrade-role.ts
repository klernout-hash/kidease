/**
 * Parent upgrades and daycare upgrades stay on their own side.
 * A stored parent who also owns or works at a centre can buy either,
 * and the active desk decides which one the UI shows.
 * Admin may open both while testing.
 */

import { parseAppRole, type AppRole } from "./desks.ts";

export const PARENT_UPGRADE_DENIED =
  "Parent Plus is for families. Centre plans stay on the daycare desk. Nothing was charged.";

export const DAYCARE_UPGRADE_DENIED =
  "Centre plans are for a daycare you own or work at. Parent Plus stays on the family desk. Nothing was charged.";

export type UpgradeBuyer = {
  role?: string | null;
  ownsCentre?: boolean;
  linkedToCentre?: boolean;
};

export type UpgradeSide = "parent" | "daycare" | "both" | "none";

export type UpgradeDesk = "parent" | "provider" | "admin" | "support" | null;

function roleOf(role?: string | null): AppRole {
  return parseAppRole(role);
}

export function canBuyParentUpgrade(buyer: UpgradeBuyer): boolean {
  const role = roleOf(buyer.role);
  if (role === "admin") return true;
  return role === "parent";
}

export function canBuyDaycareUpgrade(buyer: UpgradeBuyer): boolean {
  const role = roleOf(buyer.role);
  if (role === "admin") return true;
  return Boolean(buyer.ownsCentre || buyer.linkedToCentre);
}

/** Which public upgrade section this signed-in session should see. */
export function visibleUpgradeSide(input: UpgradeBuyer & { activeDesk?: UpgradeDesk }): UpgradeSide {
  const parent = canBuyParentUpgrade(input);
  const daycare = canBuyDaycareUpgrade(input);
  if (!parent && !daycare) return "none";
  if (parent && daycare) {
    if (input.activeDesk === "provider") return "daycare";
    if (input.activeDesk === "parent") return "parent";
    if (roleOf(input.role) === "admin") return "both";
    return "parent";
  }
  return daycare ? "daycare" : "parent";
}

export type CatalogUpgradeLane =
  | "provider_plan"
  | "parent_plus"
  | "featured_city"
  | "claim_boost"
  | "job_post";

function daycareLane(lane: string): boolean {
  return lane === "provider_plan" || lane === "featured_city" || lane === "claim_boost" || lane === "job_post";
}

/**
 * Checkout metadata must name the side that is allowed to write.
 * Missing role keeps older events working. A present role that disagrees
 * with the lane is dropped.
 */
export function catalogMetadataAllows(input: {
  lane: string;
  role?: string | null;
  centreId?: string | null;
  buyer?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const role = String(input.role || "").trim();
  if (!role) return { ok: true };
  if (input.lane === "parent_plus") {
    if (role !== "parent") return { ok: false, reason: "parent upgrade on a daycare checkout" };
    return { ok: true };
  }
  if (daycareLane(input.lane)) {
    if (role !== "daycare") return { ok: false, reason: "daycare upgrade on a parent checkout" };
    const centreId = String(input.centreId || "").trim();
    if (!centreId && String(input.buyer || "").trim() !== "admin") {
      return { ok: false, reason: "daycare upgrade missing centre" };
    }
    return { ok: true };
  }
  return { ok: true };
}

/**
 * The profile that receives the write must be allowed to hold that product.
 * A parent-only profile never gains a centre plan. A daycare-only profile
 * never gains Parent Plus. Admin testing may receive either side.
 */
export function profileMayReceiveUpgrade(input: {
  lane: CatalogUpgradeLane;
  profileRole?: string | null;
  linkedCentreIds?: string[] | null;
  centreId?: string | null;
  metadataRole?: string | null;
  buyer?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const meta = catalogMetadataAllows({
    lane: input.lane,
    role: input.metadataRole,
    centreId: input.centreId,
    buyer: input.buyer,
  });
  if (!meta.ok) return meta;

  const profileRole = roleOf(input.profileRole);
  const centres = (input.linkedCentreIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  const centreId = String(input.centreId || "").trim();
  const admin = profileRole === "admin" || String(input.buyer || "").trim() === "admin";

  if (input.lane === "parent_plus") {
    if (admin || profileRole === "parent") return { ok: true };
    return { ok: false, reason: "parent upgrade on a daycare profile" };
  }

  if (daycareLane(input.lane)) {
    if (admin && !centreId) return { ok: true };
    if (centreId && centres.includes(centreId)) return { ok: true };
    if (!centreId && centres.length > 0 && !String(input.metadataRole || "").trim()) return { ok: true };
    return { ok: false, reason: "daycare upgrade on a parent profile" };
  }

  return { ok: false, reason: "unscoped" };
}
