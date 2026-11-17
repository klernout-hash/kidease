/**
 * The last search place, child age, and monthly budget.
 * Guests keep it on this device. A signed-in parent can also keep it on their profile.
 * Reset clears all three. A missing place is not filled in with a city.
 */

import { isInCanada } from "./canada-origin.ts";

export const SEARCH_MEMORY_KEY = "kidease-search-memory";

export const SEARCH_MEMORY_AGES = ["any", "infant", "toddler", "preschool"] as const;
export type SearchMemoryAge = (typeof SEARCH_MEMORY_AGES)[number];

export type SearchMemory = {
  label: string;
  lat: number;
  lng: number;
  age: SearchMemoryAge;
  budgetMonthly: number | null;
};

function cleanLabel(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function ageOf(value: unknown): SearchMemoryAge {
  return (SEARCH_MEMORY_AGES as readonly string[]).includes(String(value)) ? (value as SearchMemoryAge) : "any";
}

function budgetOf(value: unknown): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
  return n;
}

export function parseSearchMemory(value: unknown): SearchMemory | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { label?: unknown; lat?: unknown; lng?: unknown; age?: unknown; budgetMonthly?: unknown };
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const label = cleanLabel(row.label);
  if (!label || !isInCanada(lat, lng)) return null;
  return { label, lat, lng, age: ageOf(row.age), budgetMonthly: budgetOf(row.budgetMonthly) };
}

export function readSearchMemory(raw: string | null): SearchMemory | null {
  if (!raw) return null;
  try {
    return parseSearchMemory(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function emptySearchMemory(): SearchMemory {
  return { label: "", lat: 0, lng: 0, age: "any", budgetMonthly: null };
}

/** True when the URL already chose a place or an age, so memory must not replace it. */
export function searchUrlOwnsMemory(input: { q?: string; city?: string; age?: string; ages?: string }): boolean {
  return Boolean((input.q || "").trim() || (input.city || "").trim() || (input.age || "").trim() || (input.ages || "").trim());
}
