/**
 * Centre tools server. Every tool has its own flag, default off.
 * No outside calls, no credentials, no charges.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteCare } from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { centreToolIds } from "@/lib/features";
import { KIND_TOOL, PARENT_KINDS, RECORD_KINDS, parentKindsFor, tapToPayDecision, type RecordKind } from "@/lib/centre-tools";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { nid } from "@/lib/utils";
import { listAccessibleDaycareIds, loadCentreRole } from "./centre-access";

type RecordRow = { id: string; kind: string; booking_id: string | null; payload: unknown; created_at: string | Date; daycare_name?: string };

function toRecord(row: RecordRow) {
  return {
    id: row.id,
    kind: row.kind,
    bookingId: row.booking_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb payload, cleaned on write
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, any>,
    createdAt: new Date(row.created_at).toISOString(),
    daycareName: row.daycare_name || "",
  };
}

function kindAllowed(kind: string, tools: string[]): kind is RecordKind {
  if (!(RECORD_KINDS as readonly string[]).includes(kind)) return false;
  if (kind === "bill") return tools.includes("attendance") || tools.includes("subsidy");
  return tools.includes(KIND_TOOL[kind as RecordKind]);
}

/** Drop anything that looks like an image or a link to one. Text and numbers only. */
function cleanPayload(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 40)) {
    if (/photo|image|avatar|face/i.test(key)) continue;
    if (typeof value === "string") {
      if (/^data:image|\.(jpe?g|png|webp|heic)(\?|$)/i.test(value)) continue;
      out[key] = value.slice(0, 4000);
    } else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 200).map((v) => (typeof v === "object" ? cleanPayload(v) : v));
    else if (value && typeof value === "object") out[key] = cleanPayload(value);
  }
  return out;
}

export const centreToolsStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ tools: centreToolIds() as string[] }));

export const listCentreTools = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; month?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    month: /^\d{4}-\d{2}$/.test(String(input?.month || "")) ? String(input?.month) : new Date().toISOString().slice(0, 7),
  }))
  .handler(async ({ context, data }) => {
    const tools = centreToolIds() as string[];
    const empty = { tools, centres: [] as { id: string; name: string }[], daycareId: "", roster: [] as { bookingId: string; childName: string }[], records: [] as ReturnType<typeof toRecord>[], attendance: {} as Record<string, string[]>, terminalConfigured: false };
    if (!tools.length) return empty;
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.length) return empty;
    const centres = await sql
      .query<{ id: string; name: string }>(`select id, name from daycares where id = any($1::text[]) order by name`, [ids])
      .catch(() => []);
    const daycareId = centres.some((c) => c.id === data.daycareId) ? data.daycareId : centres[0]?.id || "";
    if (!daycareId) return { ...empty, centres };
    const roster = await sql
      .query<{ booking_id: string; child_name: string }>(
        `select b.id as booking_id, coalesce(c.name, 'Child') as child_name
         from bookings b left join children c on c.id = b.child_id
         where b.daycare_id = $1 and b.status = any($2::text[])
         order by child_name limit 120`,
        [daycareId, [...ENROLLED_BOOKING_STATUSES]],
      )
      .catch(() => []);
    const records = await sql
      .query<RecordRow>(
        `select id, kind, booking_id, payload, created_at from centre_tool_records
         where daycare_id = $1 order by created_at desc limit 300`,
        [daycareId],
      )
      .catch(() => []);
    const attendance: Record<string, string[]> = {};
    if (tools.includes("attendance") || tools.includes("subsidy")) {
      const rows = await sql
        .query<{ booking_id: string; day: string }>(
          `select booking_id, to_char(at at time zone 'America/Toronto', 'YYYY-MM-DD') as day
           from child_check_events
           where daycare_id = $1 and action = 'check_in'
             and to_char(at at time zone 'America/Toronto', 'YYYY-MM') = $2`,
          [daycareId, data.month],
        )
        .catch(() => []);
      for (const row of rows) (attendance[row.booking_id] ||= []).push(row.day);
    }
    return {
      tools,
      centres,
      daycareId,
      roster: roster.map((r) => ({ bookingId: r.booking_id, childName: r.child_name })),
      records: records.filter((r) => kindAllowed(r.kind, tools)).map(toRecord),
      attendance,
      terminalConfigured: Boolean(process.env.STRIPE_TERMINAL_LOCATION_ID),
    };
  });

