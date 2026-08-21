const KEY = "kidease-compare";
const MAX = 3;

export function readCompare(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function writeCompare(ids: string[]) {
  window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  window.dispatchEvent(new Event("kidease-compare"));
}

export function toggleCompare(id: string): string[] {
  const cur = readCompare();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id];
  writeCompare(next);
  return next;
}

export function clearCompare() {
  writeCompare([]);
}
