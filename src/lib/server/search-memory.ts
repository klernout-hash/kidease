import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { searchMemoryEnabled } from "@/lib/features";
import { parseSearchMemory, type SearchMemory } from "@/lib/search-memory";

let ensured = false;

async function ensure(sql: Sql) {
  if (ensured) return;
  await sql.query("alter table profiles add column if not exists search_memory jsonb");
  ensured = true;
}

export const loadSearchMemory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!searchMemoryEnabled()) return { enabled: false as const, memory: null };
    try {
      const sql = await getSql();
      await ensure(sql);
      const rows = await sql<{ search_memory: unknown }>`
        select search_memory from profiles where user_id = ${context.userId} limit 1
      `;
      return { enabled: true as const, memory: parseSearchMemory(rows[0]?.search_memory) };
    } catch {
      return { enabled: true as const, memory: null };
    }
  });

export const saveSearchMemory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SearchMemory | null) => input)
  .handler(async ({ context, data }) => {
    if (!searchMemoryEnabled()) return { ok: false as const, reason: "off" as const };
    const memory = data ? parseSearchMemory(data) : null;
    if (data && !memory) return { ok: false as const, reason: "invalid" as const };
    const sql = await getSql();
    await ensure(sql);
    await sql`
      update profiles set search_memory = ${memory ? JSON.stringify(memory) : null}::jsonb
      where user_id = ${context.userId}
    `;
    return { ok: true as const };
  });
