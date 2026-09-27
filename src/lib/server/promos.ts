import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { PromoPlanId } from "@/lib/promos";
import { assertCanMutateListing } from "@/lib/access-control";
import { assertPayCheckoutAllowed } from "@/lib/features";
import { resolveSessionDesks } from "@/lib/server/roles";

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

export function sortPriorityFirst<T extends { priority?: boolean; live?: boolean }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (Boolean(a.priority) !== Boolean(b.priority)) return a.priority ? -1 : 1;
    if (Boolean(a.live) !== Boolean(b.live)) return a.live ? -1 : 1;
    return 0;
  });
}

export const promoteListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; plan: PromoPlanId }) => input)
  .handler(async ({ context, data }) => {
    const session = await resolveSessionDesks(context.userId);
    assertPayCheckoutAllowed(session.role);
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    assertCanMutateListing(own[0] ? [data.daycareId] : [], data.daycareId);
    throw new Error(
      "Priority weeks are not in the Stripe catalogue. Use a plan or add-on from Promote. Nothing was charged.",
    );
  });
