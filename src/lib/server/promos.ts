import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { promoPlan, type PromoPlanId } from "@/lib/promos";

export async function overlayPriority<T extends { id: string; priority?: boolean; priorityUntil?: string | null }>(
  items: T[],
): Promise<T[]> {
  if (!items.length) return items;
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; priority_until: string }>`
      select id, priority_until from daycares
      where priority_until is not null and priority_until > now()
    `.catch(() => [] as { id: string; priority_until: string }[]);
    if (!rows.length) return items;
    const until = new Map(rows.map((r) => [r.id, r.priority_until]));
    return items.map((item) => {
      const u = until.get(item.id);
      return u ? { ...item, priority: true, priorityUntil: u } : item;
    });
  } catch {
    return items;
  }
}

export function sortPriorityFirst<T extends { priority?: boolean }>(items: T[]) {
  return [...items].sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)));
}

export const promoteListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; plan: PromoPlanId }) => input)
  .handler(async ({ context, data }) => {
    const plan = promoPlan(data.plan);
    if (!plan) throw new Error("Choose a promotion plan");
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    if (!own[0]) throw new Error("Not your listing");
    const current = await sql<{ priority_until: string | null }>`
      select priority_until from daycares where id = ${data.daycareId}
    `.catch(() => [] as { priority_until: string | null }[]);
    const now = Date.now();
    const existing = current[0]?.priority_until ? Date.parse(current[0].priority_until) : 0;
    const startMs = Number.isFinite(existing) && existing > now ? existing : now;
    const ends = new Date(startMs + plan.days * 24 * 60 * 60 * 1000);
    const endsIso = ends.toISOString();
    const id = nid("pro");
    await sql`
      insert into listing_promos (id, daycare_id, user_id, plan, days, amount, status, ends_at)
      values (${id}, ${data.daycareId}, ${context.userId}, ${plan.id}, ${plan.days}, ${plan.amount}, ${"paid"}, ${endsIso})
    `;
    await sql`
      update daycares set priority_until = ${endsIso} where id = ${data.daycareId}
    `;
    return { ok: true as const, endsAt: endsIso, amount: plan.amount, days: plan.days };
  });
