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
