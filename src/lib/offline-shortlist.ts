import { isNative } from "./native.ts";

const KEY = "ke-offline-shortlist";

export type OfflineSaved = {
  id: string;
  name: string;
  city: string;
  slug: string;
};

export function offlineSavedRows(rows: readonly OfflineSaved[]): OfflineSaved[] {
  const seen = new Set<string>();
  const out: OfflineSaved[] = [];
  for (const row of rows) {
    const id = row.id.trim();
    const slug = row.slug.trim();
    const name = row.name.trim();
    if (!id || !slug || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, city: row.city.trim(), slug });
    if (out.length >= 30) break;
  }
  return out;
}

export async function mirrorOfflineSaved(rows: readonly OfflineSaved[]): Promise<void> {
  if (typeof window === "undefined" || !isNative()) return;
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: KEY, value: JSON.stringify(offlineSavedRows(rows)) });
}

export async function readOfflineSaved(): Promise<OfflineSaved[]> {
  if (typeof window === "undefined" || !isNative()) return [];
  const { Preferences } = await import("@capacitor/preferences");
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as OfflineSaved[];
    return Array.isArray(parsed) ? offlineSavedRows(parsed) : [];
  } catch {
    return [];
  }
}
