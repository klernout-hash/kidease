/** In-memory spend gate for xAI. Auth is enforced separately via authMiddleware. */

const WINDOW_MS = 60_000;
const LIMIT = 20;

const hits = new Map<string, { n: number; reset: number }>();

export function allowAiSpend(userId: string, now = Date.now(), limit = LIMIT, windowMs = WINDOW_MS): boolean {
  const id = String(userId || "").trim();
  if (!id) return false;
  const row = hits.get(id);
  if (!row || row.reset <= now) {
    hits.set(id, { n: 1, reset: now + windowMs });
    return true;
  }
  if (row.n >= limit) return false;
  row.n += 1;
  return true;
}

export function resetAiSpendForTests() {
  hits.clear();
}
