/**
 * Family news, media consent, pickup, attendance, meals, incidents, portfolios.
 * Alerts are held. No push and no email leaves this file.
 */
import { holdAlert, type HoldReason } from "./phase1-gate.ts";

export const PRIORITY_ALLERGENS = ["peanut", "tree_nut", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame", "mustard", "sulphite"] as const;

export const ALLERGEN_LABELS: Record<(typeof PRIORITY_ALLERGENS)[number], { en: string; fr: string }> = {
  peanut: { en: "Peanut", fr: "Arachide" },
  tree_nut: { en: "Tree nut", fr: "Noix" },
  milk: { en: "Milk", fr: "Lait" },
  egg: { en: "Egg", fr: "Oeuf" },
  wheat: { en: "Wheat", fr: "Blé" },
  soy: { en: "Soy", fr: "Soya" },
  fish: { en: "Fish", fr: "Poisson" },
  shellfish: { en: "Shellfish", fr: "Crustacés" },
  sesame: { en: "Sesame", fr: "Sésame" },
  mustard: { en: "Mustard", fr: "Moutarde" },
  sulphite: { en: "Sulphite", fr: "Sulfite" },
};

export function audienceCanSee(audienceIds: readonly string[], familyId: string): boolean {
  return audienceIds.includes(familyId);
}

export function mediaAllowed(input: { taggedChildIds: readonly string[]; consentedChildIds: readonly string[] }): boolean {
  if (!input.taggedChildIds.length) return false;
  return input.taggedChildIds.every((id) => input.consentedChildIds.includes(id));
}

export function pickupAllowed(input: { contactId: string; activeIds: readonly string[]; restrictedIds: readonly string[] }): {
  ok: boolean;
  reason: "authorized" | "restricted" | "unlisted";
} {
  if (input.restrictedIds.includes(input.contactId)) return { ok: false, reason: "restricted" };
  if (!input.activeIds.includes(input.contactId)) return { ok: false, reason: "unlisted" };
  return { ok: true, reason: "authorized" };
}

export function pickupOverrideNotice(input: {
  flagOn: boolean;
  enabledAt: string | null;
  at: string;
  alreadySent: boolean;
  quiet: boolean;
}): { deliver: false; reason: HoldReason } {
  return holdAlert({ ...input, occurredAt: input.at, needsCasl: false, caslOk: true });
}

export type RollPerson = { id: string; accounted: boolean };

export function emergencyRoll(input: { opened: readonly RollPerson[]; laterCheckIns: readonly RollPerson[] }): RollPerson[] {
  const seen = new Map<string, RollPerson>();
  for (const person of [...input.opened, ...input.laterCheckIns]) seen.set(person.id, person);
  return [...seen.values()];
}

export function rollAlert(openMinutes: number, unaccounted: number): boolean {
  return openMinutes > 10 && unaccounted > 0;
}

export function arrivalNoteVisible(input: { childId: string; staffRoomChildIds: readonly string[] }): boolean {
  return input.staffRoomChildIds.includes(input.childId);
}

export function allergenConflict(menuTags: readonly string[], childTags: readonly string[]): "conflict" | "unknown" | "clear" {
  const known = new Set<string>(PRIORITY_ALLERGENS);
  if (menuTags.some((tag) => !known.has(tag)) || childTags.some((tag) => !known.has(tag))) return "unknown";
  if (menuTags.some((tag) => childTags.includes(tag))) return "conflict";
  return "clear";
}

export function canSeeAllergyBadge(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export function incidentVisible(input: { childId: string; viewerChildIds: readonly string[] }): boolean {
  return input.viewerChildIds.includes(input.childId);
}

export function redactOtherChildren(text: string, otherNames: readonly string[]): string {
  let out = text;
  for (const name of otherNames) {
    if (name.trim()) out = out.split(name).join("[other child]");
  }
  return out;
}

export function portfolioVisible(ownerGuardianIds: readonly string[], viewerId: string): boolean {
  return ownerGuardianIds.includes(viewerId);
}

export function guardianCanEditPickup(childGuardianIds: readonly string[], viewerId: string): boolean {
  return childGuardianIds.includes(viewerId);
}

export function restrictedListVisible(role: string | null | undefined): boolean {
  return role === "owner" || role === "director";
}
