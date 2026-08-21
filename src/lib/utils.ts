import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AgeGroup, Locale } from "./types";
import { localeTag } from "./languages";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(cad: number, locale: Locale = "en") {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
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
