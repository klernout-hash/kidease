/**
 * One CAD money format for the whole app. No package imports (node:test loads it).
 *
 * French: fr-CA with a CAD marker and two decimals, always "1,00 $ CA".
 * Intl's fr-CA output is "1,00 $" with no country, which read as US dollars
 * on the Nov 25 test. English always labels Canadian dollars with CA$.
 */
const NBSP = "\u00a0";

export type CadFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function isFrenchLocale(locale: string | null | undefined): boolean {
  return /^fr\b/i.test(String(locale || "").trim());
}

/** French amount with the CAD marker: "1 234,50 $ CA". */
export function frenchCad(dollars: number): string {
  const value = Number.isFinite(Number(dollars)) ? Number(dollars) : 0;
  const text = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  // fr-CA renders "1,00 $"; some ICU builds use "$ CA" already.
  if (/\$\s*CA\b/.test(text)) return text.replace(/\s*\$\s*CA\b/, `${NBSP}$${NBSP}CA`);
  return text.replace(/\s*\$/, `${NBSP}$${NBSP}CA`);
}

/** Format dollars as CAD for a BCP 47 tag ("en-CA", "fr-CA", "fr", ...). */
export function formatCad(dollars: number, locale: string, options: CadFormatOptions = {}): string {
  if (isFrenchLocale(locale)) return frenchCad(dollars);
  const value = Number.isFinite(Number(dollars)) ? Number(dollars) : 0;
  const tag = locale || "en-CA";
  const formatter = new Intl.NumberFormat(tag, { style: "currency", currency: "CAD", ...options });
  if (!/^en\b/i.test(tag)) return formatter.format(value);
  return formatter.formatToParts(value).map((part) => part.type === "currency" ? "CA$" : part.value).join("");
}
