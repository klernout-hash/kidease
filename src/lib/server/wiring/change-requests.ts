import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { assertGovWritable, type GovActor } from "@/lib/server/gov-actor.server";
import {
  changeRequestsEnabled,
  changeRequestsMode,
  listingPatch,
  parseChangeValue,
  reviewChange,
} from "@/lib/wiring/change-requests";
import { deliverNotice, governmentUserIds, newId } from "@/lib/server/wiring/runtime";

export const submitChangeRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; field?: string; value?: string }) => ({
    daycareId: String(input?.daycareId || "").slice(0, 80),
    field: String(input?.field || "").slice(0, 20),
    value: String(input?.value || "").slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    if (!changeRequestsEnabled()) return { ok: false as const, error: "off" };
    const parsed = parseChangeValue(data.field, data.value);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(data.daycareId)) return { ok: false as const, error: "centre" };
    const centre = await sql<{ province: string; name: string }>`
      select province, name from daycares where id = ${data.daycareId} limit 1
    `;
    if (!centre[0]) return { ok: false as const, error: "centre" };
    const id = newId("cr");
    await sql`
      insert into listing_change_requests (id, daycare_id, province, field, proposed_value, requested_by)
      values (${id}, ${data.daycareId}, ${centre[0].province}, ${parsed.field}, ${parsed.value}, ${context.userId})
    `;
    const mode = changeRequestsMode();
    for (const userId of await governmentUserIds(centre[0].province)) {
      await deliverNotice({
        feature: "change_requests",
        flag: "FEATURE_CHANGE_REQUESTS",
        mode,
        userId,
        role: "government",
        title: "Listing change to review",
        body: `${centre[0].name} asked to update ${parsed.field}. The public listing stays as it is until you approve.`,
        href: "/gov/change-requests",
        senderUserId: context.userId,
        province: centre[0].province,
      });
    }
    return { ok: true as const, id, status: "pending" as const };
  });

export const listChangeQueue = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    if (!changeRequestsEnabled()) return { enabled: false as const, rows: [] };
    const gov = context.gov as GovActor;
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      field: string;
      proposed_value: string;
      status: string;
      province: string;
    }>`
      select id, daycare_id, field, proposed_value, status, province
      from listing_change_requests
      where upper(province) = ${gov.province.toUpperCase()} and status = 'pending'
      order by created_at asc
      limit 50
    `.catch(() => []);
    return { enabled: true as const, readOnly: gov.readOnly, rows };
  });

export const reviewChangeRequest = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; decision?: string }) => ({
    id: String(input?.id || "").slice(0, 80),
    decision: String(input?.decision || "").slice(0, 20),
  }))
  .handler(async ({ context, data }) => {
    if (!changeRequestsEnabled()) return { ok: false as const, error: "off" };
    if (data.decision !== "approve" && data.decision !== "decline") return { ok: false as const, error: "decision" };
    const gov = context.gov as GovActor;
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string; province: string; field: string; proposed_value: string; status: string }>`
      select id, daycare_id, province, field, proposed_value, status
      from listing_change_requests where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || row.status !== "pending") return { ok: false as const, error: "missing" };
    const decision = reviewChange({
      decision: data.decision,
      actorProvince: gov.province,
      recordProvince: row.province,
      writable: !gov.readOnly && !gov.demo,
    });
    if (!decision.ok) return { ok: false as const, error: decision.error };
    try {
      assertGovWritable(gov);
    } catch {
      return { ok: false as const, error: "read_only" };
    }
    if (decision.decision === "approve") {
      const patch = listingPatch(row.field as "capacity" | "hours" | "address" | "director", row.proposed_value);
      if ("licensed_capacity" in patch) {
        await sql`update daycares set licensed_capacity = ${patch.licensed_capacity} where id = ${row.daycare_id}`;
      } else if ("hours" in patch) {
        await sql`update daycares set hours = ${String(patch.hours)}, hours_fr = ${String(patch.hours_fr)} where id = ${row.daycare_id}`;
      } else if ("address" in patch) {
        await sql`update daycares set address = ${String(patch.address)} where id = ${row.daycare_id}`;
      } else if ("director_name" in patch) {
        await sql`update daycares set director_name = ${String(patch.director_name)} where id = ${row.daycare_id}`;
      }
    }
    await sql`
      update listing_change_requests
      set status = ${decision.decision === "approve" ? "approved" : "declined"},
          reviewed_by = ${gov.userId}, reviewed_at = now()
      where id = ${row.id}
    `;
    const mode = changeRequestsMode();
    const owners = await sql<{ user_id: string }>`
      select user_id from provider_daycares where daycare_id = ${row.daycare_id}
    `.catch(() => []);
    for (const owner of owners) {
      await deliverNotice({
        feature: "change_requests",
        flag: "FEATURE_CHANGE_REQUESTS",
        mode,
        userId: owner.user_id,
        role: "provider",
        title: decision.decision === "approve" ? "Listing change approved" : "Listing change declined",
        body: "The province reviewed your listing change.",
        href: "/provider/change-requests",
        province: row.province,
      });
    }
    return { ok: true as const, status: decision.decision };
  });

export const providerChanges = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!changeRequestsEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(data.daycareId)) return { enabled: true as const, rows: [] };
    const rows = await sql<{ id: string; field: string; proposed_value: string; status: string }>`
      select id, field, proposed_value, status from listing_change_requests
      where daycare_id = ${data.daycareId}
      order by created_at desc limit 20
    `.catch(() => [] as { id: string; field: string; proposed_value: string; status: string }[]);
    return { enabled: true as const, rows };
  });
