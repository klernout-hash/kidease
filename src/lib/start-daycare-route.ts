/** Query/path helpers deliberately do not import provincial guide copy. */
export const START_DAYCARE_PT_CODES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;
const START_DAYCARE_CODE_SET = new Set<string>(START_DAYCARE_PT_CODES);

/** Same-page query only: never `/start-a-daycare/:pt`. */
export function parseStartDaycareSearch(s: Record<string, unknown>): { pt?: string; q?: string } {
  const raw = typeof s.pt === "string" ? s.pt.trim().toUpperCase() : "";
  const q = typeof s.q === "string" ? s.q.trim().slice(0, 80) : "";
  const out: { pt?: string; q?: string } = {};
  if (START_DAYCARE_CODE_SET.has(raw)) out.pt = raw;
  if (q) out.q = q;
  return out;
}

export function startDaycarePath(locale: string): "/start-a-daycare" | "/fr/start-a-daycare" {
  return locale === "fr" ? "/fr/start-a-daycare" : "/start-a-daycare";
}