export const saveCentreToolRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; kind?: string; bookingId?: string; payload?: unknown }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    kind: String(input?.kind || "").trim(),
    bookingId: String(input?.bookingId || "").trim(),
    payload: cleanPayload(input?.payload),
  }))
  .handler(async ({ context, data }) => {
    const tools = centreToolIds() as string[];
    if (!kindAllowed(data.kind, tools)) return { ok: false as const, reason: "off" as const };
    const sql = await getSql();
    const role = await loadCentreRole(sql, context.userId, data.daycareId);
    if (!centreCanWriteCare(role)) throw new Error("That centre is not on this account");
    let bookingId: string | null = null;
    if (data.bookingId) {
      const rows = await sql<{ id: string }>`
        select id from bookings where id = ${data.bookingId} and daycare_id = ${data.daycareId} limit 1
      `;
      if (!rows[0]) throw new Error("That child is not enrolled here");
      bookingId = rows[0].id;
    }
    if ((data.kind === "observation" || data.kind === "bill" || data.kind === "tap_receipt") && !bookingId) {
      throw new Error("Choose a child");
    }
    const payload = { ...data.payload };
    if (data.kind === "tap_receipt") {
      // Scaffold: never a live charge. Receipts are always marked test.
      const decision = tapToPayDecision(true, Boolean(process.env.STRIPE_TERMINAL_LOCATION_ID), Number(payload.amountCents));
      if (decision.reason === "amount") throw new Error("Check the amount");
      payload.test = true;
      payload.charged = false;
    }
    const id = nid("ctr");
    await sql`
      insert into centre_tool_records (id, daycare_id, kind, booking_id, payload, created_by)
      values (${id}, ${data.daycareId}, ${data.kind}, ${bookingId}, ${JSON.stringify(payload)}::jsonb, ${context.userId})
    `;
    return { ok: true as const, id };
  });

/** Parent view: menus from their child's centre, plus notes, bills, and receipts for their own child. */
export const listParentCentreTools = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const tools = centreToolIds() as string[];
    const kinds = parentKindsFor(tools);
    if (!kinds.length) return { tools, kinds, records: [] as ReturnType<typeof toRecord>[], children: [] as { bookingId: string; childName: string }[] };
    const sql = await getSql();
    const bookings = await sql
      .query<{ id: string; daycare_id: string; child_name: string }>(
        `select b.id, b.daycare_id, coalesce(c.name, 'Child') as child_name
         from bookings b left join children c on c.id = b.child_id
         where b.user_id = $1 and b.status = any($2::text[])`,
        [context.userId, [...ENROLLED_BOOKING_STATUSES]],
      )
      .catch(() => []);
    if (!bookings.length) return { tools, kinds, records: [], children: [] };
    const bookingIds = bookings.map((b) => b.id);
    const centreIds = [...new Set(bookings.map((b) => b.daycare_id))];
    const rows = await sql
      .query<RecordRow>(
        `select r.id, r.kind, r.booking_id, r.payload, r.created_at, d.name as daycare_name
         from centre_tool_records r join daycares d on d.id = r.daycare_id
         where r.kind = any($1::text[])
           and ((r.kind = 'menu' and r.daycare_id = any($2::text[])) or r.booking_id = any($3::text[]))
         order by r.created_at desc limit 200`,
        [kinds, centreIds, bookingIds],
      )
      .catch(() => []);
    return {
      tools,
      kinds,
      records: rows.map(toRecord),
      children: bookings.map((b) => ({ bookingId: b.id, childName: b.child_name })),
    };
  });

export const PARENT_TOOL_KINDS = PARENT_KINDS;
