/**
 * Resource AuthZ used by family / billing / admin paths.
 *
 * Session identity comes from Better Auth (`context.userId`). Never trust a
 * client-supplied user id, booking id, payment id, child id, or bill id
 * without these checks. Messages stay generic ("not found") so IDOR probes
 * do not learn that another family's row exists.
 */
import { parseAppRole, type AppRole } from "./desks.ts";
import { parentCanSeeBill, type BillStatus } from "./bill.ts";
import { canAccessAdmin, canAccessSupport } from "./support.ts";

export const ACCESS_NOT_FOUND = "not found";

export function sameUser(actorUserId: string | null | undefined, ownerUserId: string | null | undefined) {
  const a = (actorUserId || "").trim();
  const b = (ownerUserId || "").trim();
  return Boolean(a) && a === b;
}

export function ownsDaycare(ownedDaycareIds: readonly string[] | null | undefined, daycareId: string | null | undefined) {
  const id = (daycareId || "").trim();
  if (!id) return false;
  return (ownedDaycareIds || []).includes(id);
}

/** /api/admin/* and admin server fns. Parent and daycare sessions never. */
export function canCallAdminApi(role: AppRole | string | null | undefined) {
  return canAccessAdmin(role);
}

export function canCallSupportApi(role: AppRole | string | null | undefined) {
  return canAccessSupport(role);
}

export function canReadOwnProfile(actorUserId: string, profileUserId: string) {
  return sameUser(actorUserId, profileUserId);
}

export function canWriteOwnProfile(actorUserId: string, profileUserId: string) {
  return sameUser(actorUserId, profileUserId);
}

export function canReadChild(actorUserId: string, childOwnerId: string) {
  return sameUser(actorUserId, childOwnerId);
}

export function canWriteChild(actorUserId: string, childOwnerId: string) {
  return sameUser(actorUserId, childOwnerId);
}

export function canReadPayment(actorUserId: string, paymentOwnerId: string) {
  return sameUser(actorUserId, paymentOwnerId);
}

export function canWritePayment(actorUserId: string, paymentOwnerId: string) {
  return sameUser(actorUserId, paymentOwnerId);
}

export function canCreatePaymentForBooking(actorUserId: string, bookingOwnerId: string) {
  return sameUser(actorUserId, bookingOwnerId);
}

export function canReadBooking(input: {
  actorUserId: string;
  bookingOwnerId: string;
  daycareId: string;
  ownedDaycareIds: readonly string[];
  role?: AppRole | string | null;
}) {
  if (sameUser(input.actorUserId, input.bookingOwnerId)) return true;
  if (ownsDaycare(input.ownedDaycareIds, input.daycareId)) return true;
  return canCallAdminApi(input.role);
}

/**
 * Offer / waitlist / decline. The parent who filed the request cannot flip
 * their own status. Daycare owners of that centre, or admin, can.
 */
export function canUpdateBookingStatus(input: {
  daycareId: string;
  ownedDaycareIds: readonly string[];
  role?: AppRole | string | null;
}) {
  if (ownsDaycare(input.ownedDaycareIds, input.daycareId)) return true;
  return canCallAdminApi(input.role);
}

/** Provider desk incoming list. No owned centre → empty, never every booking. */
export function canListProviderRequests(ownsAnyCentre: boolean) {
  return Boolean(ownsAnyCentre);
}

/** Parent who filed it, owning centre, or admin. */
export function canReadLead(input: {
  actorUserId: string;
  parentUserId: string;
  daycareId: string;
  ownedDaycareIds: readonly string[];
  role?: AppRole | string | null;
}) {
  if (sameUser(input.actorUserId, input.parentUserId)) return true;
  if (ownsDaycare(input.ownedDaycareIds, input.daycareId)) return true;
  return canCallAdminApi(input.role);
}

/** Confirm / decline / answered. The parent who filed it cannot flip their own status. */
export function canUpdateLeadRequestStatus(input: {
  daycareId: string;
  ownedDaycareIds: readonly string[];
  role?: AppRole | string | null;
}) {
  if (ownsDaycare(input.ownedDaycareIds, input.daycareId)) return true;
  return canCallAdminApi(input.role);
}

export type BillAccess = { ok: true; role: "parent" | "provider" } | { ok: false; role: "none" };

export function canReadBill(input: {
  actorUserId: string;
  parentUserId: string;
  daycareId: string;
  ownedDaycareIds: readonly string[];
  status: BillStatus;
}): BillAccess {
  if (ownsDaycare(input.ownedDaycareIds, input.daycareId)) {
    return { ok: true, role: "provider" };
  }
  if (sameUser(input.actorUserId, input.parentUserId) && parentCanSeeBill(input.status)) {
    return { ok: true, role: "parent" };
  }
  return { ok: false, role: "none" };
}

export function canCreateBillForCentre(ownedDaycareIds: readonly string[], daycareId: string) {
  return ownsDaycare(ownedDaycareIds, daycareId);
}

