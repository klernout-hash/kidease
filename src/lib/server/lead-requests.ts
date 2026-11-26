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
  displayedLeadStatus,
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
import { guestInfoUserId, normalizeInfoContact } from "@/lib/parent-listing";
import { callerIsAdmin, callerMayUseAdminOnlyListing } from "@/lib/server/public-listing";
import { lookupUser, notifyPlatform, notifyThreadParty } from "@/lib/server/notify";
import { requireAdmin } from "@/lib/server/roles";
import { listCentreOwnerEmails } from "@/lib/server/thread-access";
import { upsertDaycare } from "@/lib/server/seed";
import { infoQuestionMail, leadReplyMail, spotRequestMail, tourRequestMail, waitlistRequestMail } from "@/lib/mail-copy";
import { parentRequestSms } from "@/lib/sms-copy";
import { leadNotificationHref, leadTitleKey, notificationSourceKey } from "@/lib/notifications";
import { resolveActorUserId } from "@/lib/server/actor-user";
import { saveParentInAppNotice } from "@/lib/server/parent-notice";
import type { LeadEntryPoint } from "@/lib/lead-intake";
import { linkedParentName } from "@/lib/parent-display-name";
import { declineReasonValid, effectiveTourStatus } from "@/lib/tour-hold";
import { nextTourStatus } from "@/lib/threads";
import { nid } from "@/lib/utils";

type LeadRow = {
  id: string;
  kind: string;
  status: string;
  user_id: string;
  parent_name: string | null;
  parent_account?: string | null;
  parent_given?: string | null;
  parent_email: string | null;
  parent_phone?: string | null;
  daycare_id: string;
  daycare_name: string;
  slug: string;
  message: string | null;
  reply_note: string | null;
  source_kind: string | null;
  source_id: string | null;
  conversation_id: string | null;
  created_at: string | Date;
  updated_at: string;
  responded_at: string | null;
  tour_status?: string | null;
  tour_created_at?: string | Date | null;
  tour_hold_expires_at?: string | Date | null;
};

function mapLead(row: LeadRow): LeadRequest {
  const tourStatus = row.tour_status && row.tour_created_at
    ? effectiveTourStatus({
        status: row.tour_status,
        createdAt: row.tour_created_at,
        holdExpiresAt: row.tour_hold_expires_at,
      })
    : null;
  return {
    id: row.id,
    kind: isLeadKind(row.kind) ? row.kind : "spot_inquiry",
    status: displayedLeadStatus(row.status, tourStatus),
    userId: row.user_id,
    parentName: linkedParentName({
      accountName: row.parent_account ?? row.parent_name,
      givenName: row.parent_given,
    }),
    parentEmail: row.parent_email,
    parentPhone: row.parent_phone ?? null,
    daycareId: row.daycare_id,
    daycareName: row.daycare_name,
    daycareSlug: row.slug,
    message: row.message,
    replyNote: row.reply_note,
    sourceKind: (row.source_kind as LeadSourceKind | null) ?? null,
    sourceId: row.source_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: String(row.updated_at),
    respondedAt: row.responded_at ? String(row.responded_at) : null,
  };
}

async function ensureInfoThread(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  daycareId: string,
  message: string | null,
): Promise<string | null> {
  if (!userId || userId.startsWith("guest:")) return null;
  const convoId = nid("cv");
  await sql`
    insert into conversations (id, user_id, daycare_id)
    values (${convoId}, ${userId}, ${daycareId})
    on conflict (user_id, daycare_id) do nothing
  `.catch(() => undefined);
  const convos = await sql<{ id: string }>`
    select id from conversations where user_id = ${userId} and daycare_id = ${daycareId} limit 1
  `.catch(() => []);
  const cid = convos[0]?.id;
  if (!cid) return null;
  const body = (message || "").trim() || "I would like more information about your centre.";
  await sql`
    insert into messages (id, conversation_id, sender, body, kind)
    values (${nid("msg")}, ${cid}, ${"parent"}, ${body}, ${"chat"})
  `.catch(() => undefined);
  await sql`update conversations set last_at = now() where id = ${cid}`.catch(() => undefined);
  return cid;
}

