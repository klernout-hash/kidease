/**
 * Before a centre accepts an enrolment request it sees basic child info only
 * (name, birthdate, age). Health record (allergies, EpiPen, medical notes,
 * medications, doctor, diet, emergency contacts, pickup people, notes) unlocks
 * on acceptance. Data minimisation (Quebec Law 25, PIPEDA).
 * Relative imports only so Node tests can load this file.
 */
import type { BookingStatus, Child } from "./types.ts";

export const HEALTH_UNLOCKED_STATUSES: readonly BookingStatus[] = ["accepted", "active"];

export function centreMaySeeChildHealth(status: BookingStatus | string | null | undefined): boolean {
  return HEALTH_UNLOCKED_STATUSES.includes(String(status || "") as BookingStatus);
}

export function basicChildBeforeAcceptance(child: Child): Child {
  return {
    ...child,
    allergies: "",
    epiPen: false,
    medicalNotes: "",
    medications: "",
    doctorName: "",
    doctorPhone: "",
    foodsAvoid: "",
    diet: "",
    emergencyName: "",
    emergencyPhone: "",
    pickupPeople: "",
    notes: "",
  };
}

/** Centre view of a child for one request: full after acceptance, basic before. */
export function childForCentre(child: Child | null, status: BookingStatus | string | null | undefined): Child | null {
  if (!child) return null;
  return centreMaySeeChildHealth(status) ? child : basicChildBeforeAcceptance(child);
}
