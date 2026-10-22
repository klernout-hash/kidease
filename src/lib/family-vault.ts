/**
 * Parent document vault rules. No database and no file bytes.
 * Immunization records and subsidy forms stay private until a parent shares one centre.
 */

import { R2_FAMILY_PREFIX, safeDocKeyPart } from "./private-docs.ts";

export const FAMILY_DOC_KINDS = ["immunization", "subsidy"] as const;
export type FamilyDocKind = (typeof FAMILY_DOC_KINDS)[number];

export const FAMILY_DOC_LIMIT = 12;

export function isFamilyDocKind(value: string | null | undefined): value is FamilyDocKind {
  return (FAMILY_DOC_KINDS as readonly string[]).includes((value || "").trim());
}

export function familyDocStorageKey(userId: string, docId: string, ext: string): string {
  const user = safeDocKeyPart(userId);
  const id = safeDocKeyPart(docId);
  const suffix = safeDocKeyPart(ext).replace(/^\.+/, "");
  if (!user || !id || !suffix) throw new Error("bad_key");
  const key = `${R2_FAMILY_PREFIX}/${user}/${id}.${suffix}`;
  if (!key.startsWith(`${R2_FAMILY_PREFIX}/`) || key.includes("..")) throw new Error("bad_key");
  return key;
}

export function canShareWithCentre(centreId: string, chosenIds: readonly string[]): boolean {
  const id = centreId.trim();
  if (!id) return false;
  return chosenIds.some((chosen) => chosen === id);
}

export function shareIsOpen(revokedAt: string | null | undefined): boolean {
  return !(revokedAt || "").trim();
}
