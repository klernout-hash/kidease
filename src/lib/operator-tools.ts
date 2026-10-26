import { isKidEaseOperatorEmail } from "./admin-email.ts";

/**
 * Guest view, View as, the test-listing toggle, site health, the location
 * checker, and People search. The mailbox is the gate. Role alone is not.
 */
export function canUseOperatorTools(email: string | null | undefined): boolean {
  return isKidEaseOperatorEmail(email);
}
