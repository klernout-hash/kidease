/**
 * French auth mail and French reset links for Quebec / French.
 * No app imports, so node tests can load this file directly.
 * Flag off keeps today's English subjects and URLs.
 */

export function authMailFrench(input: {
  flagOn: boolean;
  locale?: string | null;
  province?: string | null;
  country?: string | null;
  acceptLanguage?: string | null;
}): boolean {
  if (!input.flagOn) return false;
  const country = String(input.country || "").trim().toUpperCase();
  if (country === "CA" && provinceCode(input.province) === "QC") return true;
  if (isFrenchTag(input.locale)) return true;
  return acceptStartsFrench(input.acceptLanguage);
}

export function preferFrenchResetUrl(url: string, french: boolean): string {
  if (!french || !url) return url;
  try {
    const absolute = /^https?:\/\//i.test(url);
    const parsed = new URL(url, "https://www.kidease.ca");
    if (parsed.pathname !== "/reset-password") return url;
    parsed.pathname = "/fr/reset-password";
    if (!absolute) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

export const RESET_SUBJECT_EN = "Reset your KidEase password";
export const RESET_SUBJECT_FR = "Réinitialisez votre mot de passe KidEase";
export const OTP_SUBJECT_EN = "Your KidEase sign-in code";
export const OTP_SUBJECT_FR = "Votre code de connexion KidEase";

function provinceCode(raw?: string | null): string {
  let value = String(raw || "").trim().toUpperCase();
  if (!value) return "";
  if (value.includes("-")) value = value.split("-").pop() || value;
  if (value === "QUEBEC" || value === "QUÉBEC") return "QC";
  return value;
}

function isFrenchTag(raw?: string | null): boolean {
  const value = String(raw || "").trim().toLowerCase();
  return value === "fr" || value.startsWith("fr-");
}

function acceptStartsFrench(header?: string | null): boolean {
  const first = String(header || "").split(",")[0] || "";
  const tag = first.split(";")[0]?.trim().toLowerCase() || "";
  return isFrenchTag(tag);
}
