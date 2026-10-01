/**
 * Photo check warns on blur, darkness, and duplicates.
 * A clearly visible child's face is held for admin review and cannot be kept by the daycare.
 * The model only returns those booleans. It cannot add a fee, licence, spot, or review.
 */

import { z } from "zod";

export const PHOTO_CHECK_DARK_LUMA = 40;
export const PHOTO_CHECK_BLUR_EDGE = 8;

export const photoCheckSchema = z
  .object({
    blurry: z.boolean(),
    dark: z.boolean(),
    childFace: z.boolean(),
  })
  .strict();

export type PhotoCheckModel = z.infer<typeof photoCheckSchema>;

export type PhotoWarning = "blurry" | "dark" | "duplicate";

export type PhotoCheckOutcome = {
  warnings: PhotoWarning[];
  hold: boolean;
  source: "model" | "fallback";
};

export const PHOTO_CHECK_SYSTEM = [
  "You look at one photo. Reply with JSON only.",
  'Keys: blurry, dark, childFace. Each value is true or false.',
  "blurry is true only when the picture is too soft to see the room.",
  "dark is true only when the picture is too dim to see the room.",
  "childFace is true only when a child's face is clearly visible.",
  "Do not name anyone. Do not guess a daycare, fee, licence, spot, or review.",
  "If you cannot tell, use false.",
].join(" ");

export const PHOTO_CHECK_USER = "Classify this photo. Do not describe people.";

export const PHOTO_CHECK_EVENTS = ["photo_check_warned", "photo_check_held", "photo_check_allowed", "photo_check_rejected"] as const;

export function photoCheckEventProps(input: Record<string, unknown> = {}): Record<string, string> {
  const id = typeof input.daycare_id === "string" ? input.daycare_id.trim().slice(0, 80) : "";
  return id && !id.includes("@") ? { daycare_id: id } : {};
}

export function localPhotoFacts(input: {
  meanLuma: number;
  edgeScore: number;
  sha256: string;
  existingHashes: string[];
}): { blurry: boolean; dark: boolean; duplicate: boolean } {
  const luma = Number.isFinite(input.meanLuma) ? input.meanLuma : 255;
  const edge = Number.isFinite(input.edgeScore) ? input.edgeScore : 99;
  const hash = input.sha256.trim().toLowerCase();
  return {
    dark: luma < PHOTO_CHECK_DARK_LUMA,
    blurry: edge < PHOTO_CHECK_BLUR_EDGE,
    duplicate: Boolean(hash) && input.existingHashes.some((item) => item.trim().toLowerCase() === hash),
  };
}

/** Model booleans win for blur, dark, and a child's face. A duplicate is only a matching hash. */
export function photoCheckOutcome(input: {
  model: PhotoCheckModel | null;
  local: { blurry: boolean; dark: boolean; duplicate: boolean };
}): PhotoCheckOutcome {
  const model = input.model;
  const blurry = model ? model.blurry : input.local.blurry;
  const dark = model ? model.dark : input.local.dark;
  const warnings: PhotoWarning[] = [];
  if (blurry) warnings.push("blurry");
  if (dark) warnings.push("dark");
  if (input.local.duplicate) warnings.push("duplicate");
  return {
    warnings,
    hold: model ? model.childFace : false,
    source: model ? "model" : "fallback",
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("sha256", data);
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
