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
