/**
 * PIPEDA and Quebec Law 25: collect less. Parent and guest screens do not
 * ask for a child's name, birthdate, health, allergies, immunization,
 * medicines, or a journal. Tables stay. New writes stop.
 */
export const CHILD_PROFILES_COLLECTED = false;

export const CHILD_PROFILE_CLOSED = "KidEase does not collect child profiles.";

export const PARENT_CHILD_NAV_IDS = ["children", "care", "documents"] as const;

export function parentNavCollectsChildData(id: string): boolean {
  if (CHILD_PROFILES_COLLECTED) return true;
  return !PARENT_CHILD_NAV_IDS.includes(id as (typeof PARENT_CHILD_NAV_IDS)[number]);
}
