import type { DaycareCard } from "@/lib/types";

const KEY = "kidease-recent";
const MAX = 12;

export function readRecent(): DaycareCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => r && typeof r === "object" && typeof (r as DaycareCard).slug === "string") as DaycareCard[];
  } catch {
    return [];
  }
}

export function rememberViewed(item: DaycareCard) {
  if (typeof window === "undefined") return;
  const next = [item, ...readRecent().filter((r) => r.id !== item.id)].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("kidease-recent"));
}