export async function recordLeadRequest(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: {
    userId: string;
    daycareId: string;
    kind: LeadKind;
    message?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    sourceKind?: LeadSourceKind | null;
    sourceId?: string | null;
    conversationId?: string | null;
    notify?: boolean;
    entry?: LeadEntryPoint;
    childId?: string | null;
    childLabel?: string | null;
    ageGroup?: string | null;
    desiredStart?: string | null;
    schedule?: string | null;
    roomWanted?: string | null;
  },
): Promise<{ id: string; reused: boolean; conversationId: string | null } | null> {
  const { assertChatNotBlocked } = await import("@/lib/server/safety");
  await assertChatNotBlocked(sql, { senderId: input.userId, parentUserId: input.userId, daycareId: input.daycareId });
  const kind = input.kind;
  const message = (input.message || "").trim() || null;
  const sourceKind = input.sourceKind ?? null;
  const sourceId = (input.sourceId || "").trim() || null;
  const pipeLead = async () => {
    const { entryForLeadKind } = await import("@/lib/lead-intake");
    const { rememberCentreLead } = await import("@/lib/server/lead-intake-write");
    await rememberCentreLead(sql, {
      entry: input.entry || entryForLeadKind(kind, sourceKind),
      daycareId: input.daycareId,
      parentUserId: input.userId,
      email: input.email,
      name: [input.firstName, input.lastName].filter(Boolean).join(" "),
      phone: input.phone,
      childId: input.childId,
      childLabel: input.childLabel,
      ageGroup: input.ageGroup,
      desiredStart: input.desiredStart,
      schedule: input.schedule,
      roomWanted: input.roomWanted,
    });
  };

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
      await pipeLead();
      return { id: open[0].id, reused: true, conversationId: null };
    }
  }

  if (sourceKind && sourceId) {
    const existing = await sql<{ id: string }>`
      select id from lead_requests
      where source_kind = ${sourceKind} and source_id = ${sourceId}
      limit 1
    `.catch(() => []);
    if (existing[0]) {
      await pipeLead();
      return {
        id: existing[0].id,
        reused: true,
        conversationId: (input.conversationId || "").trim() || null,
      };
    }
  }

  const id = nid("lr");
  const firstName = (input.firstName || "").trim() || null;
  const lastName = (input.lastName || "").trim() || null;
  const phone = (input.phone || "").trim() || null;
  const email = (input.email || "").trim() || null;
  let conversationId = (input.conversationId || "").trim() || null;
  if (!conversationId && (kind === "info" || kind === "tour" || kind === "waitlist")) {
    conversationId = await ensureInfoThread(sql, input.userId, input.daycareId, message);
  }
  await sql`
    insert into lead_requests (
      id, kind, status, user_id, daycare_id, message,
      source_kind, source_id, conversation_id,
      parent_first_name, parent_last_name, parent_phone, contact_email,
      created_at, updated_at
    ) values (
      ${id}, ${kind}, ${"requested"}, ${input.userId}, ${input.daycareId}, ${message},
      ${sourceKind}, ${sourceId}, ${conversationId},
      ${firstName}, ${lastName}, ${phone}, ${email},
      now(), now()
    )
  `.catch(async () => {
    await sql`
      insert into lead_requests (
        id, kind, status, user_id, daycare_id, message,
        source_kind, source_id, conversation_id, created_at, updated_at
      ) values (
        ${id}, ${kind}, ${"requested"}, ${input.userId}, ${input.daycareId}, ${message},
        ${sourceKind}, ${sourceId}, ${conversationId}, now(), now()
      )
    `;
  });

  if (!input.userId.startsWith("guest:")) {
    const names = await sql<{ name: string }>`
      select name from daycares where id = ${input.daycareId} limit 1
    `.catch(() => [] as { name: string }[]);
    const noticeKind = kind === "tour" ? "tour" : "lead";
    const owners = await listCentreOwnerEmails(sql, input.daycareId);
    for (const owner of owners) {
      if (!owner.userId || owner.userId === input.userId) continue;
      await saveParentInAppNotice(sql, {
        userId: owner.userId,
        kind: noticeKind,
        titleKey: leadTitleKey({ audience: "provider", kind, status: "requested" }),
        href: leadNotificationHref({ audience: "provider", conversationId }),
        sourceKey: notificationSourceKey(noticeKind, id, "centre:requested"),
        daycareName: names[0]?.name,
        status: "requested",
      });
    }
  }

  await pipeLead();

  if (input.notify !== false) {
    await notifyNewLead(sql, {
      leadId: id,
      userId: input.userId,
      daycareId: input.daycareId,
      kind,
      message,
    }).catch((err) => console.error("[kidease-lead] notify failed", err));
  }

  return { id, reused: false, conversationId };
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
  const localeRows = await sql<{ locale: string | null; locale_chosen: boolean | string | number | null }>`
    select locale, locale_chosen from profiles where user_id = ${input.userId} limit 1
  `.catch(() => [] as { locale: string | null; locale_chosen: boolean | string | number | null }[]);
  const { savedFrLocale } = await import("@/lib/fr-ca");
  const mailLocale = savedFrLocale(localeRows[0]);
  const letter =
    input.kind === "waitlist"
      ? waitlistRequestMail(parentName, d.name, mailLocale)
      : input.kind === "spot_inquiry"
        ? spotRequestMail(parentName, d.name, null, mailLocale)
        : input.kind === "info"
          ? infoQuestionMail(parentName, d.name, mailLocale)
          : tourRequestMail(parentName, d.name, mailLocale);
  try {
    await notifyPlatform({
      kind: leadNotifyKind(input.kind),
      title: letter.adminSubject,
      daycareName: d.name,
      address: d.address ?? undefined,
      city: d.city ?? undefined,
      province: d.province ?? undefined,
      slug: d.slug,
      actorName: parentName,
      actorEmail: actor.email,
      detail: input.message || letter.preview,
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
        subject: letter.daycareSubject,
        preview: letter.preview,
        previewFr: letter.previewFr,
        preheader: letter.preview,
        threadUrl: inboxUrl,
        daycareName: d.name,
      }).catch(() => undefined),
    ),
  );
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  void import("@/lib/server/sms-notify")
    .then((mod) => mod.notifyCentreSms({ daycareId: input.daycareId, body: parentRequestSms(d.name, mailLocale) }))
    .catch(() => undefined);
  await Promise.all(
    recipients.map((r) => {
      if (!r.userId) return Promise.resolve();
      return dispatchCustomerAlert({
        userId: r.userId,
        category: "enquiry",
        vars: { name: d.name },
        href: DAYCARE_INBOX_HREF,
        dedupeKey: `enquiry:${input.leadId}:${r.userId}`,
        emailFallback: false,
      });
    }),
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
      select l.id, l.kind, l.status, l.user_id,
             nullif(btrim(u.name), '') as parent_account,
             nullif(btrim(concat_ws(' ', l.parent_first_name, l.parent_last_name)), '') as parent_given,
             nullif(btrim(u.name), '') as parent_name,
             coalesce(u.email, l.contact_email) as parent_email,
             l.parent_phone,
             l.daycare_id, d.name as daycare_name, d.slug, l.message, l.reply_note,
             l.source_kind, l.source_id, l.conversation_id, l.created_at, l.updated_at, l.responded_at,
             t.status as tour_status, t.created_at as tour_created_at, t.hold_expires_at as tour_hold_expires_at
      from lead_requests l
      join daycares d on d.id = l.daycare_id
      left join "user" u on u.id = l.user_id
      left join tour_requests t on l.source_kind = 'tour_request' and t.id = l.source_id
        and t.daycare_id = l.daycare_id and t.user_id = l.user_id
      where (
          l.user_id = ${context.userId}
          and ${asParent}
        )
         or (
          ${asCentre}
          and (
            exists (
              select 1 from provider_daycares p
              where p.user_id = ${context.userId} and p.daycare_id = l.daycare_id
            )
            or exists (
              select 1 from centre_members m
              where m.user_id = ${context.userId} and m.daycare_id = l.daycare_id and m.status = 'active'
            )
         )
      )
      order by
        case when l.status in ('requested', 'received') then 0 else 1 end,
        l.created_at desc
    `.catch(() => []);
    const { daycareIdsForArea } = await import("@/lib/server/centre-access");
    const requestCentres = new Set(await daycareIdsForArea(sql, context.userId, "requests", "view"));
    const { omitHiddenParents } = await import("@/lib/server/safety");
    const centreRows = rows
      .filter((row) => row.user_id && row.user_id !== context.userId)
      .map((row) => ({ id: row.id, userId: row.user_id, daycareId: row.daycare_id }));
    const visibleCentre = await omitHiddenParents(sql, centreRows);
    const visibleIds = new Set(visibleCentre.map((row) => row.id));
    return rows
      .filter((row) => row.user_id === context.userId || requestCentres.has(row.daycare_id))
      .filter((row) => !row.user_id || row.user_id === context.userId || visibleIds.has(row.id))
      .map((row) => {
        const lead = mapLead(row);
        if (data.desk === "centre") return { ...lead, parentEmail: null };
        return lead;
      });
  });

/** KidEase CRM form tag (form:*) for a parent request on a listing. */
function leadKindGhlForm(kind: LeadKind): "tour" | "waitlist" | "spot" | "info" {
  if (kind === "tour") return "tour";
  if (kind === "waitlist") return "waitlist";
  if (kind === "spot_inquiry") return "spot";
  return "info";
}

export const createLeadRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; kind: LeadKind; message?: string }) => input)
  .handler(async ({ context, data }) => {
    const { assertFacebookContactEmail } = await import("@/lib/server/facebook-contact");
    await assertFacebookContactEmail(context.userId);
    if (!isLeadKind(data.kind)) throw new Error("Invalid request type");
    const daycareId = (data.daycareId || "").trim();
    if (!daycareId) throw new Error("Centre not found");
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerMayUseAdminOnlyListing())) {
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
    {
      const { captureFormLead } = await import("@/lib/server/ghl-form-lead");
      await captureFormLead({ form: leadKindGhlForm(data.kind), userId: context.userId, parentAction: true });
    }
    void import("@/lib/server/engagement")
      .then(async (mod) => {
        const qa = await mod.centreIsQa(daycareId);
        await mod.recordEngagement({
          event: "inquiry_sent",
          actorId: context.userId,
          centreId: daycareId,
          threadId: recorded.id,
          role: "parent",
          qa,
        });
      })
      .catch(() => undefined);
    return { id: recorded.id, status: "requested" as const, reused: recorded.reused };
  });

export const createInfoRequest = createServerFn({ method: "POST" })
  .validator((input: {
    daycareId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    message?: string;
    userId?: string;
  }) => input)
  .handler(async ({ data }) => {
    const contact = normalizeInfoContact(data);
    if (!contact.ok) throw new Error("Please enter your name, phone, and email.");
    const daycareId = (data.daycareId || "").trim();
    if (!daycareId) throw new Error("Centre not found");
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerMayUseAdminOnlyListing())) {
      throw new Error("Listing not found");
    }
    const sql = await getSql();
    if (listed) await upsertDaycare(sql, listed);
    const exists = await sql<{ id: string }>`select id from daycares where id = ${daycareId} limit 1`;
    if (!exists[0]) throw new Error("Centre not found");
    const actorId = await resolveActorUserId(data.userId);
    const userId = actorId || guestInfoUserId(contact.email);
    const note = [
      `${contact.firstName} ${contact.lastName}`,
      contact.phone,
      contact.email,
      contact.message,
    ]
      .filter(Boolean)
      .join("\n");
    const recorded = await recordLeadRequest(sql, {
      userId,
      daycareId,
      kind: "info",
      message: note,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email,
      entry: "contact_form",
    });
    if (!recorded) throw new Error("Could not save request");
    {
      const { captureFormLead } = await import("@/lib/server/ghl-form-lead");
      await captureFormLead({
        form: "info",
        userId: actorId,
        email: contact.email,
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        phone: contact.phone,
        parentAction: Boolean(actorId),
      });
    }
    return {
      id: recorded.id,
      status: "requested" as const,
      reused: recorded.reused,
      conversationId: recorded.conversationId,
    };
  });

/** Tour interest for a centre that has not posted times yet. Guests and signed-in parents can send it. */
export const createTourInterest = createServerFn({ method: "POST" })
  .validator((input: {
    daycareId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    message?: string;
    preferredTimes?: string;
    userId?: string;
  }) => input)
  .handler(async ({ data }) => {
    const actorId = await resolveActorUserId(data.userId);
    const contact = normalizeInfoContact({
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      phone: data.phone || "",
      email: data.email || "",
      message: data.message,
    });
    if (!actorId && !contact.ok) throw new Error("Please enter your name, phone, and email.");
    const daycareId = (data.daycareId || "").trim();
    if (!daycareId) throw new Error("Centre not found");
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerMayUseAdminOnlyListing())) {
      throw new Error("Listing not found");
    }
    const sql = await getSql();
    if (listed) await upsertDaycare(sql, listed);
    const exists = await sql<{ id: string }>`select id from daycares where id = ${daycareId} limit 1`;
    if (!exists[0]) throw new Error("Centre not found");
    const userId = actorId || guestInfoUserId(contact.email);
    const note = [
      (data.preferredTimes || "").trim(),
      contact.ok ? `${contact.firstName} ${contact.lastName}` : "",
      contact.ok ? contact.phone : "",
      contact.ok ? contact.email : "",
      contact.message || (data.message || "").trim(),
    ]
      .filter(Boolean)
      .join("\n");
    const recorded = await recordLeadRequest(sql, {
      userId,
      daycareId,
      kind: "tour",
      message: note,
      firstName: contact.ok ? contact.firstName : null,
      lastName: contact.ok ? contact.lastName : null,
      phone: contact.ok ? contact.phone : null,
      email: contact.ok ? contact.email : null,
    });
    if (!recorded) throw new Error("Could not save request");
    {
      // Tour interest is an info request until the centre posts tour times.
      const { captureFormLead } = await import("@/lib/server/ghl-form-lead");
      await captureFormLead({
        form: "info",
        userId: actorId,
        email: contact.ok ? contact.email : null,
        name: contact.ok ? `${contact.firstName} ${contact.lastName}`.trim() : null,
        phone: contact.ok ? contact.phone : null,
        parentAction: Boolean(actorId),
      });
    }
    return {
      id: recorded.id,
      status: "requested" as const,
      reused: recorded.reused,
      conversationId: recorded.conversationId,
    };
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
      kind: string;
      user_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      visibility: string | null;
      is_test: boolean | number | null;
      conversation_id: string | null;
      source_kind: string | null;
      source_id: string | null;
    }>`
      select l.id, l.status, l.kind, l.user_id, l.daycare_id, d.name as daycare_name, d.slug,
             d.visibility, d.is_test, l.conversation_id, l.source_kind, l.source_id
      from lead_requests l
      join daycares d on d.id = l.daycare_id
      where l.id = ${data.leadId}
      limit 1
    `.catch(() => []);
    const lead = rows[0];
    if (!lead) throw new Error(ACCESS_NOT_FOUND);

    const { assertCentreAction } = await import("@/lib/server/centre-access");
    const admin = await callerIsAdmin();
    if (!admin) {
      await assertCentreAction(sql, context.userId, lead.daycare_id, "write");
      const { assertStaffArea } = await import("@/lib/server/centre-access");
      await assertStaffArea(sql, context.userId, lead.daycare_id, "requests", "edit");
    }

    const next = nextLeadStatus(lead.status, data.action);
    if (!next) throw new Error("This request was already answered");
    if ((data.action === "confirm" || data.action === "decline") && lead.source_kind === "booking" && lead.source_id) {
      // A spot request answered from the lead card also accepts or declines the booking.
      const { applyLeadDecisionToBooking } = await import("@/lib/server/pipeline-sync");
      await applyLeadDecisionToBooking(lead.source_id, data.action);
    }

    const note = (data.note || "").trim() || null;
    if ((data.action === "confirm" || data.action === "decline") && (lead.kind === "tour" || lead.source_kind === "tour_request")) {
      await applyLeadDecisionToTour(sql, {
        userId: context.userId,
        parentUserId: lead.user_id,
        daycareId: lead.daycare_id,
        sourceId: lead.source_id,
        action: data.action,
        note,
      });
    }
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
    const reply = leadReplyMail(next, lead.daycare_name);
    const noteLine = (note || "").trim();
    const preview = noteLine ? `${reply.preview} ${noteLine}` : reply.preview;
    const mailed = await notifyThreadParty({
      to: parent.email,
      name: parent.name,
      subject: reply.subject,
      preview,
      previewFr: reply.previewFr,
      preheader: reply.preview,
      threadUrl: `${origin}${PARENT_REQUESTS_HREF}`,
      daycareName: lead.daycare_name,
      aboutTestListing: isAdminOnlyListing({
        name: lead.daycare_name,
        slug: lead.slug,
        visibility: lead.visibility,
        isTest: lead.is_test,
      }),
    }).catch(() => ({ status: "failed" as const }));
    const emailed = mailed.status === "sent";

    try {
      const actor = await lookupUser(context.userId);
      await notifyPlatform({
        kind: "lead_request",
        title: leadReplyMail(next, lead.daycare_name).adminSubject,
        daycareName: lead.daycare_name,
        slug: lead.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: note || next,
      });
    } catch {
      /* admin mail is best-effort */
    }

    return { ok: true as const, status: next, emailed };
  });

/** Confirm or decline the parent's tour row so the lead, the parent page, and the pipeline agree. */
async function applyLeadDecisionToTour(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: {
    userId: string;
    parentUserId: string;
    daycareId: string;
    sourceId: string | null;
    action: "confirm" | "decline";
    note: string | null;
  },
) {
  const tours = await sql<{
    id: string;
    status: string;
    created_at: string | Date;
    hold_expires_at: string | Date | null;
  }>`
    select id, status, created_at, hold_expires_at
    from tour_requests
    where daycare_id = ${input.daycareId}
      and user_id = ${input.parentUserId}
      and (
        id = ${input.sourceId || ""}
        or status = 'pending'
      )
    order by created_at desc
    limit 5
  `.catch(() => []);
  const tour = tours.find((row) => input.sourceId && row.id === input.sourceId) || tours.find((row) => row.status === "pending");
  if (!tour) return;
  const effective = effectiveTourStatus({
    status: tour.status,
    createdAt: tour.created_at,
    holdExpiresAt: tour.hold_expires_at,
  });
  if (effective === "expired") throw new Error("This tour request expired");
  const tourNext = input.action === "confirm" ? "accepted" : "declined";
  if (effective === tourNext) return;
  if (!nextTourStatus(effective, tourNext)) throw new Error("This request was already answered");
  if (tourNext === "declined" && !declineReasonValid(input.note)) {
    throw new Error("Add a reason so the parent knows why this tour was declined");
  }
  const updated = await sql<{ id: string }>`
    update tour_requests
    set status = ${tourNext},
        centre_note = ${input.note},
        responded_by = ${input.userId},
        responded_at = now(),
        hold_expires_at = null
    where id = ${tour.id} and status = ${tour.status}
      and (status <> 'pending' or coalesce(hold_expires_at, created_at + interval '48 hours') > now())
    returning id
  `;
  if (!updated[0]) throw new Error("This tour request was already answered or expired");
  await sql`
    update lead_requests
    set source_kind = 'tour_request',
        source_id = ${tour.id}
    where user_id = ${input.parentUserId}
      and daycare_id = ${input.daycareId}
      and kind = 'tour'
      and source_id is null
  `;
}

export const listAdminLeadCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LeadCounts> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ status: string }>`
      select case when t.status = 'expired' or (t.status = 'pending'
        and coalesce(t.hold_expires_at, t.created_at + interval '48 hours') <= now())
        then 'declined' else l.status end as status
      from lead_requests l
      left join tour_requests t on l.source_kind = 'tour_request' and t.id = l.source_id
        and t.daycare_id = l.daycare_id and t.user_id = l.user_id
    `.catch(() => []);
    if (!rows.length) return emptyLeadCounts();
    return tallyLeadCounts(rows.map((r) => r.status));
  });
