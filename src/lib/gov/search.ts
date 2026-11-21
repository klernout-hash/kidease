/**
 * Government desk filters. Empty strings are omitted so TanStack Router does
 * not 307 `/fr/gov` to `/fr/gov?province=&region=&city=` (and back).
 */
export type GovDeskSearch = {
  province?: string;
  region?: string;
  city?: string;
  centre?: string;
  tab?: string;
};

function trimmed(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function govDeskSearch(
  search: Record<string, unknown>,
  opts?: { centre?: boolean; tab?: boolean },
): GovDeskSearch {
  const province = trimmed(search.province, 40);
  const region = trimmed(search.region, 80);
  const city = trimmed(search.city, 80);
  const centre = opts?.centre ? trimmed(search.centre, 140) : "";
  const tab = opts?.tab ? trimmed(search.tab, 40) : "";
  return {
    ...(province ? { province } : {}),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    ...(centre ? { centre } : {}),
    ...(tab ? { tab } : {}),
  };
}

export function govFilter(value: string | undefined): string {
  return value ?? "";
}
