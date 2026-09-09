import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { catalogByIdGet } from "@/lib/catalog";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { ACCESS_NOT_FOUND } from "@/lib/access-control";
import {
  DAYCARE_INBOX_HREF,
  PARENT_REQUESTS_HREF,
  canUpdateLeadStatus,
  emptyLeadCounts,
  isLeadAction,
  isLeadKind,
  isLeadStatus,
  leadNotifyKind,
  leadReplyPreview,
  nextLeadStatus,
  tallyLeadCounts,
  type LeadAction,
  type LeadCounts,
  type LeadKind,
  type LeadRequest,
  type LeadSourceKind,
} from "@/lib/lead-requests";
import { callerIsAdmin } from "@/lib/server/public-listing";
import { lookupUser, notifyPlatform, notifyThreadParty } from "@/lib/server/notify";
import { requireAdmin } from "@/lib/server/roles";
import { isCentreOwner, listCentreOwnerEmails } from "@/lib/server/thread-access";
import { upsertDaycare } from "@/lib/server/seed";
import { nid } from "@/lib/utils";

type LeadRow = {
  id: string;
  kind: string;
  status: string;
  user_id: string;
  parent_name: string | null;
  parent_email: string | null;
  daycare_id: string;
  daycare_name: string;
  slug: string;
  message: string | null;
  reply_note: string | null;
  source_kind: string | null;
  source_id: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
};

function mapLead(row: LeadRow): LeadRequest {
  return {
    id: row.id,
    kind: isLeadKind(row.kind) ? row.kind : "spot_inquiry",
    status: isLeadStatus(row.status) ? row.status : "requested",
    userId: row.user_id,
    parentName: row.parent_name,
    parentEmail: row.parent_email,
    daycareId: row.daycare_id,
    daycareName: row.daycare_name,
    daycareSlug: row.slug,
    message: row.message,
    replyNote: row.reply_note,
    sourceKind: (row.source_kind as LeadSourceKind | null) ?? null,
    sourceId: row.source_id,
    conversationId: row.conversation_id,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    respondedAt: row.responded_at ? String(row.responded_at) : null,
  };
}

export async function recordLeadRequest(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: {
    userId: string;
    daycareId: string;
    kind: LeadKind;
    message?: string | null;
    sourceKind?: LeadSourceKind | null;
    sourceId?: string | null;
    conversationId?: string | null;
    notify?: boolean;
  },
): Promise<{ id: string; reused: boolean } | null> {
  const kind = input.kind;
  const message = (input.message || "").trim() || null;
  const sourceKind = input.sourceKind ?? null;
  const sourceId = (input.sourceId || "").trim() || null;

  if (kind === "waitlist") {
    const open = await sql<{ id: string }>`
      select id from lead_requests
      where user_id = ${input.userId}
        and daycare_id = ${input.daycareId}
        and kind = ${"waitlist"}
        and status not in ('declined', 'closed')
      order by created_at desc
      limit 1
    `.catch(() => []);
    if (open[0]) {
      if (sourceKind && sourceId) {
        await sql`
          update lead_requests
          set source_kind = coalesce(source_kind, ${sourceKind}),
              source_id = coalesce(source_id, ${sourceId}),
              message = coalesce(${message}, message),
              updated_at = now()
          where id = ${open[0].id}
        `.catch(() => undefined);
      }
      return { id: open[0].id, reused: true };
    }
  }

  if (sourceKind && sourceId) {
    const existing = await sql<{ id: string }>`
      select id from lead_requests
      where source_kind = ${sourceKind} and source_id = ${sourceId}
      limit 1
    `.catch(() => []);
    if (existing[0]) return { id: existing[0].id, reused: true };
  }

  const id = nid("lr");
  await sql`
    insert into lead_requests (
      id, kind, status, user_id, daycare_id, message,
      source_kind, source_id, conversation_id, created_at, updated_at
    ) values (
      ${id}, ${kind}, ${"requested"}, ${input.userId}, ${input.daycareId}, ${message},
      ${sourceKind}, ${sourceId}, ${input.conversationId || null}, now(), now()
    )
  `;

  if (input.notify !== false) {
    await notifyNewLead(sql, {
      leadId: id,
      userId: input.userId,
      daycareId: input.daycareId,
      kind,
      message,
    }).catch((err) => console.error("[kidease-lead] notify failed", err));
  }

  return { id, reused: false };
}

export async function closeWaitlistLead(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  daycareId: string,
) {
  await sql`
    update lead_requests
    set status = ${"closed"},
        updated_at = now(),
        responded_at = coalesce(responded_at, now())
    where user_id = ${userId}
      and daycare_id = ${daycareId}
      and kind = ${"waitlist"}
      and status not in ('declined', 'closed')
  `.catch(() => undefined);
}

