/**
 * Canadian French punctuation: a narrow no-break space before ? ! ; :
 * URLs and clock times (10:30) stay as written.
 */
const URL_RE = /https?:\/\/[^\s)]+|mailto:[^\s)]+/gi;
/** Private-use mark so a URL can be put back. Not a control character. */
const SHIELD = "\uE000";

export function frenchTypography(input: string): string {
  const urls: string[] = [];
  const shielded = String(input ?? "").replace(URL_RE, (match) => {
    urls.push(match);
    return `${SHIELD}${urls.length - 1}${SHIELD}`;
  });
  const spaced = shielded
    .replace(/([\p{L}\p{N}\p{Pe}\p{Pf}"»])[ \u00A0]([?!;:])/gu, "$1\u202F$2")
    .replace(/([\p{L}\p{N}\p{Pe}\p{Pf}"»])([?!;:])/gu, (full, prev: string, punct: string, offset: number, source: string) => {
      const next = source[offset + full.length] ?? "";
      if (punct === ":" && /\d/.test(prev) && /\d/.test(next)) return full;
      return `${prev}\u202F${punct}`;
    });
  return spaced.replace(new RegExp(`${SHIELD}(\\d+)${SHIELD}`, "g"), (_m, index: string) => urls[Number(index)] ?? "");
}

/** French lines get the punctuation space. English stays as written. */
export function localeLine(locale: string, text: string): string {
  return locale === "fr" ? frenchTypography(text) : text;
}
