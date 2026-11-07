import { splitPhotoList } from "./listing-photo.ts";

/** Local layout fixtures. Not photos of a real centre, and never saved onto a listing. */
export const DEMO_DAYCARE_PHOTOS = [
  "/photos/demo/daycare-01.webp",
  "/photos/demo/daycare-02.webp",
  "/photos/demo/daycare-03.webp",
  "/photos/demo/daycare-04.webp",
  "/photos/demo/daycare-05.webp",
  "/photos/demo/daycare-06.webp",
  "/photos/demo/daycare-07.webp",
  "/photos/demo/daycare-08.webp",
  "/photos/demo/daycare-09.webp",
  "/photos/demo/daycare-10.webp",
] as const;

export type CentreSearchRow = {
  id: string;
  name: string;
  nameFr?: string | null;
  city?: string | null;
  address?: string | null;
};

export function centreSearchText(row: CentreSearchRow): string {
  return [row.name, row.nameFr, row.city, row.address].filter(Boolean).join(" ").toLocaleLowerCase();
}

/** Search only the centres already passed in (the signed-in owner's list). */
export function filterOwnedCentres<T extends CentreSearchRow>(rows: T[], query: string): T[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return rows;
  return rows.filter((row) => centreSearchText(row).includes(q));
}

export function centrePublication(live: boolean | null | undefined): "listed" | "unpublished" {
  return live ? "listed" : "unpublished";
}

/** A stand-in tile such as the navy "QA TEST IMAGE" upload, not a centre photo. */
export function isQaStandInPhoto(src: string): boolean {
  let text = src;
  try {
    text = decodeURIComponent(src);
  } catch {
    text = src;
  }
  return /qa[\s_-]*test|test[\s_-]*image|qatestimage/i.test(text);
}

/**
 * Host overview and editor only. A trailing "(QA)" centre with at most one
 * photo, or any photo whose URL says it is a QA test image, uses the local
 * demo set for layout. Real multi-photo listings stay as stored.
 */
export function usesDemoPhotoPreview(row: {
  name?: string | null;
  photos?: string | string[] | null;
}): boolean {
  const photos = splitPhotoList(row.photos);
  if (photos.some(isQaStandInPhoto)) return true;
  // Official building paths are not interiors, so count the stored list, not the managed subset.
  return /\(qa\)\s*$/i.test((row.name ?? "").trim()) && photos.length <= 1;
}

export function demoPhotoAlt(template: string, n: number, total: number): string {
  return template.replace("{n}", String(n)).replace("{total}", String(total));
}