async function notifyNewLead(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: {
    leadId: string;
    userId: string;
    daycareId: string;
    kind: LeadKind;
    message: string | null;
  },
) {
  const daycares = await sql<{
    id: string;
    name: string;
    slug: string;
    address: string | null;
    city: string | null;
    province: string | null;
    contact_email: string | null;
  }>`
    select id, name, slug, address, city, province, contact_email
    from daycares where id = ${input.daycareId} limit 1
  `;
  const d = daycares[0];
  if (!d) return;
  const actor = await lookupUser(input.userId);
  const parentName = (actor.name || "A parent").trim() || "A parent";
  const kindLabel =
    input.kind === "waitlist" ? "Waitlist" : input.kind === "spot_inquiry" ? "Spot inquiry" : "Tour";
  try {
    await notifyPlatform({
      kind: leadNotifyKind(input.kind),
      title: `${kindLabel} request: ${d.name}`,
      daycareName: d.name,
      address: d.address ?? undefined,
      city: d.city ?? undefined,
      province: d.province ?? undefined,
      slug: d.slug,
      actorName: parentName,
      actorEmail: actor.email,
      detail: input.message || kindLabel,
    });
  } catch (err) {
    console.error("[kidease-mail] lead request notify failed", err);
  }

  const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
  const inboxUrl = `${origin}${DAYCARE_INBOX_HREF}`;
  const owners = await listCentreOwnerEmails(sql, input.daycareId);
  const extras = (d.contact_email || "").trim();
  const recipients = [...owners];
  if (extras && !recipients.some((r) => r.email.toLowerCase() === extras.toLowerCase())) {
    recipients.push({ email: extras, name: d.name });
  }
  await Promise.all(
    recipients.map((r) =>
      notifyThreadParty({
        to: r.email,
        name: r.name,
        subject: `${kindLabel} request for ${d.name}`,
        preview: `${parentName} sent a ${kindLabel.toLowerCase()} request for ${d.name}.`,
        threadUrl: inboxUrl,
        daycareName: d.name,
      }).catch(() => undefined),
    ),
  );
}

export const listLeadRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { desk?: "parent" | "centre" }) => input ?? {})
  .handler(async ({ context, data }): Promise<LeadRequest[]> => {
    const sql = await getSql();
    const asParent = data.desk !== "centre";
    const asCentre = data.desk !== "parent";
    const rows = await sql<LeadRow>`
      select l.id, l.kind, l.status, l.user_id, u.name as parent_name, u.email as parent_email,
             l.daycare_id, d.name as daycare_name, d.slug, l.message, l.reply_note,
             l.source_kind, l.source_id, l.conversation_id, l.created_at, l.updated_at, l.responded_at
      from lead_requests l
      join daycares d on d.id = l.daycare_id
      left join "user" u on u.id = l.user_id
      where (
          l.user_id = ${context.userId}
          and ${asParent}
        )
         or (
          ${asCentre}
          and exists (
           select 1 from provider_daycares p
           where p.user_id = ${context.userId} and p.daycare_id = l.daycare_id
         )
      )
      order by
        case when l.status in ('requested', 'received') then 0 else 1 end,
        l.created_at desc
    `.catch(() => []);
    return rows.map(mapLead);
  });

export const createLeadRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; kind: LeadKind; message?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!isLeadKind(data.kind)) throw new Error("Invalid request type");
    const daycareId = (data.daycareId || "").trim();
    if (!daycareId) throw new Error("Centre not found");
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    const sql = await getSql();
    if (listed) await upsertDaycare(sql, listed);
    const exists = await sql<{ id: string }>`select id from daycares where id = ${daycareId} limit 1`;
    if (!exists[0]) throw new Error("Centre not found");
    const recorded = await recordLeadRequest(sql, {
      userId: context.userId,
      daycareId,
      kind: data.kind,
      message: data.message,
    });
    if (!recorded) throw new Error("Could not save request");
    return { id: recorded.id, status: "requested" as const, reused: recorded.reused };
  });

export const updateLeadRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { leadId: string; action: LeadAction; note?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!isLeadAction(data.action)) throw new Error("Invalid status");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      user_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      conversation_id: string | null;
    }>`
      select l.id, l.status, l.user_id, l.daycare_id, d.name as daycare_name, d.slug, l.conversation_id
      from lead_requests l
      join daycares d on d.id = l.daycare_id
      where l.id = ${data.leadId}
      limit 1
    `.catch(() => []);
    const lead = rows[0];
    if (!lead) throw new Error(ACCESS_NOT_FOUND);

    const owned = await isCentreOwner(sql, context.userId, lead.daycare_id);
    const admin = await callerIsAdmin();
    if (!canUpdateLeadStatus({ daycareId: lead.daycare_id, ownedDaycareIds: owned ? [lead.daycare_id] : [], isAdmin: admin })) {
      throw new Error("Not authorized");
    }

    const next = nextLeadStatus(lead.status, data.action);
    if (!next) throw new Error("This request was already answered");

    const note = (data.note || "").trim() || null;
    await sql`
      update lead_requests
      set status = ${next},
          reply_note = coalesce(${note}, reply_note),
          responded_by = ${context.userId},
          responded_at = now(),
          updated_at = now()
      where id = ${lead.id}
    `;

    const parent = await lookupUser(lead.user_id);
    const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
    const preview = leadReplyPreview(next, lead.daycare_name, note);
    await notifyThreadParty({
      to: parent.email,
      name: parent.name,
      subject:
        next === "confirmed"
          ? `Request confirmed — ${lead.daycare_name}`
          : next === "declined"
            ? `Request update — ${lead.daycare_name}`
            : `Request answered — ${lead.daycare_name}`,
      preview,
      threadUrl: `${origin}${PARENT_REQUESTS_HREF}`,
      daycareName: lead.daycare_name,
    }).catch(() => undefined);

    try {
      const actor = await lookupUser(context.userId);
      await notifyPlatform({
        kind: "lead_request",
        title:
          next === "confirmed"
            ? `Lead confirmed: ${lead.daycare_name}`
            : next === "declined"
              ? `Lead declined: ${lead.daycare_name}`
              : `Lead answered: ${lead.daycare_name}`,
        daycareName: lead.daycare_name,
        slug: lead.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: note || next,
      });
    } catch {
      /* admin mail is best-effort */
    }

    return { ok: true as const, status: next };
  });

export const listAdminLeadCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LeadCounts> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ status: string }>`
      select status from lead_requests
    `.catch(() => []);
    if (!rows.length) return emptyLeadCounts();
    return tallyLeadCounts(rows.map((r) => r.status));
  });
