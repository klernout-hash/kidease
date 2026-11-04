/** Start-window tokens for search. Kept off the fee-list bundle so the home hero does not download it. */
export const SEARCH_STARTS = ["now", "this-month", "next-month"] as const;
export type SearchStart = (typeof SEARCH_STARTS)[number];

export function isSearchStart(raw: unknown): raw is SearchStart {
  return (SEARCH_STARTS as readonly string[]).includes(typeof raw === "string" ? raw : "");
}
