/** One confirm row per centre id, and one per name in the same city. */
export function dedupeConfirmListings<T extends { id: string; name?: string | null; city?: string | null }>(
  rows: T[],
): T[] {
  const seenId = new Set<string>();
  const seenPlace = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.id || seenId.has(row.id)) continue;
    const place = `${(row.name || "").trim().toLowerCase()}|${(row.city || "").trim().toLowerCase()}`;
    if (place !== "|" && seenPlace.has(place)) continue;
    seenId.add(row.id);
    if (place !== "|") seenPlace.add(place);
    out.push(row);
  }
  return out;
}
