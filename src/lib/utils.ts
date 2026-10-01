import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { decodeHtml } from "./html-text.ts";
import type { AgeGroup, Locale } from "./types";
import { localeTag } from "./languages.ts";

export { decodeHtml };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uniqueById<T extends { id: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/** Public listing prose. Decodes entities so the UI never shows a literal `&amp;`. */
export function displayListingText(value: string | null | undefined) {
  return decodeHtml(value);
}

/**
 * Proper names stay as stored. Do not swap `name` / `nameFr` because the UI
 * language changed — a Quebec registry name stays French in English chrome.
 */
export function storedCentreName(name?: string | null, nameFr?: string | null) {
  const primary = (name || "").trim();
  const french = (nameFr || "").trim();
  return displayCentreName(primary || french);
}

/** Registry typos we refuse to show on parent-facing cards. Display only — the master row stays as stored. */
export function displayCentreName(value: string | null | undefined) {
  const decoded = decodeHtml(value)
    .replace(/[“”]/g, "\"")
    .replace(/(^|\s)"+|"+(\s|$)/g, "$1$2")
    .replace(/\bCetnre\b/g, "Centre")
    .replace(/\bCetnres\b/g, "Centres")
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n: string, suf: string) => `${n}${suf.toLowerCase()}`)
    .replace(/\s+-\s*/g, " – ")
    .replace(/([a-z])-([A-Z])/g, "$1 – $2")
    .replace(/\\+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s,;:–—-]+$/g, "");
  const stripped = decoded.replace(/,\s+the$/i, "");
  const named =
    stripped === decoded ? decoded : /^the\b/i.test(stripped) ? stripped : `The ${stripped}`;
  return titleCaseScrapedName(named);
}

const NAME_KEEP_UPPER = new Set(["ymca", "ywca", "abc", "ece", "cpr"]);

/** Registries ship ALL CAPS. Title-case those only. Mixed-case names stay put. */
function titleCaseScrapedName(value: string) {
  const letters = value.match(/[A-Za-zÀ-ÿ]/g) ?? [];
  if (letters.length < 4) return value;
  const upper = letters.filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length;
  if (upper / letters.length < 0.75) return value;
  return value
    .toLowerCase()
    .split(/(\s+|[-–/])/)
    .map((part) => {
      if (!/[a-zà-ÿ]/i.test(part)) return part;
      if (NAME_KEEP_UPPER.has(part)) return part.toUpperCase();
      return part.charAt(0).toLocaleUpperCase() + part.slice(1);
    })
    .join("");
}

export function money(cad: number, locale: Locale = "en") {
  const cents = Math.round(Math.abs(Number(cad)) * 100) % 100 !== 0;
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(cad);
}

export function nid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function monthsBetween(birthdate: string, at = new Date()) {
  const d = new Date(`${birthdate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  let months = (at.getFullYear() - d.getFullYear()) * 12 + (at.getMonth() - d.getMonth());
  if (at.getDate() < d.getDate()) months -= 1;
  return Math.max(0, months);
}

export function ageGroupFromMonths(months: number): AgeGroup {
  if (months < 18) return "infant";
  if (months < 36) return "toddler";
  return "preschool";
}

export function formatMonth(ym: string, locale: Locale = "en") {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y || 2026, (m || 1) - 1, 1);
  return new Intl.DateTimeFormat(localeTag(locale), { month: "long", year: "numeric" }).format(d);
}

export function formatAgeRange(min: number, max: number) {
  return `${min} m – ${max} m`;
}

export function nextMonths(count = 6, from = new Date()) {
  const out: string[] = [];
  const y = from.getFullYear();
  const m = from.getMonth();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(y, m + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
