const DAY_MS = 24 * 60 * 60 * 1000;

type Entry = { body: string; expiresAt: number };
const memory = new Map<string, Entry>();

export function resetAiCacheForTests() {
  memory.clear();
}

export function readMemoryCache(key: string, now = Date.now()): string | null {
  const row = memory.get(key);
  if (!row || row.expiresAt <= now) {
    memory.delete(key);
    return null;
  }
  return row.body;
}

export function writeMemoryCache(key: string, body: string, now = Date.now()) {
  memory.set(key, { body, expiresAt: now + DAY_MS });
}

export const AI_CACHE_TTL_MS = DAY_MS;
