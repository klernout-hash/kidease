import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireSupport } from "@/lib/server/roles";
import {
  allowThreadReferenceLookup,
  conversationIdFromReference,
  threadReferenceCard,
  threadReferenceFromId,
  type ThreadReferenceCard,
} from "@/lib/thread-reference";

export type ThreadReferenceLookup =
  | { found: false; retry?: boolean }
  | { found: true; card: ThreadReferenceCard };

async function audit(actorUserId: string, action: string, targetId: string) {
  const sql = await getSql();
  const { nid } = await import("@/lib/utils");
  await sql
    .query(
      `insert into support_audit_log (id, actor_user_id, action, target_type, target_id, meta)
       values ($1, $2, $3, 'conversation', $4, null)`,
      [nid("aud"), actorUserId, action, targetId.slice(0, 80)],
    )
    .catch(() => undefined);
}

export const lookupThreadReference = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reference?: string }) => ({
    reference: String(input?.reference || "").trim().slice(0, 32),
  }))
  .handler(async ({ context, data }): Promise<ThreadReferenceLookup> => {
    await requireSupport(context.userId);
    const code = data.reference;
    if (!allowThreadReferenceLookup(context.userId, Date.now())) {
      await audit(context.userId, "thread_reference_rate", code);
      return { found: false, retry: true };
    }
    const conversationId = conversationIdFromReference(code);
    const shown = conversationId ? threadReferenceFromId(conversationId) : null;
    if (!conversationId || !shown) {
      await audit(context.userId, "thread_reference_miss", code);
      return { found: false };
    }
    const sql = await getSql();
    const rows = await sql<{
      daycare_name: string | null;
      city: string | null;
      parent_name: string | null;
      owner_name: string | null;
      booking_status: string | null;
      start_month: string | null;
      tour_status: string | null;
    }>`
      select d.name as daycare_name,
             d.city,
             u.name as parent_name,
             owner.name as owner_name,
             b.status as booking_status,
             b.start_month,
             t.status as tour_status
      from conversations c
      join daycares d on d.id = c.daycare_id
      left join "user" u on u.id = c.user_id
      left join lateral (
        select u2.name
        from provider_daycares pd
        join "user" u2 on u2.id = pd.user_id
        where pd.daycare_id = c.daycare_id
        order by u2.name
        limit 1
      ) owner on true
      left join bookings b on b.conversation_id = c.id
      left join tour_requests t on t.conversation_id = c.id
      where c.id = ${conversationId}
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) {
      await audit(context.userId, "thread_reference_miss", shown);
      return { found: false };
    }
    await audit(context.userId, "thread_reference_hit", conversationId);
    return {
      found: true,
      card: threadReferenceCard({
        reference: shown,
        status: row.booking_status,
        tourStatus: row.tour_status,
        daycareName: row.daycare_name,
        city: row.city,
        parentName: row.parent_name,
        ownerName: row.owner_name,
        when: row.start_month,
      }),
    };
  });