/** Stripe Checkout for a bill — owning parent + sent only. No live charge here. */
export function canCheckoutBill(input: {
  actorUserId: string;
  parentUserId: string;
  status: BillStatus;
}) {
  return sameUser(input.actorUserId, input.parentUserId) && input.status === "sent";
}

export function accessDeniedMessage(kind: "booking" | "payment" | "child" | "profile" | "bill" | "request") {
  if (kind === "booking" || kind === "request") return "Request not found";
  if (kind === "payment") return "Payment not found";
  if (kind === "child") return "Child not found";
  if (kind === "bill") return "Bill not found";
  return "Not found";
}

export function parseActorRole(role: AppRole | string | null | undefined): AppRole {
  return parseAppRole(role);
}

export const LISTING_NOT_YOURS = "Not your listing";
export const LISTING_NOT_FOUND = "Listing not found";
export const CLAIM_ALREADY_TAKEN = "This listing is already claimed";
export const BILL_LEDGER_ONLY =
  "Card Pay stays off until Stripe live keys are on. This bill is on the internal ledger (not charged).";
export const BILL_NOT_OPEN = "This bill is not open to Pay";
export const PLUS_LEDGER_ONLY =
  "Plus checkout stays off until Stripe live keys are on. This pick is saved on the internal ledger (not charged).";
export const PLUS_PRICE_MISSING =
  "Parent Plus price ID is not set. Add STRIPE_PRICE_PLUS_MONTHLY or STRIPE_PRICE_PLUS_YEARLY on Vercel.";
export const PROVIDER_LEDGER_ONLY =
  "Centre plan checkout stays off until Stripe live keys are on. This pick is saved on the internal ledger (not charged).";
export const PROVIDER_PRICE_MISSING = "This plan’s Stripe price ID is not set. Add it on Vercel, then try again.";
export const NETWORK_MIN_SITES = "Network is priced for 3 or more sites.";
export const AUTH_UNAUTHORIZED = "Unauthorized";
export const AUTH_FAIL_CLOSED =
  "Auth is disabled (VITE_AUTH_ENABLED=false) but DATABASE_URL is set — refusing to fall back to the shared dev user against a real database.";
export const DEV_FALLBACK_USER_ID = "dev-user";

/** Daycare A cannot mutate daycare B. Same predicate as updateListing / refreshVacancy. */
export function canMutateListing(
  ownedDaycareIds: readonly string[] | null | undefined,
  daycareId: string | null | undefined,
) {
  return ownsDaycare(ownedDaycareIds, daycareId);
}

export function assertCanMutateListing(
  ownedDaycareIds: readonly string[] | null | undefined,
  daycareId: string | null | undefined,
) {
  if (!canMutateListing(ownedDaycareIds, daycareId)) throw new Error(LISTING_NOT_YOURS);
}

export type DeskWriteTarget =
  | "admin"
  | "support"
  | "provider_listing"
  | "parent_child"
  | "parent_profile"
  | "parent_pay";

/**
 * Wrong-desk write APIs. Parent/daycare sessions never hit admin writes.
 * Listing writes need centre ownership (or admin). Child/profile/pay stay
 * same-user — a provider session cannot edit another family's rows.
 */
export function canCallDeskWriteApi(input: {
  actorRole?: AppRole | string | null;
  actorUserId?: string | null;
  target: DeskWriteTarget;
  resourceOwnerId?: string | null;
  ownedDaycareIds?: readonly string[] | null;
  daycareId?: string | null;
}) {
  if (input.target === "admin") return canCallAdminApi(input.actorRole);
  if (input.target === "support") return canCallSupportApi(input.actorRole);
  if (input.target === "provider_listing") {
    if (canMutateListing(input.ownedDaycareIds, input.daycareId)) return true;
    return canCallAdminApi(input.actorRole);
  }
  const actor = input.actorUserId || "";
  const owner = input.resourceOwnerId || "";
  if (input.target === "parent_child") return canWriteChild(actor, owner);
  if (input.target === "parent_profile") return canWriteOwnProfile(actor, owner);
  return canWritePayment(actor, owner);
}

export type GuestPathKind = "public" | "sign_in" | "guest_landing" | "admin_api";

/** Unsigned visitors: which document / API paths must not open a write desk. */
export function guestPathKind(pathname: string): GuestPathKind {
  const path = (pathname.split("?")[0] || "/").trim() || "/";
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return "admin_api";
  if (
    path === "/parent" ||
    path.startsWith("/parent/") ||
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/inbox" ||
    path.startsWith("/inbox/") ||
    path === "/book" ||
    path.startsWith("/book/") ||
    path === "/pay" ||
    path.startsWith("/pay/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/admin-") ||
    path === "/support" ||
    path.startsWith("/support/") ||
    path === "/verify-2fa" ||
    path === "/provider/subscription" ||
    path.startsWith("/provider/subscription/")
  ) {
    return "sign_in";
  }
  if (path === "/provider" || path.startsWith("/provider/")) return "guest_landing";
  return "public";
}

