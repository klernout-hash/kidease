/**
 * Province / territory → IANA time zone, for clocks shown to Canadians.
 * Nunavut uses Eastern (Iqaluit is not in the tour director list).
 * Saskatchewan is Central with no daylight-saving shift. Newfoundland is
 * a half-hour zone. No app imports, so node tests load this file directly.
 */
export const PROVINCE_TIMEZONES = {
  BC: "America/Vancouver",
  YT: "America/Whitehorse",
  AB: "America/Edmonton",
  NT: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  QC: "America/Toronto",
  NU: "America/Toronto",
  NB: "America/Halifax",
  NS: "America/Halifax",
  PE: "America/Halifax",
  NL: "America/St_Johns",
} as const;

export type ProvinceTimezone = (typeof PROVINCE_TIMEZONES)[keyof typeof PROVINCE_TIMEZONES];

/** IANA zone for a two-letter province code, or null when unknown ("ALL", "", junk). */
export function provinceTimezone(province?: string | null): ProvinceTimezone | null {
  const code = String(province ?? "").trim().toUpperCase();
  return (PROVINCE_TIMEZONES as Record<string, ProvinceTimezone>)[code] ?? null;
}
