/**
 * Accent-insensitive text match for guide search.
 * Kept separate so a later shared SearchableAccordion can use the same fold.
 */

export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .toLocaleLowerCase("en");
}

export function searchTextMatches(query: string, text: string): boolean {
  const needle = foldSearchText(query.trim());
  if (!needle) return true;
  return foldSearchText(text).includes(needle);
}