export type ClaimDecision =
  | { ok: true; alreadyOwned: boolean }
  | { ok: false; error: string };

/** startClaim — listing must exist and not belong to someone else. */
export function decideStartClaim(input: {
  actorUserId: string;
  existingOwnerUserId?: string | null;
  listingFound: boolean;
  adminOnly?: boolean;
  isAdmin?: boolean;
}): ClaimDecision {
  if (!input.listingFound) return { ok: false, error: LISTING_NOT_FOUND };
  if (input.adminOnly && !input.isAdmin) return { ok: false, error: LISTING_NOT_FOUND };
  const owner = (input.existingOwnerUserId || "").trim();
  if (owner && !sameUser(input.actorUserId, owner)) return { ok: false, error: CLAIM_ALREADY_TAKEN };
  return { ok: true, alreadyOwned: Boolean(owner) && sameUser(input.actorUserId, owner) };
}

export type BillCheckoutDecision =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; error: string };

/**
 * createBillCheckout gates, in handler order. Stripe is not called until ok
 * and not already paid. Guest / other-parent always look like "not found".
 */
export function decideBillCheckout(input: {
  actorUserId?: string | null;
  bill?: { parentUserId: string; status: BillStatus } | null;
  stripeLive: boolean;
}): BillCheckoutDecision {
  if (!input.stripeLive) return { ok: false, error: BILL_LEDGER_ONLY };
  if (!input.bill) return { ok: false, error: accessDeniedMessage("bill") };
  if (!sameUser(input.actorUserId, input.bill.parentUserId)) {
    return { ok: false, error: accessDeniedMessage("bill") };
  }
  if (input.bill.status === "paid") return { ok: true, alreadyPaid: true };
  if (
    !canCheckoutBill({
      actorUserId: (input.actorUserId || "").trim(),
      parentUserId: input.bill.parentUserId,
      status: input.bill.status,
    })
  ) {
    return { ok: false, error: BILL_NOT_OPEN };
  }
  return { ok: true, alreadyPaid: false };
}

/** Connect destination only when the centre account can take charges. */
export function resolveConnectDestination(input: {
  stripeAccountId?: string | null;
  chargesEnabled?: number | boolean | null;
}): string | null {
  const id = (input.stripeAccountId || "").trim();
  if (!id) return null;
  if (!input.chargesEnabled) return null;
  return id;
}

export type CatalogCheckoutDecision = { ok: true; savedOnly?: boolean } | { ok: false; error: string };

export function decideParentPlusCheckout(input: { stripeLive: boolean; priceId?: string | null }): CatalogCheckoutDecision {
  if (!input.stripeLive) return { ok: false, error: PLUS_LEDGER_ONLY };
  if (!(input.priceId || "").trim()) return { ok: false, error: PLUS_PRICE_MISSING };
  return { ok: true };
}

export function decideProviderCheckout(input: {
  plan: string;
  stripeLive: boolean;
  priceId?: string | null;
  siteCount?: number;
}): CatalogCheckoutDecision {
  if (input.plan === "free") return { ok: true, savedOnly: true };
  if (!input.stripeLive) return { ok: false, error: PROVIDER_LEDGER_ONLY };
  if (!(input.priceId || "").trim()) return { ok: false, error: PROVIDER_PRICE_MISSING };
  if (input.plan === "network" && (input.siteCount ?? 0) < 3) {
    return { ok: false, error: NETWORK_MIN_SITES };
  }
  return { ok: true };
}

export type RequiredUserIdDecision =
  | { ok: true; userId: string }
  | { ok: false; code: "unauthorized" | "fail_closed"; error: string };

/**
 * requireUserId decision tree. Auth off + a real DATABASE_URL fails closed
 * so every visitor does not share one dev user.
 */
export function resolveRequiredUserId(input: {
  authConfigured: boolean;
  databaseConfigured: boolean;
  sessionUserId?: string | null;
}): RequiredUserIdDecision {
  if (!input.authConfigured) {
    if (input.databaseConfigured) {
      return { ok: false, code: "fail_closed", error: AUTH_FAIL_CLOSED };
    }
    return { ok: true, userId: DEV_FALLBACK_USER_ID };
  }
  const id = (input.sessionUserId || "").trim();
  if (!id) return { ok: false, code: "unauthorized", error: AUTH_UNAUTHORIZED };
  return { ok: true, userId: id };
}

export type SameSiteDecision = "allow" | "block";

/** Fetch-Metadata sibling isolation used by authMiddleware. */
export function evaluateSameSiteRequest(input: {
  secFetchSite?: string | null;
  secFetchDest?: string | null;
  secFetchMode?: string | null;
  method?: string | null;
}): SameSiteDecision {
  const site = (input.secFetchSite || "").trim();
  if (!site || site === "same-origin" || site === "none") return "allow";
  const dest = (input.secFetchDest || "").trim();
  const isTopLevelGet =
    (input.secFetchMode || "").trim() === "navigate" &&
    (input.method || "GET").toUpperCase() === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  return isTopLevelGet ? "allow" : "block";
}
