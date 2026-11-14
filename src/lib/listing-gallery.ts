/** Keep photo navigation valid when a listing has fewer photos after an update. */
export function galleryIndex(index: number, count: number): number {
  if (count < 1 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

export function nextGalleryIndex(index: number, count: number, direction: -1 | 1): number {
  if (count < 2) return 0;
  return (galleryIndex(index, count) + direction + count) % count;
}

/** Missing room images must never select -1 or open an unrelated photograph. */
export function roomPhotoIndex(photos: readonly string[], src: string): number | null {
  const index = photos.indexOf(src);
  return index >= 0 ? index : null;
}
