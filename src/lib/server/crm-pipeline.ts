import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { assignPipeline, type PipelineCard, type PipelineInput } from "@/lib/crm-pipeline";

export const listCentrePipeline = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PipelineCard[]> => {
    const sql = await getSql();
    const owned = await sql<{ daycare_id: string }>`
      select daycare_id from provider_daycares where user_id = ${context.userId}
    `.catch(() => []);
    if (!owned.length) return [];

    const conversations = await sql<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      parent_user_id: string;
      parent_name: string | null;
      last_at: string;
    }>`
      select c.id, c.daycare_id, d.name as daycare_name, d.slug,
             c.user_id as parent_user_id, u.name as parent_name, c.last_at
      from conversations c
      join daycares d on d.id = c.daycare_id
      join provider_daycares p on p.daycare_id = c.daycare_id and p.user_id = ${context.userId}
      left join "user" u on u.id = c.user_id
      order by c.last_at desc
      limit 80
    `.catch(() => []);

    const tours = await sql<{
      id: string;
      conversation_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      parent_user_id: string;
      parent_name: string | null;
      child_name: string | null;
      status: "pending" | "accepted" | "declined";
      created_at: string;
    }>`
      select t.id, t.conversation_id, t.daycare_id, d.name as daycare_name, d.slug,
             t.user_id as parent_user_id, u.name as parent_name, t.child_name,
             t.status, t.created_at
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      join provider_daycares p on p.daycare_id = t.daycare_id and p.user_id = ${context.userId}
      left join "user" u on u.id = t.user_id
      order by t.created_at desc
      limit 80
    `.catch(() => []);

    const bookings = await sql<{
      id: string;
      conversation_id: string | null;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      parent_user_id: string;
      parent_name: string | null;
      child_name: string | null;
      status: string;
      created_at: string;
    }>`
      select b.id, b.conversation_id, b.daycare_id, d.name as daycare_name, d.slug,
             b.user_id as parent_user_id, b.parent_name, b.child_name, b.status, b.created_at
      from bookings b
      join daycares d on d.id = b.daycare_id
      join provider_daycares p on p.daycare_id = b.daycare_id and p.user_id = ${context.userId}
      order by b.created_at desc
      limit 80
    `.catch(() => []);

    const rows: PipelineInput[] = [
      ...conversations.map((r) => ({
        id: r.id,
        kind: "conversation" as const,
        daycareId: r.daycare_id,
        daycareName: r.daycare_name,
        daycareSlug: r.slug,
        conversationId: r.id,
        parentUserId: r.parent_user_id,
        parentName: r.parent_name,
        updatedAt: String(r.last_at),
      })),
      ...tours.map((r) => ({
        id: r.id,
        kind: "tour" as const,
        daycareId: r.daycare_id,
        daycareName: r.daycare_name,
        daycareSlug: r.slug,
        conversationId: r.conversation_id,
        parentUserId: r.parent_user_id,
        parentName: r.parent_name,
        childName: r.child_name,
        tourStatus: r.status,
        updatedAt: String(r.created_at),
      })),
      ...bookings.map((r) => ({
        id: r.id,
        kind: "booking" as const,
        daycareId: r.daycare_id,
        daycareName: r.daycare_name,
        daycareSlug: r.slug,
        conversationId: r.conversation_id,
        parentUserId: r.parent_user_id,
        parentName: r.parent_name,
        childName: r.child_name,
        bookingStatus: r.status,
        updatedAt: String(r.created_at),
      })),
    ];

    return assignPipeline(rows);
  });
