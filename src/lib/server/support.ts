/**
 * Support desk server functions. Client-safe createServerFn module —
 * do not move this into a *.server.* file (TanStack Start would break the client import).
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { stripeChargesLive } from "@/lib/stripe-live";
import { parseBillStatus, type BillStatus } from "@/lib/bill";
import { vacancyFreshness } from "@/lib/listing-readiness";
import { parseAppRole, type AppRole } from "@/lib/desks";
import { createStripeRefund } from "@/lib/server/stripe-checkout";
import { requireSupport } from "@/lib/server/roles";
import { reportError } from "@/lib/observe";
import {
  type SupportCase,
  type SupportCaseEvent,
  type SupportCaseStatus,
  type SupportCaseType,
  type SupportEventKind,
  type SupportMeta,
  type SupportStaff,
  createCaseInput,
  decideSupportRefund,
  parseSupportPriority,
  parseSupportStatus,
  parseSupportType,
  refundIdempotencyKey,
  supportRefundMaxCents,
} from "@/lib/support";

type Sql = Awaited<ReturnType<typeof getSql>>;

type CaseRow = {
  id: string;
  status: string;
  type: string;
  priority: string;
  subject: string;
  assignee_user_id: string | null;
  parent_user_id: string | null;
  provider_user_id: string | null;
  centre_id: string | null;
  listing_id: string | null;
  stripe_payment_intent_id: string | null;
  bill_id: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  assignee_name: string | null;
  parent_name: string | null;
  parent_email: string | null;
  provider_name: string | null;
  centre_name: string | null;
};

type EventRow = {
  id: string;
  case_id: string;
  actor_user_id: string | null;
  kind: string;
  body: string | null;
  meta: unknown;
  created_at: string;
  actor_name: string | null;
};

function asMeta(raw: unknown): SupportMeta | null {
  if (!raw) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
      else return { value: String(parsed) };
    } catch {
      return { value: raw };
    }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return null;
  const out: SupportMeta = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) out[k] = null;
    else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = JSON.stringify(v);
  }
  return out;
}

function mapCase(row: CaseRow): SupportCase {
  return {
    id: row.id,
    status: parseSupportStatus(row.status),
    type: parseSupportType(row.type),
    priority: parseSupportPriority(row.priority),
    subject: row.subject,
    assigneeUserId: row.assignee_user_id,
    assigneeName: row.assignee_name,
    parentUserId: row.parent_user_id,
    parentName: row.parent_name,
    parentEmail: row.parent_email,
    providerUserId: row.provider_user_id,
    providerName: row.provider_name,
    centreId: row.centre_id,
    listingId: row.listing_id,
    centreName: row.centre_name,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    billId: row.bill_id,
    invoiceId: row.invoice_id,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

function mapEvent(row: EventRow): SupportCaseEvent {
  const kind = (["note", "email", "sms", "status", "refund", "system"] as const).includes(
    row.kind as SupportEventKind,
  )
    ? (row.kind as SupportEventKind)
    : "system";
  return {
    id: row.id,
    caseId: row.case_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    kind,
    body: row.body,
    meta: asMeta(row.meta),
    createdAt: String(row.created_at),
  };
}

const CASE_SELECT = `
  c.id, c.status, c.type, c.priority, c.subject,
  c.assignee_user_id, c.parent_user_id, c.provider_user_id,
  c.centre_id, c.listing_id, c.stripe_payment_intent_id, c.bill_id, c.invoice_id,
  c.created_at, c.updated_at, c.resolved_at,
  ua.name as assignee_name,
  up.name as parent_name, up.email as parent_email,
  uv.name as provider_name,
  d.name as centre_name
`;

async function loadCase(sql: Sql, id: string): Promise<CaseRow | null> {
  const rows = await sql.query<CaseRow>(
    `select ${CASE_SELECT}
     from support_cases c
     left join "user" ua on ua.id = c.assignee_user_id
     left join "user" up on up.id = c.parent_user_id
     left join "user" uv on uv.id = c.provider_user_id
     left join daycares d on d.id = coalesce(c.centre_id, c.listing_id)
     where c.id = $1
     limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

async function writeAudit(
  sql: Sql,
  input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    meta?: SupportMeta | null;
  },
) {
  await sql.query(
    `insert into support_audit_log (id, actor_user_id, action, target_type, target_id, meta)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      nid("aud"),
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId,
      input.meta ? JSON.stringify(input.meta) : null,
    ],
  ).catch((err) => {
    console.error("[kidease-support] audit write failed", err);
  });
}

async function writeEvent(
  sql: Sql,
  input: {
    caseId: string;
    actorUserId: string | null;
    kind: SupportEventKind;
    body?: string | null;
    meta?: SupportMeta | null;
  },
) {
  const id = nid("sev");
  await sql.query(
    `insert into support_case_events (id, case_id, actor_user_id, kind, body, meta)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      id,
      input.caseId,
      input.actorUserId,
      input.kind,
      input.body ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
    ],
  );
  return id;
}

async function touchCase(sql: Sql, caseId: string, extra?: { status?: SupportCaseStatus; resolved?: boolean }) {
  if (extra?.status && (extra.status === "resolved" || extra.status === "closed")) {
    await sql`
      update support_cases
      set status = ${extra.status}, resolved_at = coalesce(resolved_at, now()), updated_at = now()
      where id = ${caseId}
    `;
    return;
  }
  if (extra?.status) {
    await sql`
      update support_cases
      set status = ${extra.status}, resolved_at = null, updated_at = now()
      where id = ${caseId}
    `;
    return;
  }
  await sql`update support_cases set updated_at = now() where id = ${caseId}`;
}

async function actorRole(sql: Sql, userId: string): Promise<AppRole> {
  const rows = await sql<{ role: string }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return parseAppRole(rows[0]?.role);
}

export type SupportInboxFilter = {
  status?: SupportCaseStatus | "all";
  type?: SupportCaseType | "all";
  scope?: "all" | "mine" | "unassigned";
};

export const listSupportCases = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: SupportInboxFilter | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const status = data.status && data.status !== "all" ? data.status : null;
    const type = data.type && data.type !== "all" ? data.type : null;
    const scope = data.scope ?? "all";
    const rows = await sql.query<CaseRow>(
      `select ${CASE_SELECT}
       from support_cases c
       left join "user" ua on ua.id = c.assignee_user_id
       left join "user" up on up.id = c.parent_user_id
       left join "user" uv on uv.id = c.provider_user_id
       left join daycares d on d.id = coalesce(c.centre_id, c.listing_id)
       where ($1::text is null or c.status = $1)
         and ($2::text is null or c.type = $2)
         and ($3::text <> 'mine' or c.assignee_user_id = $4)
         and ($3::text <> 'unassigned' or c.assignee_user_id is null)
       order by c.updated_at desc
       limit 200`,
      [status, type, scope, context.userId],
    );
    return { cases: rows.map(mapCase), stripeLive: stripeChargesLive() };
  });

export const listSupportStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const rows = await sql.query<SupportStaff & { role: string }>(
      `select p.user_id as "userId", u.name, u.email, p.role
       from profiles p
       left join "user" u on u.id = p.user_id
       where p.role in ('admin', 'support', 'support_lead')
       order by u.name nulls last
       limit 80`,
    ).catch(() => []);
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: parseAppRole(r.role),
    })) satisfies SupportStaff[];
  });

export const searchSupportPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: string) => String(q || "").trim().slice(0, 80))
  .handler(async ({ context, data: q }) => {
    await requireSupport(context.userId);
    if (q.length < 2) return [] as Array<{ userId: string; name: string | null; email: string | null; role: AppRole }>;
    const sql = await getSql();
    const needle = `%${q.toLowerCase()}%`;
    const rows = await sql.query<{ user_id: string; name: string | null; email: string | null; role: string | null }>(
      `select u.id as user_id, u.name, u.email, p.role
       from "user" u
       left join profiles p on p.user_id = u.id
       where lower(coalesce(u.email, '')) like $1
          or lower(coalesce(u.name, '')) like $1
          or u.id = $2
       order by u.name nulls last
       limit 12`,
      [needle, q],
    ).catch(() => []);
    return rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: parseAppRole(r.role),
    }));
  });

export const searchSupportCentres = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: string) => String(q || "").trim().slice(0, 80))
  .handler(async ({ context, data: q }) => {
    await requireSupport(context.userId);
    if (q.length < 2) return [] as Array<{ id: string; name: string; city: string | null; slug: string | null }>;
    const sql = await getSql();
    const needle = `%${q.toLowerCase()}%`;
    const rows = await sql.query<{ id: string; name: string; city: string | null; slug: string | null }>(
      `select id, name, city, slug
       from daycares
       where lower(name) like $1 or lower(coalesce(city, '')) like $1 or id = $2 or slug = $2
       order by name
       limit 12`,
      [needle, q],
    ).catch(() => []);
    return rows;
  });

export const createSupportCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    subject: string;
    type?: string;
    priority?: string;
    parentUserId?: string | null;
    providerUserId?: string | null;
    centreId?: string | null;
    billId?: string | null;
  }) => createCaseInput(input))
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const id = nid("sc");
    const centreId = data.centreId?.trim() || null;
    const billId = data.billId?.trim() || null;
    let paymentIntent: string | null = null;
    if (billId) {
      const bills = await sql<{ stripe_payment_intent_id: string | null }>`
        select stripe_payment_intent_id from invoices where id = ${billId} limit 1
      `.catch(() => []);
      paymentIntent = bills[0]?.stripe_payment_intent_id ?? null;
    }
    await sql.query(
      `insert into support_cases (
         id, status, type, priority, subject, assignee_user_id,
         parent_user_id, provider_user_id, centre_id, listing_id,
         stripe_payment_intent_id, bill_id, invoice_id
       ) values ($1, 'open', $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $10)`,
      [
        id,
        data.type,
        data.priority,
        data.subject,
        context.userId,
        data.parentUserId?.trim() || null,
        data.providerUserId?.trim() || null,
        centreId,
        paymentIntent,
        billId,
      ],
    );
    await writeEvent(sql, {
      caseId: id,
      actorUserId: context.userId,
      kind: "system",
      body: "Case opened",
      meta: { type: data.type, priority: data.priority },
    });
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "case.create",
      targetType: "support_case",
      targetId: id,
      meta: { subject: data.subject, type: data.type },
    });
    const row = await loadCase(sql, id);
    if (!row) throw new Error("Case was created but could not be reloaded");
    return mapCase(row);
  });

export type SupportCaseDetail = {
  case: SupportCase;
  events: SupportCaseEvent[];
  stripeLive: boolean;
  refundMaxCents: number;
  actorRole: AppRole;
};

export const getSupportCase = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => String(id || "").trim())
  .handler(async ({ context, data: id }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, id);
    if (!row) throw new Error("Case not found");
    const events = await sql.query<EventRow>(
      `select e.id, e.case_id, e.actor_user_id, e.kind, e.body, e.meta, e.created_at, u.name as actor_name
       from support_case_events e
       left join "user" u on u.id = e.actor_user_id
       where e.case_id = $1
       order by e.created_at asc
       limit 400`,
      [id],
    );
    return {
      case: mapCase(row),
      events: events.map(mapEvent),
      stripeLive: stripeChargesLive(),
      refundMaxCents: supportRefundMaxCents(),
      actorRole: await actorRole(sql, context.userId),
    } satisfies SupportCaseDetail;
  });

export const addSupportNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; body: string; macroId?: string | null }) => {
    const caseId = String(input.caseId || "").trim();
    const body = String(input.body || "").trim();
    if (!caseId) throw new Error("Missing case");
    if (body.length < 1) throw new Error("Write a note");
    return { caseId, body: body.slice(0, 4000), macroId: input.macroId ?? null };
  })
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, data.caseId);
    if (!row) throw new Error("Case not found");
    await writeEvent(sql, {
      caseId: data.caseId,
      actorUserId: context.userId,
      kind: "note",
      body: data.body,
      meta: data.macroId ? { macroId: data.macroId } : null,
    });
    await touchCase(sql, data.caseId);
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "case.note",
      targetType: "support_case",
      targetId: data.caseId,
      meta: data.macroId ? { macroId: data.macroId } : null,
    });
    return { ok: true as const };
  });

export const changeSupportStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; status: SupportCaseStatus }) => {
    const caseId = String(input.caseId || "").trim();
    const status = parseSupportStatus(input.status);
    if (!caseId) throw new Error("Missing case");
    return { caseId, status };
  })
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, data.caseId);
    if (!row) throw new Error("Case not found");
    const prev = parseSupportStatus(row.status);
    await touchCase(sql, data.caseId, { status: data.status });
    await writeEvent(sql, {
      caseId: data.caseId,
      actorUserId: context.userId,
      kind: "status",
      body: `${prev} → ${data.status}`,
      meta: { from: prev, to: data.status },
    });
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "case.status",
      targetType: "support_case",
      targetId: data.caseId,
      meta: { from: prev, to: data.status },
    });
    return { ok: true as const, status: data.status };
  });

export const assignSupportCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; assigneeUserId: string | null }) => {
    const caseId = String(input.caseId || "").trim();
    if (!caseId) throw new Error("Missing case");
    const assigneeUserId = input.assigneeUserId ? String(input.assigneeUserId).trim() : null;
    return { caseId, assigneeUserId };
  })
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, data.caseId);
    if (!row) throw new Error("Case not found");
    if (data.assigneeUserId) {
      const staff = await sql<{ role: string }>`
        select role from profiles where user_id = ${data.assigneeUserId} limit 1
      `.catch(() => []);
      if (!staff[0] || !["admin", "support", "support_lead"].includes(staff[0].role)) {
        throw new Error("Assignee must be support, support lead, or admin");
      }
    }
    await sql`
      update support_cases
      set assignee_user_id = ${data.assigneeUserId}, updated_at = now()
      where id = ${data.caseId}
    `;
    await writeEvent(sql, {
      caseId: data.caseId,
      actorUserId: context.userId,
      kind: "system",
      body: data.assigneeUserId ? `Assigned to ${data.assigneeUserId}` : "Unassigned",
      meta: { assigneeUserId: data.assigneeUserId },
    });
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "case.assign",
      targetType: "support_case",
      targetId: data.caseId,
      meta: { assigneeUserId: data.assigneeUserId },
    });
    return { ok: true as const };
  });

export type SupportMoneyRow = {
  id: string;
  number: string;
  status: BillStatus;
  amountCents: number;
  currency: string;
  period: string;
  daycareName: string | null;
  parentEmail: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeCheckoutSessionId: string | null;
  paidAt: string | null;
};

export const listSupportMoney = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((caseId: string) => String(caseId || "").trim())
  .handler(async ({ context, data: caseId }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, caseId);
    if (!row) throw new Error("Case not found");
    const bills = await sql.query<
      SupportMoneyRow & {
        amount_cents: number | null;
        total: number;
        stripe_payment_intent_id: string | null;
        stripe_charge_id: string | null;
        stripe_checkout_session_id: string | null;
        daycare_name: string | null;
        parent_email: string | null;
        paid_at: string | null;
      }
    >(
      `select i.id, i.number, i.status, i.currency, i.period,
              i.amount_cents, i.total, i.stripe_payment_intent_id, i.stripe_charge_id,
              i.stripe_checkout_session_id, i.paid_at,
              d.name as daycare_name, u.email as parent_email
       from invoices i
       left join daycares d on d.id = i.daycare_id
       left join "user" u on u.id = i.parent_user_id
       where i.status <> 'draft'
         and (
           i.id = $1 or i.id = $2
           or ($3::text is not null and i.parent_user_id = $3)
           or ($4::text is not null and i.daycare_id = $4)
           or ($5::text is not null and i.stripe_payment_intent_id = $5)
         )
       order by i.created_at desc
       limit 40`,
      [
        row.bill_id,
        row.invoice_id,
        row.parent_user_id,
        row.centre_id || row.listing_id,
        row.stripe_payment_intent_id,
      ],
    ).catch(() => []);
    return {
      stripeLive: stripeChargesLive(),
      refundMaxCents: supportRefundMaxCents(),
      actorRole: await actorRole(sql, context.userId),
      rows: bills.map((b) => ({
        id: b.id,
        number: b.number,
        status: parseBillStatus(b.status),
        amountCents: b.amount_cents != null ? Number(b.amount_cents) : Math.round((Number(b.total) || 0) * 100),
        currency: (b.currency || "cad").toLowerCase(),
        period: b.period,
        daycareName: b.daycare_name,
        parentEmail: b.parent_email,
        stripePaymentIntentId: b.stripe_payment_intent_id,
        stripeChargeId: b.stripe_charge_id ?? null,
        stripeCheckoutSessionId: b.stripe_checkout_session_id,
        paidAt: b.paid_at ? String(b.paid_at) : null,
      })),
    };
  });

export const refundSupportBill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; billId: string; amountCents: number }) => {
    const caseId = String(input.caseId || "").trim();
    const billId = String(input.billId || "").trim();
    const amountCents = Math.floor(Number(input.amountCents) || 0);
    if (!caseId || !billId) throw new Error("Missing case or bill");
    return { caseId, billId, amountCents };
  })
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, data.caseId);
    if (!row) throw new Error("Case not found");
    const bills = await sql.query<{
      id: string;
      status: string;
      amount_cents: number | null;
      total: number;
      stripe_payment_intent_id: string | null;
      stripe_charge_id: string | null;
    }>(
      `select id, status, amount_cents, total, stripe_payment_intent_id, stripe_charge_id
       from invoices where id = $1 limit 1`,
      [data.billId],
    );
    const bill = bills[0];
    if (!bill) throw new Error("Bill not found");
    const billCents = bill.amount_cents != null ? Number(bill.amount_cents) : Math.round((Number(bill.total) || 0) * 100);
    if (data.amountCents > billCents) throw new Error("Refund cannot exceed the bill amount");
    const role = await actorRole(sql, context.userId);
    const live = stripeChargesLive();
    const paymentId = bill.stripe_payment_intent_id || bill.stripe_charge_id;
    const decision = decideSupportRefund({
      stripeLive: live,
      paymentId,
      amountCents: data.amountCents,
      role,
      maxCents: supportRefundMaxCents(),
    });
    if (decision.path === "blocked") throw new Error(decision.reason);

    if (decision.path === "rehearse") {
      await writeEvent(sql, {
        caseId: data.caseId,
        actorUserId: context.userId,
        kind: "refund",
        body: decision.reason,
        meta: {
          path: "rehearse",
          billId: data.billId,
          amountCents: data.amountCents,
          stripeLive: false,
        },
      });
      await touchCase(sql, data.caseId);
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "refund.rehearse",
        targetType: "invoice",
        targetId: data.billId,
        meta: { caseId: data.caseId, amountCents: data.amountCents },
      });
      return { ok: true as const, path: "rehearse" as const, message: decision.reason };
    }

    const idempotencyKey = refundIdempotencyKey({
      caseId: data.caseId,
      billId: data.billId,
      amountCents: data.amountCents,
    });
    try {
      const refund = await createStripeRefund({
        paymentIntentId: bill.stripe_payment_intent_id,
        chargeId: bill.stripe_payment_intent_id ? null : bill.stripe_charge_id,
        amountCents: data.amountCents,
        idempotencyKey,
        metadata: { case_id: data.caseId, bill_id: data.billId },
      });
      await writeEvent(sql, {
        caseId: data.caseId,
        actorUserId: context.userId,
        kind: "refund",
        body: `Stripe refund ${refund.id} · ${data.amountCents} cents`,
        meta: {
          path: "live",
          billId: data.billId,
          amountCents: data.amountCents,
          stripeRefundId: refund.id,
          stripeStatus: refund.status,
          idempotencyKey,
        },
      });
      await touchCase(sql, data.caseId, { status: "waiting_stripe" });
      await writeAudit(sql, {
        actorUserId: context.userId,
        action: "refund.live",
        targetType: "invoice",
        targetId: data.billId,
        meta: { caseId: data.caseId, amountCents: data.amountCents, stripeRefundId: refund.id },
      });
      return {
        ok: true as const,
        path: "live" as const,
        message: "Refund sent to Stripe. Bill status updates when charge.refunded arrives.",
        stripeRefundId: refund.id,
      };
    } catch (err) {
      reportError(err, { route: "refundSupportBill" });
      throw err instanceof Error ? err : new Error("Stripe refund failed");
    }
  });

export type Person360 = {
  user: { id: string; name: string | null; email: string | null } | null;
  profile: { role: AppRole; city: string | null; phone: string | null } | null;
  desks: string[];
  kids: Array<{ id: string; name: string; birthdate: string | null }>;
  claims: Array<{ id: string; daycareName: string | null; status: string; createdAt: string }>;
  bills: Array<{ id: string; number: string; status: string; amountCents: number; period: string }>;
  plus: { plan: string; status: string | null; interval: string | null } | null;
  empty: boolean;
};

export const getSupportPerson360 = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((userId: string | null | undefined) => String(userId || "").trim())
  .handler(async ({ context, data: userId }) => {
    await requireSupport(context.userId);
    const empty: Person360 = {
      user: null,
      profile: null,
      desks: [],
      kids: [],
      claims: [],
      bills: [],
      plus: null,
      empty: true,
    };
    if (!userId) return empty;
    const sql = await getSql();
    const users = await sql<{ id: string; name: string | null; email: string | null }>`
      select id, name, email from "user" where id = ${userId} limit 1
    `.catch(() => []);
    if (!users[0]) return empty;
    const profiles = await sql<{
      role: string;
      city: string | null;
      phone: string | null;
      plus_plan: string | null;
      plus_status: string | null;
      plus_interval: string | null;
    }>`
      select role, city, phone, plus_plan, plus_status, plus_interval
      from profiles where user_id = ${userId} limit 1
    `.catch(() => []);
    const role = parseAppRole(profiles[0]?.role);
    const kids = await sql<{ id: string; name: string; birthdate: string | null }>`
      select id, name, birthdate from children where user_id = ${userId} order by created_at
    `.catch(() => []);
    const claims = await sql<{ id: string; daycare_name: string | null; status: string; created_at: string }>`
      select lc.id, d.name as daycare_name, lc.status, lc.created_at
      from listing_claims lc
      left join daycares d on d.id = lc.daycare_id
      where lc.user_id = ${userId}
      order by lc.created_at desc
      limit 20
    `.catch(() => []);
    const bills = await sql<{
      id: string;
      number: string;
      status: string;
      amount_cents: number | null;
      total: number;
      period: string;
    }>`
      select id, number, status, amount_cents, total, period
      from invoices
      where parent_user_id = ${userId} and status <> 'draft'
      order by created_at desc
      limit 20
    `.catch(() => []);
    const { desksFor } = await import("@/lib/desks");
    const owned = await sql<{ n: number }>`
      select count(*)::int as n from provider_daycares where user_id = ${userId}
    `.catch(() => [{ n: 0 }]);
    return {
      user: users[0],
      profile: profiles[0]
        ? { role, city: profiles[0].city, phone: profiles[0].phone }
        : { role, city: null, phone: null },
      desks: desksFor({ role, ownsCentre: (owned[0]?.n ?? 0) > 0 }),
      kids: kids.map((k) => ({ id: k.id, name: k.name, birthdate: k.birthdate })),
      claims: claims.map((c) => ({
        id: c.id,
        daycareName: c.daycare_name,
        status: c.status,
        createdAt: String(c.created_at),
      })),
      bills: bills.map((b) => ({
        id: b.id,
        number: b.number,
        status: b.status,
        amountCents: b.amount_cents != null ? Number(b.amount_cents) : Math.round((Number(b.total) || 0) * 100),
        period: b.period,
      })),
      plus: profiles[0]
        ? {
            plan: profiles[0].plus_plan || "free",
            status: profiles[0].plus_status,
            interval: profiles[0].plus_interval,
          }
        : null,
      empty: false,
    } satisfies Person360;
  });

export type Centre360 = {
  listing: {
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    province: string | null;
    licenseNumber: string | null;
    licenseStatus: string | null;
    registryMatch: string | null;
    lastVacancyUpdatedAt: string | null;
    vacancy: ReturnType<typeof vacancyFreshness>;
  } | null;
  claims: Array<{ id: string; userId: string; status: string; createdAt: string; reviewNote: string | null }>;
  openBills: Array<{ id: string; number: string; status: string; amountCents: number; parentEmail: string | null }>;
  empty: boolean;
};

export const getSupportCentre360 = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((centreId: string | null | undefined) => String(centreId || "").trim())
  .handler(async ({ context, data: centreId }) => {
    await requireSupport(context.userId);
    const empty: Centre360 = { listing: null, claims: [], openBills: [], empty: true };
    if (!centreId) return empty;
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      slug: string | null;
      city: string | null;
      province: string | null;
      license_number: string | null;
      license_status: string | null;
      registry_match_state: string | null;
      last_vacancy_updated_at: string | null;
    }>`
      select id, name, slug, city, province, license_number, license_status,
             registry_match_state, last_vacancy_updated_at
      from daycares where id = ${centreId} or slug = ${centreId} limit 1
    `.catch(() => []);
    if (!rows[0]) return empty;
    const d = rows[0];
    const claims = await sql<{
      id: string;
      user_id: string;
      status: string;
      created_at: string;
      review_note: string | null;
    }>`
      select id, user_id, status, created_at, review_note
      from listing_claims
      where daycare_id = ${d.id}
      order by created_at desc
      limit 20
    `.catch(() => []);
    const bills = await sql<{
      id: string;
      number: string;
      status: string;
      amount_cents: number | null;
      total: number;
      parent_email: string | null;
    }>`
      select i.id, i.number, i.status, i.amount_cents, i.total, u.email as parent_email
      from invoices i
      left join "user" u on u.id = i.parent_user_id
      where i.daycare_id = ${d.id} and i.status in ('sent', 'disputed')
      order by i.created_at desc
      limit 20
    `.catch(() => []);
    return {
      listing: {
        id: d.id,
        name: d.name,
        slug: d.slug,
        city: d.city,
        province: d.province,
        licenseNumber: d.license_number,
        licenseStatus: d.license_status,
        registryMatch: d.registry_match_state,
        lastVacancyUpdatedAt: d.last_vacancy_updated_at,
        vacancy: vacancyFreshness(d.last_vacancy_updated_at),
      },
      claims: claims.map((c) => ({
        id: c.id,
        userId: c.user_id,
        status: c.status,
        createdAt: String(c.created_at),
        reviewNote: c.review_note,
      })),
      openBills: bills.map((b) => ({
        id: b.id,
        number: b.number,
        status: b.status,
        amountCents: b.amount_cents != null ? Number(b.amount_cents) : Math.round((Number(b.total) || 0) * 100),
        parentEmail: b.parent_email,
      })),
      empty: false,
    } satisfies Centre360;
  });

export const logSupportPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; desk: "parent" | "provider" }) => {
    const caseId = String(input.caseId || "").trim();
    if (!caseId) throw new Error("Missing case");
    if (input.desk !== "parent" && input.desk !== "provider") throw new Error("Unknown desk");
    return { caseId, desk: input.desk };
  })
  .handler(async ({ context, data }) => {
    await requireSupport(context.userId);
    const sql = await getSql();
    const row = await loadCase(sql, data.caseId);
    if (!row) throw new Error("Case not found");
    await writeAudit(sql, {
      actorUserId: context.userId,
      action: "preview.desk",
      targetType: "support_case",
      targetId: data.caseId,
      meta: {
        desk: data.desk,
        note: "Banner-only scaffold. Agent is still themselves — no write impersonation.",
      },
    });
    return { ok: true as const };
  });
