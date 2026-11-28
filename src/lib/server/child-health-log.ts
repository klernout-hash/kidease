import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { openHealth } from "@/lib/child-health-crypto";
import { canReadChildHealth, healthLogFields } from "@/lib/child-health-access";

type Row = {
  id: string;
  name: string;
  owner_id: string;
  enrolled: boolean;
  immunization_status: string | null;
  immunization_note: string | null;
  allergies: string | null;
  medications: string | null;
};

/** Saved health notes for the viewer's own children, or children enrolled at their centre. */
export const listChildHealthLog = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<Row>`
      select ch.id, ch.name, ch.user_id as owner_id,
        (
          exists (
            select 1 from bookings b
            where b.child_id = ch.id
              and b.status in ('accepted', 'active')
              and (
                exists (
                  select 1 from provider_daycares p
                  where p.user_id = ${context.userId} and p.daycare_id = b.daycare_id
                )
                or exists (
                  select 1 from centre_members m
                  where m.user_id = ${context.userId}
                    and m.daycare_id = b.daycare_id
                    and m.status = 'active'
                    and m.role in ('owner', 'manager', 'staff')
                )
              )
          )
        ) as enrolled,
        ch.immunization_status, ch.immunization_note, ch.allergies, ch.medications
      from children ch
      where ch.user_id = ${context.userId}
         or exists (
            select 1 from bookings b
            where b.child_id = ch.id
              and b.status in ('accepted', 'active')
              and (
                exists (
                  select 1 from provider_daycares p
                  where p.user_id = ${context.userId} and p.daycare_id = b.daycare_id
                )
                or exists (
                  select 1 from centre_members m
                  where m.user_id = ${context.userId}
                    and m.daycare_id = b.daycare_id
                    and m.status = 'active'
                    and m.role in ('owner', 'manager', 'staff')
                )
              )
         )
      order by ch.name
      limit 40
    `.catch(() => [] as Row[]);
    return {
      rows: rows.flatMap((row) => {
        const own = row.owner_id === context.userId;
        const allowed = canReadChildHealth({
          viewer: own ? "parent" : "provider",
          viewerId: context.userId,
          childOwnerId: row.owner_id,
          enrolledAtCentre: Boolean(row.enrolled),
        });
        if (!allowed) return [];
        const fields = healthLogFields({
          immunizationStatus: row.immunization_status,
          immunizationNote: openHealth(row.immunization_note),
          allergies: openHealth(row.allergies),
          medications: openHealth(row.medications),
        });
        return [{ id: row.id, name: row.name, ...fields }];
      }),
    };
  });


/** Admin opens one record at a time, behind the existing Admin step-up gate. */
export const readAdminChildHealth = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string }) => ({
    childId: typeof input?.childId === "string" ? input.childId.trim().slice(0, 128) : "",
  }))
  .handler(async ({ context, data }) => {
    const { requireAdmin } = await import("@/lib/server/roles");
    const { isKidEaseOperatorEmail } = await import("@/lib/admin-email");
    const { logChildProfileAccess } = await import("@/lib/server/child-access-log");
    const actor = await requireAdmin(context.userId);
    if (!canReadChildHealth({
      viewer: "admin",
      viewerId: context.userId,
      childOwnerId: "",
      enrolledAtCentre: false,
      designatedAdmin: actor.emailVerified && isKidEaseOperatorEmail(actor.email),
    })) throw new Error("Not authorized");
    if (!data.childId) return null;

    const sql = await getSql();
    const rows = await sql<Omit<Row, "owner_id" | "enrolled">>`
      select id, name, immunization_status, immunization_note, allergies, medications
      from children
      where id = ${data.childId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    await logChildProfileAccess(sql, {
      childId: row.id,
      actorId: context.userId,
      action: "read",
      required: true,
    });
    return {
      id: row.id,
      name: row.name,
      ...healthLogFields({
        immunizationStatus: row.immunization_status,
        immunizationNote: openHealth(row.immunization_note),
        allergies: openHealth(row.allergies),
        medications: openHealth(row.medications),
      }),
    };
  });
