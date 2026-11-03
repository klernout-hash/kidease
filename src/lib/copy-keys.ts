import type { CopyKey } from "./copy-en.ts";

/** Parent Pay tab. Plan sentences stay off unless subscriptions are on. */
export function parentPayLeadKey(plansOn: boolean, stripeLive: boolean): CopyKey {
  if (plansOn) return stripeLive ? "ledgerLiveParent" : "ledgerOffParent";
  return stripeLive ? "ledgerLiveParentBills" : "ledgerOffParentBills";
}

export function parentPayEmptyKey(plansOn: boolean): CopyKey {
  return plansOn ? "noPaymentsLead" : "noPaymentsLeadBills";
}

/** Booking pay page. Plan sentences stay off unless subscriptions are on. */
export function bookingPayLeadKey(plansOn: boolean): CopyKey {
  return plansOn ? "bookingPayLeadHonest" : "bookingPayLeadBills";
}

/** Compare page. Plan sentences stay off unless subscriptions are on. */
export function compareEmptyKey(plansOn: boolean): CopyKey {
  return plansOn ? "compareEmpty" : "compareEmptyFree";
}

/** Get the app payments card. Plan sentences stay off unless subscriptions are on. */
export function featPayBodyKey(plansOn: boolean): CopyKey {
  return plansOn ? "featPayBody" : "featPayBodyBills";
}
