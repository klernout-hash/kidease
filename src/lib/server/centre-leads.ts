/**
 * Daycare lead desk. Reads tours, requests, waitlists, offers, and enrolments
 * the family already shared with this centre. Does not read child health.
 * Mail, text, and push stay held.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  applyLeadUpdate,
  assignLead,
  centreLeadAccess,
  centreLeadFunnel,
  cleanAgeGroup,
  cleanContact,
  cleanNote,
  cleanStartMonth,
  factsFromSources,
  isCentreLeadStage,
  isHiddenLeadCentre,
  isLostReason,
  leadAlertMaySend,
  planCentreLeadAlerts,
  planLeadStageEvent,
  resolveLeadCentre,
  type LeadFact,
  type LostReason,
  type Reached,
  type SourceBundle,
  type StoredLead,
} from "@/lib/centre-leads";
import { hashCentreApiKey, mintCentreApiKey, parseScopes, webhookNextAttempt, webhookUrlAllowed, type CentreApiStore } from "@/lib/centre-api";
import { centreApiEnabled, centreLeadTrackerEnabled } from "@/lib/features";
import { getSql, type Sql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { listAccessibleDaycareIds, loadCentreRole } from "@/lib/server/centre-access";
import { captureServerProductEvent } from "@/lib/server/product-events";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function reachedOf(row: Record<string, unknown>): Reached {
  return {
    inquiry: Boolean(row.reached_inquiry),
    tour: Boolean(row.reached_tour),
    toured: Boolean(row.reached_toured),
    applied: Boolean(row.reached_applied),
    enrolled: Boolean(row.reached_enrolled),
  };
}

function toStored(row: Record<string, unknown>): StoredLead {
  const stage = isCentreLeadStage(String(row.stage || "")) ? row.stage : "inquiry";
  const source = String(row.source || "inquiry");
  return {
    id: String(row.id),
    daycareId: String(row.daycare_id),
    parentUserId: row.parent_user_id ? String(row.parent_user_id) : null,
    contactName: (row.contact_name as string | null) ?? null,
    contactEmail: (row.contact_email as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    childLabel: (row.child_label as string | null) ?? null,
    ageGroup: (row.age_group as string | null) ?? null,
    desiredStart: (row.desired_start as string | null) ?? null,
    source: source as StoredLead["source"],
    stage: stage as StoredLead["stage"],
    autoStage: isCentreLeadStage(String(row.auto_stage || "")) ? (row.auto_stage as StoredLead["autoStage"]) : null,
    autoRule: (row.auto_rule as string | null) ?? null,
    stageLocked: Boolean(row.stage_locked),
    lostReason: isLostReason(String(row.lost_reason || "")) ? (row.lost_reason as LostReason) : null,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    reached: reachedOf(row),
    startedAt: iso(row.started_at),
    lastActivityAt: iso(row.last_activity_at),
    tourAt: row.tour_at ? iso(row.tour_at) : null,
    offerExpiresAt: row.offer_expires_at ? iso(row.offer_expires_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function loadBundle(sql: Sql, daycareId: string): Promise<SourceBundle> {
  const conversations = await sql<{ user_id: string; last_at: string }>`
    select user_id, last_at from conversations where daycare_id = ${daycareId}
  `.catch(() => []);
  const leads = await sql<{
    user_id: string;
    kind: string;
    status: string;
    created_at: string;
    parent_phone: string | null;
    contact_email: string | null;
    parent_first_name: string | null;
    parent_last_name: string | null;
  }>`
    select user_id, kind, status, created_at, parent_phone, contact_email, parent_first_name, parent_last_name
    from lead_requests where daycare_id = ${daycareId}
  `.catch(() => []);
  const tours = await sql<{
    user_id: string;
    status: string;
    created_at: string;
    child_name: string | null;
    parent_phone: string | null;
    contact_email: string | null;
    parent_first_name: string | null;
    parent_last_name: string | null;
    start_at: string | null;
  }>`
    select t.user_id, t.status, t.created_at, t.child_name, t.parent_phone, t.contact_email,
           t.parent_first_name, t.parent_last_name, w.start_at
    from tour_requests t
    left join tour_windows w on w.id = t.window_id
    where t.daycare_id = ${daycareId}
  `.catch(() => []);
  const bookings = await sql<{
    user_id: string;
    status: string;
    created_at: string;
    age_group: string | null;
    start_month: string | null;
  }>`
    select user_id, status, created_at, age_group, start_month
    from bookings where daycare_id = ${daycareId}
  `.catch(() => []);
  const waitlist = await sql<{
    user_id: string;
    status: string;
    joined_at: string;
    age_group: string | null;
    child_label: string | null;
  }>`
    select user_id, status, joined_at, age_group, child_label
    from daycare_waitlist where daycare_id = ${daycareId}
  `.catch(() => []);
  const offers = await sql<{ user_id: string; status: string; offered_at: string; expires_at: string | null }>`
    select user_id, status, offered_at, expires_at from spot_offers where daycare_id = ${daycareId}
  `.catch(() => []);
  const agreements = await sql<{ parent_user_id: string; status: string; updated_at: string }>`
    select parent_user_id, status, updated_at
    from parent_enrolment_agreements where daycare_id = ${daycareId}
  `.catch(() => []);
  const ids = [
    ...conversations.map((row) => row.user_id),
    ...leads.map((row) => row.user_id),
    ...tours.map((row) => row.user_id),
    ...bookings.map((row) => row.user_id),
    ...waitlist.map((row) => row.user_id),
    ...offers.map((row) => row.user_id),
    ...agreements.map((row) => row.parent_user_id),
  ].filter(Boolean);
  const people = ids.length
    ? await sql.query<{ id: string; name: string | null; email: string | null }>(
        `select id, name, email from "user" where id = any($1::text[])`,
        [[...new Set(ids)]],
      ).catch(() => [])
    : [];
  const nameOf = (first: string | null, last: string | null) =>
    [first, last].map((part) => String(part || "").trim()).filter(Boolean).join(" ") || null;
  return {
    conversations: conversations.map((row) => ({ userId: row.user_id, lastAt: iso(row.last_at) })),
    leads: leads.map((row) => ({
      userId: row.user_id,
      at: iso(row.created_at),
      status: row.status,
      kind: row.kind,
      name: nameOf(row.parent_first_name, row.parent_last_name),
      email: row.contact_email,
      phone: row.parent_phone,
    })),
    tours: tours.map((row) => ({
      userId: row.user_id,
      at: iso(row.created_at),
      status: row.status,
      name: nameOf(row.parent_first_name, row.parent_last_name),
      email: row.contact_email,
      phone: row.parent_phone,
      childLabel: row.child_name,
      startAt: row.start_at ? iso(row.start_at) : null,
    })),
    bookings: bookings.map((row) => ({
      userId: row.user_id,
      at: iso(row.created_at),
      status: row.status,
      ageGroup: row.age_group,
      startMonth: row.start_month,
    })),
    waitlist: waitlist.map((row) => ({
      userId: row.user_id,
      at: iso(row.joined_at),
      status: row.status,
      ageGroup: row.age_group,
      childLabel: row.child_label,
    })),
    offers: offers.map((row) => ({
      userId: row.user_id,
      at: iso(row.offered_at),
      status: row.status,
      expiresAt: row.expires_at ? iso(row.expires_at) : null,
    })),
    agreements: agreements.map((row) => ({
      userId: row.parent_user_id,
      status: row.status,
      at: iso(row.updated_at),
    })),
    people: people.map((row) => ({ userId: row.id, name: row.name, email: row.email })),
  };
}

async function saveLead(sql: Sql, lead: StoredLead) {
  await sql`
    insert into centre_leads (
      id, daycare_id, parent_user_id, contact_name, contact_email, contact_phone, child_label,
      age_group, desired_start, source, stage, auto_stage, auto_rule, stage_locked, lost_reason,
      assigned_user_id, reached_inquiry, reached_tour, reached_toured, reached_applied, reached_enrolled,
      started_at, last_activity_at, tour_at, offer_expires_at, created_at, updated_at
    ) values (
      ${lead.id}, ${lead.daycareId}, ${lead.parentUserId}, ${lead.contactName}, ${lead.contactEmail},
      ${lead.contactPhone}, ${lead.childLabel}, ${lead.ageGroup}, ${lead.desiredStart}, ${lead.source},
      ${lead.stage}, ${lead.autoStage}, ${lead.autoRule}, ${lead.stageLocked}, ${lead.lostReason},
      ${lead.assignedUserId}, ${lead.reached.inquiry}, ${lead.reached.tour}, ${lead.reached.toured},
      ${lead.reached.applied}, ${lead.reached.enrolled}, ${lead.startedAt}, ${lead.lastActivityAt},
      ${lead.tourAt}, ${lead.offerExpiresAt}, ${lead.createdAt}, ${lead.updatedAt}
    )
    on conflict (id) do update set
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      child_label = excluded.child_label,
      age_group = excluded.age_group,
      desired_start = excluded.desired_start,
      source = excluded.source,
      stage = excluded.stage,
      auto_stage = excluded.auto_stage,
      auto_rule = excluded.auto_rule,
      stage_locked = excluded.stage_locked,
      lost_reason = excluded.lost_reason,
      assigned_user_id = excluded.assigned_user_id,
      reached_inquiry = excluded.reached_inquiry,
      reached_tour = excluded.reached_tour,
      reached_toured = excluded.reached_toured,
      reached_applied = excluded.reached_applied,
      reached_enrolled = excluded.reached_enrolled,
      started_at = excluded.started_at,
      last_activity_at = excluded.last_activity_at,
      tour_at = excluded.tour_at,
      offer_expires_at = excluded.offer_expires_at,
      updated_at = excluded.updated_at
  `;
}

async function recordEvent(
  sql: Sql,
  lead: StoredLead,
  event: { fromStage: string | null; toStage: string; ruleId: string; lostReason: string | null; at: string },
  actorUserId: string | null,
) {
  const id = nid("le");
  await sql`
    insert into centre_lead_events (
      id, lead_id, daycare_id, from_stage, to_stage, rule_id, lost_reason, actor_user_id, created_at
    ) values (
      ${id}, ${lead.id}, ${lead.daycareId}, ${event.fromStage}, ${event.toStage}, ${event.ruleId},
      ${event.lostReason}, ${actorUserId}, ${event.at}
    )
  `;
  if (event.fromStage !== event.toStage) {
    const planned = planLeadStageEvent({
      hiddenCentre: isHiddenLeadCentre(lead.daycareId),
      from: event.fromStage,
      to: event.toStage,
      rule: event.ruleId,
      lostReason: event.lostReason,
    });
    if (planned) {
      await captureServerProductEvent(planned.event, planned.properties, hashCentreApiKey(lead.id).slice(0, 24));
    }
    await enqueueWebhook(sql, lead, id);
  }
}

async function enqueueWebhook(sql: Sql, lead: StoredLead, eventKey: string) {
  if (!centreApiEnabled() || isHiddenLeadCentre(lead.daycareId)) return;
  const hooks = await sql<{ enabled: boolean }>`
    select enabled from centre_webhooks where daycare_id = ${lead.daycareId} limit 1
  `.catch(() => []);
  if (!hooks[0]?.enabled) return;
  await sql`
    insert into centre_webhook_deliveries (id, daycare_id, lead_id, event_key, attempt, next_at, status)
    values (${nid("wh")}, ${lead.daycareId}, ${lead.id}, ${eventKey}, ${0}, now(), ${"pending"})
    on conflict (event_key) do nothing
  `.catch(() => undefined);
}

export async function syncCentre(sql: Sql, daycareId: string): Promise<StoredLead[]> {
  await sql`
    insert into centre_lead_settings (daycare_id, enabled_at)
    values (${daycareId}, now())
    on conflict (daycare_id) do nothing
  `;
  const existingRows = await sql<Record<string, unknown>>`
    select * from centre_leads where daycare_id = ${daycareId}
  `;
  const existing = existingRows.map(toStored);
  const byParent = new Map(existing.filter((lead) => lead.parentUserId).map((lead) => [lead.parentUserId as string, lead]));
  const facts = factsFromSources(await loadBundle(sql, daycareId));
  const now = new Date().toISOString();
  const seen = new Set<string>();
  for (const fact of facts) {
    const prior = byParent.get(fact.parentUserId) ?? null;
    const result = applyLeadUpdate({
      existing: prior,
      fact,
      now,
      id: prior?.id ?? nid("cl"),
      daycareId,
    });
    if (result.error || !result.lead.id) continue;
    await saveLead(sql, result.lead);
    if (result.event) await recordEvent(sql, result.lead, result.event, null);
    seen.add(result.lead.id);
  }
  for (const lead of existing) {
    if (!seen.has(lead.id)) seen.add(lead.id);
  }
  const rows = await sql<Record<string, unknown>>`
    select * from centre_leads where daycare_id = ${daycareId} order by updated_at desc limit 500
  `;
  return rows.map(toStored);
}

async function recordAlerts(sql: Sql, daycareId: string, leads: readonly StoredLead[]) {
  const settings = await sql<{ stale_days: number; enabled_at: string }>`
    select stale_days, enabled_at from centre_lead_settings where daycare_id = ${daycareId} limit 1
  `;
  const zoneRows = await sql<{ timezone: string | null }>`
    select timezone from daycares where id = ${daycareId} limit 1
  `.catch(() => []);
  const prior = await sql<{ dedupe_key: string }>`
    select dedupe_key from centre_lead_alerts where daycare_id = ${daycareId}
  `.catch(() => []);
  const plans = planCentreLeadAlerts({
    now: new Date(),
    enabledAt: settings[0] ? iso(settings[0].enabled_at) : null,
    staleDays: Number(settings[0]?.stale_days || 3),
    timeZone: zoneRows[0]?.timezone || null,
    emailWanted: false,
    pushWanted: false,
    caslEmail: false,
    live: false,
    leads: leads.map((lead) => ({
      id: lead.id,
      stage: lead.stage,
      startedAt: lead.startedAt,
      lastActivityAt: lead.lastActivityAt,
      tourAt: lead.tourAt,
      offerExpiresAt: lead.offerExpiresAt,
    })),
    already: new Set(prior.map((row) => row.dedupe_key)),
  });
  const staff = await sql<{ user_id: string }>`
    select user_id from centre_members where daycare_id = ${daycareId} and status = 'active'
    union
    select user_id from provider_daycares where daycare_id = ${daycareId}
  `.catch(() => []);
  const { saveParentInAppNotice } = await import("@/lib/server/parent-notice");
  for (const plan of plans) {
    if (leadAlertMaySend(plan)) continue;
    await sql`
      insert into centre_lead_alerts (id, daycare_id, lead_id, kind, dedupe_key, outbound)
      values (${nid("la")}, ${daycareId}, ${plan.leadId}, ${plan.kind}, ${plan.key}, ${"held"})
      on conflict (dedupe_key) do nothing
    `;
    for (const person of staff) {
      await saveParentInAppNotice(sql, {
        userId: person.user_id,
        kind: "lead",
        titleKey: "notifLeadNew",
        href: `/provider/leads?daycareId=${encodeURIComponent(daycareId)}`,
        sourceKey: `${plan.key}:${person.user_id}`.slice(0, 180),
        status: plan.kind,
      }).catch(() => undefined);
    }
  }
}

function viewLead(lead: StoredLead, noteText: string) {
  return {
    id: lead.id,
    stage: lead.stage,
    stageLocked: lead.stageLocked,
    lostReason: lead.lostReason,
    source: lead.source,
    ageGroup: lead.ageGroup,
    desiredStart: lead.desiredStart,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    childLabel: lead.childLabel,
    assignedTo: lead.assignedUserId,
    lastActivityAt: lead.lastActivityAt,
    tourAt: lead.tourAt,
    offerExpiresAt: lead.offerExpiresAt,
    autoStage: lead.autoStage,
    autoRule: lead.autoRule,
    noteText,
  };
}

async function pageFor(userId: string, daycareId: string) {
  if (!centreLeadTrackerEnabled()) return { enabled: false as const };
  const sql = await getSql();
  const accessible = (await listAccessibleDaycareIds(sql, userId)).filter((id) => !isHiddenLeadCentre(id));
  const centres = accessible.length
    ? await sql.query<{ id: string; name: string }>(
        `select id, name from daycares where id = any($1::text[]) order by name`,
        [accessible],
      ).catch(() => [])
    : [];
  if (isHiddenLeadCentre(daycareId)) return { enabled: true as const, hidden: true as const };
  const resolved = resolveLeadCentre(daycareId, accessible);
  if (!resolved.ok) {
    return {
      enabled: true as const,
      needsCentre: true as const,
      denied: resolved.reason === "not_a_member",
      centres: centres.map((row) => ({ id: row.id, name: row.name })),
    };
  }
  const role = await loadCentreRole(sql, userId, resolved.centreId);
  const access = centreLeadAccess({
    centreRole: role,
    daycareId: resolved.centreId,
    accessibleIds: accessible,
    action: "read",
  });
  if (!access.ok) return { enabled: true as const, denied: true as const, needsCentre: false as const, centres: [] };
  const leads = await syncCentre(sql, resolved.centreId);
  await recordAlerts(sql, resolved.centreId, leads);
  const notes = await sql<{ lead_id: string; id: string; body: string; created_at: string }>`
    select lead_id, id, body, created_at from centre_lead_notes
    where daycare_id = ${resolved.centreId}
    order by created_at desc limit 400
  `.catch(() => []);
  const events = await sql<{
    lead_id: string;
    from_stage: string | null;
    to_stage: string;
    rule_id: string;
    lost_reason: string | null;
    actor_user_id: string | null;
    created_at: string;
  }>`
    select lead_id, from_stage, to_stage, rule_id, lost_reason, actor_user_id, created_at
    from centre_lead_events where daycare_id = ${resolved.centreId}
    order by created_at desc limit 400
  `.catch(() => []);
  const noteByLead = new Map<string, string>();
  for (const note of notes) {
    if (!noteByLead.has(note.lead_id)) noteByLead.set(note.lead_id, note.body);
  }
  const staff = await sql<{ user_id: string; name: string | null }>`
    select u.id as user_id, u.name
    from (
      select user_id from centre_members where daycare_id = ${resolved.centreId} and status = 'active'
      union
      select user_id from provider_daycares where daycare_id = ${resolved.centreId}
    ) m
    join "user" u on u.id = m.user_id
  `.catch(() => []);
  const settings = await sql<{ stale_days: number }>`
    select stale_days from centre_lead_settings where daycare_id = ${resolved.centreId} limit 1
  `;
  const name = centres.find((row) => row.id === resolved.centreId)?.name || "";
  const report = centreLeadFunnel(
    leads.map((lead) => ({ stage: lead.stage, lostReason: lead.lostReason, reached: lead.reached })),
    events.flatMap((event) => {
      if (!isCentreLeadStage(event.to_stage)) return [];
      const fromRaw = String(event.from_stage || "");
      const fromStage = isCentreLeadStage(fromRaw) ? fromRaw : null;
      return [{ leadId: event.lead_id, fromStage, toStage: event.to_stage, at: iso(event.created_at) }];
    }),
  );
  const keysOn = centreApiEnabled();
  const canKeys = centreLeadAccess({
    centreRole: role,
    daycareId: resolved.centreId,
    accessibleIds: accessible,
    action: "keys",
  }).ok;
  const keys = keysOn && canKeys
    ? await sql<{ id: string; name: string; prefix: string; scopes: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>`
        select id, name, prefix, scopes, created_at, last_used_at, revoked_at
        from centre_api_keys where daycare_id = ${resolved.centreId}
        order by created_at desc limit 20
      `.catch(() => [])
    : [];
  const hooks = keysOn && canKeys
    ? await sql<{ url: string; enabled: boolean }>`
        select url, enabled from centre_webhooks where daycare_id = ${resolved.centreId} limit 1
      `.catch(() => [])
    : [];
  return {
    enabled: true as const,
    hidden: false as const,
    needsCentre: false as const,
    denied: false as const,
    daycareId: resolved.centreId,
    daycareName: name,
    canWrite: centreLeadAccess({
      centreRole: role,
      daycareId: resolved.centreId,
      accessibleIds: accessible,
      action: "write",
    }).ok,
    canKeys: keysOn && canKeys,
    apiOn: keysOn,
    staleDays: Number(settings[0]?.stale_days || 3),
    centres: centres.map((row) => ({ id: row.id, name: row.name })),
    staff: staff.map((row) => ({ id: row.user_id, name: row.name || "Staff" })),
    leads: leads.map((lead) => viewLead(lead, noteByLead.get(lead.id) || "")),
    notes: notes.map((note) => ({
      id: note.id,
      leadId: note.lead_id,
      body: note.body,
      createdAt: iso(note.created_at),
    })),
    history: events.map((event) => ({
      leadId: event.lead_id,
      fromStage: event.from_stage,
      toStage: event.to_stage,
      ruleId: event.rule_id,
      lostReason: event.lost_reason,
      automatic: event.rule_id !== "manual",
      at: iso(event.created_at),
    })),
    report,
    keys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: parseScopes(key.scopes),
      createdAt: iso(key.created_at),
      lastUsedAt: key.last_used_at ? iso(key.last_used_at) : null,
      revokedAt: key.revoked_at ? iso(key.revoked_at) : null,
    })),
    webhook: hooks[0] ? { url: hooks[0].url, enabled: Boolean(hooks[0].enabled) } : null,
  };
}

async function requireWrite(userId: string, daycareId: string) {
  const sql = await getSql();
  const accessible = (await listAccessibleDaycareIds(sql, userId)).filter((id) => !isHiddenLeadCentre(id));
  const resolved = resolveLeadCentre(daycareId, accessible);
  if (!resolved.ok || isHiddenLeadCentre(daycareId)) return null;
  const role = await loadCentreRole(sql, userId, resolved.centreId);
  const access = centreLeadAccess({
    centreRole: role,
    daycareId: resolved.centreId,
    accessibleIds: accessible,
    action: "write",
  });
  if (!access.ok) return null;
  return { sql, daycareId: resolved.centreId };
}

export const centreLeadPage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => pageFor(context.userId, data.daycareId));

export const setCentreLeadStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; leadId?: string; stage?: string; lostReason?: string; unlock?: boolean }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    leadId: String(input?.leadId || "").trim(),
    stage: String(input?.stage || "").trim(),
    lostReason: String(input?.lostReason || "").trim(),
    unlock: input?.unlock === true,
  }))
  .handler(async ({ context, data }) => {
    if (!centreLeadTrackerEnabled()) return { ok: false as const, error: "off" };
    const gate = await requireWrite(context.userId, data.daycareId);
    if (!gate) return { ok: false as const, error: "not_found" };
    const rows = await gate.sql<Record<string, unknown>>`
      select * from centre_leads where id = ${data.leadId} and daycare_id = ${gate.daycareId} limit 1
    `;
    const existing = rows[0] ? toStored(rows[0]) : null;
    if (!existing) return { ok: false as const, error: "not_found" };
    const result = applyLeadUpdate({
      existing,
      fact: null,
      manual: data.unlock ? { stage: existing.stage, unlock: true } : { stage: data.stage as StoredLead["stage"], lostReason: data.lostReason },
      now: new Date().toISOString(),
      id: existing.id,
      daycareId: gate.daycareId,
    });
    if (result.error) return { ok: false as const, error: result.error };
    await saveLead(gate.sql, result.lead);
    if (result.event) await recordEvent(gate.sql, result.lead, result.event, context.userId);
    return { ok: true as const };
  });

export const addCentreLeadNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; leadId?: string; body?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    leadId: String(input?.leadId || "").trim(),
    body: String(input?.body || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!centreLeadTrackerEnabled()) return { ok: false as const, error: "off" };
    const body = cleanNote(data.body);
    const gate = await requireWrite(context.userId, data.daycareId);
    if (!gate || !body) return { ok: false as const, error: "not_found" };
    const rows = await gate.sql<{ id: string }>`
      select id from centre_leads where id = ${data.leadId} and daycare_id = ${gate.daycareId} limit 1
    `;
    if (!rows[0]) return { ok: false as const, error: "not_found" };
    await gate.sql`
      insert into centre_lead_notes (id, lead_id, daycare_id, author_user_id, body)
      values (${nid("ln")}, ${data.leadId}, ${gate.daycareId}, ${context.userId}, ${body})
    `;
    await gate.sql`
      update centre_leads set last_activity_at = now(), updated_at = now()
      where id = ${data.leadId} and daycare_id = ${gate.daycareId}
    `;
    return { ok: true as const };
  });

export const assignCentreLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; leadId?: string; staffUserId?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    leadId: String(input?.leadId || "").trim(),
    staffUserId: String(input?.staffUserId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!centreLeadTrackerEnabled()) return { ok: false as const, error: "off" };
    const gate = await requireWrite(context.userId, data.daycareId);
    if (!gate) return { ok: false as const, error: "not_found" };
    const rows = await gate.sql<Record<string, unknown>>`
      select * from centre_leads where id = ${data.leadId} and daycare_id = ${gate.daycareId} limit 1
    `;
    if (!rows[0]) return { ok: false as const, error: "not_found" };
    const members = await gate.sql<{ user_id: string }>`
      select user_id from centre_members where daycare_id = ${gate.daycareId} and status = 'active'
      union
      select user_id from provider_daycares where daycare_id = ${gate.daycareId}
    `;
    const result = assignLead(toStored(rows[0]), data.staffUserId, members.map((row) => row.user_id));
    if (result.error) return { ok: false as const, error: result.error };
    await saveLead(gate.sql, result.lead);
    return { ok: true as const };
  });

export const addCentreLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; contactName?: string; contactEmail?: string; contactPhone?: string; childLabel?: string; ageGroup?: string; desiredStart?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    contactName: String(input?.contactName || ""),
    contactEmail: String(input?.contactEmail || ""),
    contactPhone: String(input?.contactPhone || ""),
    childLabel: String(input?.childLabel || ""),
    ageGroup: String(input?.ageGroup || ""),
    desiredStart: String(input?.desiredStart || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!centreLeadTrackerEnabled()) return { ok: false as const, error: "off" };
    const gate = await requireWrite(context.userId, data.daycareId);
    if (!gate) return { ok: false as const, error: "not_found" };
    const saved = await insertManualLead(gate.sql, gate.daycareId, data, "manual");
    return saved ? { ok: true as const, id: saved.lead.id } : { ok: false as const, error: "name_or_email" };
  });

async function insertManualLead(
  sql: Sql,
  daycareId: string,
  data: {
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    childLabel: string;
    ageGroup: string;
    desiredStart: string;
  },
  source: "manual" | "website",
): Promise<{ lead: StoredLead; reused: boolean } | null> {
  const contactName = cleanContact(data.contactName);
  const contactEmail = cleanContact(data.contactEmail, 180);
  if (!contactName && !contactEmail) return null;
  if (contactEmail) {
    const existing = await sql<Record<string, unknown>>`
      select * from centre_leads
      where daycare_id = ${daycareId} and parent_user_id is null and lower(contact_email) = ${contactEmail.toLowerCase()}
      limit 1
    `;
    if (existing[0]) return { lead: toStored(existing[0]), reused: true };
  }
  const now = new Date().toISOString();
  const fact: LeadFact = {
    parentUserId: "",
    contactName,
    contactEmail,
    contactPhone: cleanContact(data.contactPhone, 40),
    childLabel: cleanContact(data.childLabel, 80),
    ageGroup: cleanAgeGroup(data.ageGroup),
    desiredStart: cleanStartMonth(data.desiredStart),
    signals: { inquiry: true, tours: [], bookings: [], waitlist: [], offers: [], agreementStatus: null },
    startedAt: now,
    activityAt: now,
    tourAt: null,
    offerExpiresAt: null,
    sourceHint: source,
  };
  const result = applyLeadUpdate({
    existing: null,
    fact,
    now,
    id: nid("cl"),
    daycareId,
  });
  if (result.error) return null;
  const lead = { ...result.lead, parentUserId: null };
  await saveLead(sql, lead);
  if (result.event) await recordEvent(sql, lead, result.event, null);
  return { lead, reused: false };
}

export const saveCentreLeadSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; staleDays?: number }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    staleDays: Number(input?.staleDays),
  }))
  .handler(async ({ context, data }) => {
    if (!centreLeadTrackerEnabled()) return { ok: false as const, error: "off" };
    const gate = await requireWrite(context.userId, data.daycareId);
    if (!gate) return { ok: false as const, error: "not_found" };
    const days = Number.isFinite(data.staleDays) ? Math.min(30, Math.max(1, Math.floor(data.staleDays))) : 3;
    await gate.sql`
      insert into centre_lead_settings (daycare_id, stale_days, enabled_at)
      values (${gate.daycareId}, ${days}, now())
      on conflict (daycare_id) do update set stale_days = excluded.stale_days
    `;
    return { ok: true as const, staleDays: days };
  });

export const createCentreApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; name?: string; write?: boolean }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    name: String(input?.name || "").trim().slice(0, 80),
    write: input?.write !== false,
  }))
  .handler(async ({ context, data }) => {
    if (!centreLeadTrackerEnabled() || !centreApiEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const accessible = (await listAccessibleDaycareIds(sql, context.userId)).filter((id) => !isHiddenLeadCentre(id));
    const resolved = resolveLeadCentre(data.daycareId, accessible);
    if (!resolved.ok) return { ok: false as const, error: "not_found" };
    const role = await loadCentreRole(sql, context.userId, resolved.centreId);
    const access = centreLeadAccess({
      centreRole: role,
      daycareId: resolved.centreId,
      accessibleIds: accessible,
      action: "keys",
    });
    if (!access.ok) return { ok: false as const, error: "not_found" };
    const minted = mintCentreApiKey();
    const scopes = data.write ? "read,write" : "read";
    await sql`
      insert into centre_api_keys (id, daycare_id, name, prefix, key_hash, scopes, created_by)
      values (${nid("ck")}, ${resolved.centreId}, ${data.name || "Centre key"}, ${minted.prefix}, ${minted.hash}, ${scopes}, ${context.userId})
    `;
    await sql`
      insert into centre_api_audit (id, daycare_id, key_id, action, status)
      values (${nid("au")}, ${resolved.centreId}, ${null}, ${"key_created"}, ${201})
    `;
    return { ok: true as const, token: minted.token, prefix: minted.prefix };
  });

export const revokeCentreApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; keyId?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    keyId: String(input?.keyId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!centreApiEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const accessible = (await listAccessibleDaycareIds(sql, context.userId)).filter((id) => !isHiddenLeadCentre(id));
    const resolved = resolveLeadCentre(data.daycareId, accessible);
    if (!resolved.ok) return { ok: false as const, error: "not_found" };
    const role = await loadCentreRole(sql, context.userId, resolved.centreId);
    if (!centreLeadAccess({ centreRole: role, daycareId: resolved.centreId, accessibleIds: accessible, action: "keys" }).ok) {
      return { ok: false as const, error: "not_found" };
    }
    const rows = await sql`
      update centre_api_keys set revoked_at = now()
      where id = ${data.keyId} and daycare_id = ${resolved.centreId} and revoked_at is null
      returning id
    `;
    if (!rows[0]) return { ok: false as const, error: "not_found" };
    return { ok: true as const };
  });

export const saveCentreWebhook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; url?: string; enabled?: boolean }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    url: String(input?.url || "").trim(),
    enabled: input?.enabled === true,
  }))
  .handler(async ({ context, data }) => {
    if (!centreApiEnabled()) return { ok: false as const, error: "off" };
    if (!webhookUrlAllowed(data.url)) return { ok: false as const, error: "url" };
    const sql = await getSql();
    const accessible = (await listAccessibleDaycareIds(sql, context.userId)).filter((id) => !isHiddenLeadCentre(id));
    const resolved = resolveLeadCentre(data.daycareId, accessible);
    if (!resolved.ok) return { ok: false as const, error: "not_found" };
    const role = await loadCentreRole(sql, context.userId, resolved.centreId);
    if (!centreLeadAccess({ centreRole: role, daycareId: resolved.centreId, accessibleIds: accessible, action: "keys" }).ok) {
      return { ok: false as const, error: "not_found" };
    }
    const secret = mintCentreApiKey().token;
    const existing = await sql<{ secret: string }>`
      select secret from centre_webhooks where daycare_id = ${resolved.centreId} limit 1
    `;
    const nextSecret = existing[0]?.secret || secret;
    await sql`
      insert into centre_webhooks (daycare_id, url, secret, enabled, created_by)
      values (${resolved.centreId}, ${data.url}, ${nextSecret}, ${data.enabled}, ${context.userId})
      on conflict (daycare_id) do update set url = excluded.url, enabled = excluded.enabled
    `;
    return { ok: true as const, secret: existing[0] ? null : nextSecret, enabled: data.enabled };
  });

export function centreApiStore(sql: Sql): CentreApiStore {
  return {
    async findKey(hash) {
      const rows = await sql<{ id: string; daycare_id: string; scopes: string; revoked_at: string | null; key_hash: string }>`
        select id, daycare_id, scopes, revoked_at, key_hash from centre_api_keys where key_hash = ${hash} limit 1
      `;
      const row = rows[0];
      if (!row || isHiddenLeadCentre(row.daycare_id)) return null;
      return {
        id: row.id,
        daycareId: row.daycare_id,
        scopes: parseScopes(row.scopes),
        revoked: Boolean(row.revoked_at),
        hash: row.key_hash,
      };
    },
    async countHits(keyId, windowStart) {
      const rows = await sql<{ hits: number }>`
        select hits from centre_api_hits where key_id = ${keyId} and window_start = ${windowStart} limit 1
      `;
      return Number(rows[0]?.hits || 0);
    },
    async addHit(keyId, windowStart) {
      await sql`
        insert into centre_api_hits (key_id, window_start, hits)
        values (${keyId}, ${windowStart}, ${1})
        on conflict (key_id, window_start) do update set hits = centre_api_hits.hits + 1
      `;
    },
    async touchKey(keyId, at) {
      await sql`update centre_api_keys set last_used_at = ${at} where id = ${keyId}`;
    },
    async audit(input) {
      await sql`
        insert into centre_api_audit (id, daycare_id, key_id, action, status)
        values (${nid("au")}, ${input.daycareId}, ${input.keyId}, ${input.action}, ${input.status})
      `;
    },
    async listLeads(daycareId) {
      const rows = await sql<Record<string, unknown>>`
        select * from centre_leads where daycare_id = ${daycareId} order by updated_at desc limit 200
      `;
      return rows.map(publicRow);
    },
    async getLead(daycareId, id) {
      const rows = await sql<Record<string, unknown>>`
        select * from centre_leads where daycare_id = ${daycareId} and id = ${id} limit 1
      `;
      if (!rows[0]) return null;
      const notes = await sql<{ id: string; body: string; created_at: string }>`
        select id, body, created_at from centre_lead_notes
        where lead_id = ${id} and daycare_id = ${daycareId}
        order by created_at desc limit 20
      `;
      return {
        ...publicRow(rows[0]),
        notes: notes.map((note) => ({ id: note.id, body: note.body, createdAt: iso(note.created_at) })),
      };
    },
    async updateStage(input) {
      const rows = await sql<Record<string, unknown>>`
        select * from centre_leads where id = ${input.id} and daycare_id = ${input.daycareId} limit 1
      `;
      if (!rows[0]) return null;
      const result = applyLeadUpdate({
        existing: toStored(rows[0]),
        fact: null,
        manual: { stage: input.stage as StoredLead["stage"], lostReason: input.lostReason },
        now: new Date().toISOString(),
        id: input.id,
        daycareId: input.daycareId,
      });
      if (result.error) return null;
      await saveLead(sql, result.lead);
      if (result.event) await recordEvent(sql, result.lead, result.event, null);
      return publicRowFromStored(result.lead);
    },
    async addNote(input) {
      const rows = await sql<{ id: string }>`
        select id from centre_leads where id = ${input.id} and daycare_id = ${input.daycareId} limit 1
      `;
      if (!rows[0]) return null;
      await sql`
        insert into centre_lead_notes (id, lead_id, daycare_id, body)
        values (${nid("ln")}, ${input.id}, ${input.daycareId}, ${input.body})
      `;
      await sql`
        update centre_leads set last_activity_at = now(), updated_at = now()
        where id = ${input.id}
      `;
      return this.getLead(input.daycareId, input.id);
    },
    async createLead(input) {
      const saved = await insertManualLead(sql, input.daycareId, {
        contactName: input.contactName || "",
        contactEmail: input.contactEmail || "",
        contactPhone: input.contactPhone || "",
        childLabel: input.childLabel || "",
        ageGroup: input.ageGroup || "",
        desiredStart: input.desiredStart || "",
      }, "website");
      if (!saved) return null;
      return { lead: publicRowFromStored(saved.lead), reused: saved.reused };
    },
  };
}

function publicRow(row: Record<string, unknown>): Record<string, unknown> {
  const lead = toStored(row);
  return publicRowFromStored(lead);
}

function publicRowFromStored(lead: StoredLead): Record<string, unknown> {
  return {
    id: lead.id,
    stage: lead.stage,
    stageLocked: lead.stageLocked,
    lostReason: lead.lostReason,
    source: lead.source,
    ageGroup: lead.ageGroup,
    desiredStart: lead.desiredStart,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    childLabel: lead.childLabel,
    assignedTo: lead.assignedUserId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastActivityAt: lead.lastActivityAt,
  };
}

export async function runCentreLeadJobs(fetchImpl: typeof fetch = fetch) {
  if (!centreLeadTrackerEnabled()) return { ok: true as const, skipped: true as const, reason: "flag" };
  const sql = await getSql();
  const centres = await sql<{ daycare_id: string }>`
    select daycare_id from centre_lead_settings order by enabled_at desc limit 20
  `.catch(() => []);
  let synced = 0;
  for (const centre of centres) {
    if (isHiddenLeadCentre(centre.daycare_id)) continue;
    const leads = await syncCentre(sql, centre.daycare_id);
    await recordAlerts(sql, centre.daycare_id, leads);
    synced += 1;
  }
  const sent = centreApiEnabled() ? await deliverDueWebhooks(sql, fetchImpl) : 0;
  return { ok: true as const, skipped: false as const, synced, sent };
}

async function deliverDueWebhooks(sql: Sql, fetchImpl: typeof fetch) {
  const due = await sql<{ id: string; daycare_id: string; lead_id: string; attempt: number }>`
    select id, daycare_id, lead_id, attempt from centre_webhook_deliveries
    where status = 'pending' and (next_at is null or next_at <= now())
    order by created_at asc limit 10
  `.catch(() => []);
  let sent = 0;
  for (const row of due) {
    if (isHiddenLeadCentre(row.daycare_id)) continue;
    const hooks = await sql<{ url: string; secret: string; enabled: boolean }>`
      select url, secret, enabled from centre_webhooks where daycare_id = ${row.daycare_id} limit 1
    `;
    const hook = hooks[0];
    if (!hook?.enabled || !webhookUrlAllowed(hook.url)) {
      await sql`update centre_webhook_deliveries set status = ${"skipped"} where id = ${row.id}`;
      continue;
    }
    const leads = await sql<Record<string, unknown>>`
      select * from centre_leads where id = ${row.lead_id} and daycare_id = ${row.daycare_id} limit 1
    `;
    if (!leads[0]) continue;
    const body = JSON.stringify({
      event: "lead.stage_changed",
      lead: publicRow(leads[0]),
      privacy: "This is information the family shared with your centre. Child health details are not included.",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { webhookHeader } = await import("@/lib/centre-api");
    try {
      const response = await fetchImpl(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-kidease-signature": webhookHeader(hook.secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        await sql`update centre_webhook_deliveries set status = ${"sent"}, attempt = ${row.attempt + 1} where id = ${row.id}`;
        sent += 1;
        continue;
      }
    } catch {
      /* retry below */
    }
    const next = webhookNextAttempt(row.attempt + 1, new Date());
    if (!next) {
      await sql`update centre_webhook_deliveries set status = ${"failed"}, attempt = ${row.attempt + 1} where id = ${row.id}`;
    } else {
      await sql`
        update centre_webhook_deliveries
        set attempt = ${row.attempt + 1}, next_at = ${next.toISOString()}
        where id = ${row.id}
      `;
    }
  }
  return sent;
}
