/**
 * Towns that match what a government officer typed. Names that start with the
 * text come first. "ALL" is the no-filter option, never a town.
 */
export function govTownMatches(cities: readonly string[], typed: string, limit = 8): string[] {
  const needle = typed.trim().toLowerCase();
  if (needle.length < 2) return [];
  const towns = cities.filter((city) => city && city !== "ALL");
  const starts = towns.filter((city) => city.toLowerCase().startsWith(needle));
  const contains = towns.filter((city) => !city.toLowerCase().startsWith(needle) && city.toLowerCase().includes(needle));
  return [...starts, ...contains].slice(0, limit);
}
