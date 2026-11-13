import { isProvinceCode } from "./places.ts";

/** An organization stored as CA or ALL may see every province. A province code may not. */
export function govOrgIsNational(province: string | null | undefined): boolean {
  const code = String(province || "").trim().toUpperCase();
  return code === "ALL" || code === "CA";
}

export function govActorProvince(stored: string | null | undefined): { province: string; national: boolean } | null {
  const raw = String(stored || "").trim().toUpperCase();
  if (govOrgIsNational(raw)) return { province: "ALL", national: true };
  if (isProvinceCode(raw)) return { province: raw, national: false };
  return null;
}

export function govScopeProvince(actor: { province: string; national: boolean }, requested: string | null | undefined): string {
  if (!actor.national) return actor.province;
  const code = String(requested || "").trim().toUpperCase();
  if (code === "ALL" || isProvinceCode(code)) return code;
  return "ALL";
}

export function govProvinceChoices<T extends { code: string }>(
  choices: readonly T[],
  actor: { province: string; national: boolean },
): T[] {
  if (actor.national) return [...choices];
  return choices.filter((row) => row.code === actor.province);
}
