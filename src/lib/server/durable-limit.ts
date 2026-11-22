import { getSql } from "@/lib/db";
import { limitAllows } from "@/lib/public-endpoint-guard";

type Bucket = { count: number; start: number };
const memory = new Map<string, Bucket>();

function takeMemory(key: string, max: number, windowMs: number, now: number): boolean {
  const current = memory.get(key);
  if (!current || now - current.start >= windowMs) {
    memory.set(key, { count: 1, start: now });
    return true;
  }
  current.count += 1;
  return limitAllows(current.count, max);
}

/** Shared counter in the rateLimit table. Falls back to this instance if the table is down. */
export async function takeDurableLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const safeKey = String(key || "").slice(0, 180);
  const now = Date.now();
  try {
    const sql = await getSql();
    const rows = await sql<{ count: number }>`
      insert into "rateLimit" ("id", "key", "count", "lastRequest")
      values (${safeKey}, ${safeKey}, 1, ${now})
      on conflict ("id") do update set
        "count" = case
          when ${now} - "rateLimit"."lastRequest" >= ${windowMs} then 1
          else "rateLimit"."count" + 1
        end,
        "lastRequest" = case
          when ${now} - "rateLimit"."lastRequest" >= ${windowMs} then ${now}
          else "rateLimit"."lastRequest"
        end
      returning "count"
    `;
    return limitAllows(Number(rows[0]?.count ?? 1), max);
  } catch (err) {
    console.error("[public-limit] durable counter unavailable", err instanceof Error ? err.name : "error");
    return takeMemory(safeKey, max, windowMs, now);
  }
}

export function clientAddress(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || "unknown").slice(0, 64);
}
