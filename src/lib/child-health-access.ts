/** Who may read a child's immunization, allergy, and medication notes. */

export type HealthViewer = "parent" | "provider" | "staff" | "public" | "admin";

export function canReadChildHealth(input: {
  viewer: HealthViewer;
  viewerId: string;
  childOwnerId: string;
  enrolledAtCentre: boolean;
}): boolean {
  if (!input.viewerId) return false;
  if (input.viewer === "public" || input.viewer === "admin") return false;
  if (input.viewer === "parent") return input.viewerId === input.childOwnerId;
  if (input.viewer === "provider" || input.viewer === "staff") return input.enrolledAtCentre;
  return false;
}

/** Blank saved fields stay blank. Nothing is filled in. */
export function healthLogFields(input: {
  immunizationStatus: string | null | undefined;
  immunizationNote: string | null | undefined;
  allergies: string | null | undefined;
  medications: string | null | undefined;
}) {
  const text = (value: string | null | undefined) => String(value || "").trim();
  return {
    immunizationStatus: text(input.immunizationStatus),
    immunizationNote: text(input.immunizationNote),
    allergies: text(input.allergies),
    medications: text(input.medications),
  };
}
