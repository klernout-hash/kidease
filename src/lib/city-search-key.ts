/**
 * Stored city key for large catalogues such as Montreal.
 * FEATURE_CITY_SEARCH_KEY defaults off. The old expression stays the query
 * until the flag is on and migration 0127 has filled city_search_key.
 */

export const CITY_SEARCH_FLAG = "FEATURE_CITY_SEARCH_KEY";

/** Same folding as the live directory query. Montréal becomes montreal. */
export const CITY_SEARCH_KEY_EXPR = `trim(regexp_replace(lower(translate(btrim(coalesce(city, '')), 'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÝŸýÿÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuYYyyCcNn')), '[^a-z0-9]+', ' ', 'g'))`;

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function citySearchKeyEnabled(env?: Record<string, string | undefined>): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[CITY_SEARCH_FLAG]);
}

/** Column name when the flag is on. The expression otherwise, so results match. */
export function cityDirectoryMatchSql(useStoredKey: boolean): string {
  return useStoredKey ? "city_search_key" : CITY_SEARCH_KEY_EXPR;
}
