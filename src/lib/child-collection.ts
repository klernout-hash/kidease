/**
 * Parents can keep a child profile (name, birthdate, and care details).
 * A centre sees it only after the parent enrols or confirms a share.
 * Guests, analytics, and Help chat do not receive it.
 */
export const CHILD_PROFILES_COLLECTED = true;

export const CHILD_PROFILE_CLOSED = "KidEase does not collect child profiles.";

export const PARENT_CHILD_NAV_IDS = ["children", "care", "documents"] as const;

export function parentNavCollectsChildData(id: string): boolean {
  if (CHILD_PROFILES_COLLECTED) return true;
  return !PARENT_CHILD_NAV_IDS.includes(id as (typeof PARENT_CHILD_NAV_IDS)[number]);
}
