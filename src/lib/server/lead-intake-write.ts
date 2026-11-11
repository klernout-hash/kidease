/**
 * Writes one centre lead per family. Later actions update that row and its timeline.
 * This file does not send mail, text, push, or webhooks, and it does not call an outside CRM.
 */
import { entryForLeadKind, mergeLeadIntake, planLeadIntake, type LeadEntryPoint, type LeadIntakeInput } from "../lead-intake.ts";
import type { LeadSource } from "../centre-leads.ts";
import { nid } from "../utils.ts";

type Sql = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

export type LeadWriteInput = LeadIntakeInput & {
  eventId?: string | null;
};

export type LeadWriteResult =
  | { ok: true; id: string; created: boolean; stage: string; source: string; entry: LeadEntryPoint }
  | { ok: false; reason: string };

type LeadRow = {
  id: string;
  stage: string;
  source: string;
  started_at: string | Date;
  stage_locked: boolean | null;
  child_label: string | null;
  age_group: string | null;
  desired_start: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  reached_inquiry: boolean | null;
  reached_tour: boolean | null;
  reached_toured: boolean | null;
  reached_applied: boolean | null;
  reached_enrolled: boolean | null;
};

function iso(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function fill(current: string | null | undefined, next: string | null): string | null {
  return next || current || null;
}

function reached(stage: string, prior: LeadRow | null) {
  return {
    inquiry: Boolean(prior?.reached_inquiry) || stage !== "lost",
    tour: Boolean(prior?.reached_tour) || stage === "tour_booked" || stage === "toured",
    toured: Boolean(prior?.reached_toured) || stage === "toured",
    applied: Boolean(prior?.reached_applied) || stage === "applied" || stage === "offered" || stage === "enrolled",
    enrolled: Boolean(prior?.reached_enrolled) || stage === "enrolled",
  };
}

async function findLead(sql: Sql, daycareId: string, parentUserId: string | null, email: string | null): Promise<LeadRow | null> {
  if (parentUserId) {
    const rows = await sql<LeadRow>`
      select id, stage, source, started_at, stage_locked, child_label, age_group, desired_start,
             contact_name, contact_email, contact_phone,
             reached_inquiry, reached_tour, reached_toured, reached_applied, reached_enrolled
      from centre_leads
      where daycare_id = ${daycareId} and parent_user_id = ${parentUserId}
      limit 1
    `;
    return rows[0] ?? null;
  }
  if (!email) return null;
  const rows = await sql<LeadRow>`
    select id, stage, source, started_at, stage_locked, child_label, age_group, desired_start,
           contact_name, contact_email, contact_phone,
           reached_inquiry, reached_tour, reached_toured, reached_applied, reached_enrolled
    from centre_leads
    where daycare_id = ${daycareId}
      and parent_user_id is null
      and lower(contact_email) = ${email}
    limit 1
  `;
  return rows[0] ?? null;
}

async function writeExtras(
  sql: Sql,
  id: string,
  input: { schedule: string | null; roomWanted: string | null; childId: string | null; entry: string },
) {
  await sql`
    update centre_leads
    set schedule = coalesce(${input.schedule}, schedule),
        room_wanted = coalesce(${input.roomWanted}, room_wanted),
        child_id = coalesce(${input.childId}, child_id),
        intake_entry = coalesce(intake_entry, ${input.entry})
    where id = ${id}
  `.catch(() => undefined);
}

export async function createOrUpdateLead(sql: Sql, input: LeadWriteInput): Promise<LeadWriteResult> {
  const plan = planLeadIntake(input);
  if (!plan.wired) return { ok: false, reason: plan.reason };
  const now = new Date().toISOString();
  const existing = await findLead(sql, plan.daycareId, plan.parentUserId, plan.email);
  const merged = mergeLeadIntake(
    existing
      ? {
          stage: existing.stage,
          source: existing.source,
          startedAt: iso(existing.started_at),
          stageLocked: Boolean(existing.stage_locked),
        }
      : null,
    plan,
    now,
  );
  const flags = reached(merged.stage, existing);
  const name = fill(existing?.contact_name, plan.name);
  const email = fill(existing?.contact_email, plan.email);
  const phone = fill(existing?.contact_phone, plan.phone);
  const childLabel = fill(existing?.child_label, plan.childLabel);
  const ageGroup = fill(existing?.age_group, plan.ageGroup);
  const desiredStart = fill(existing?.desired_start, plan.desiredStart);
  const id = existing?.id || nid("cl");

  if (!existing) {
    await sql`
      insert into centre_leads (
        id, daycare_id, parent_user_id, contact_name, contact_email, contact_phone, child_label,
        age_group, desired_start, source, stage, auto_stage, auto_rule, stage_locked,
        reached_inquiry, reached_tour, reached_toured, reached_applied, reached_enrolled,
        started_at, last_activity_at, created_at, updated_at
      ) values (
        ${id}, ${plan.daycareId}, ${plan.parentUserId}, ${name}, ${email}, ${phone}, ${childLabel},
        ${ageGroup}, ${desiredStart}, ${merged.source}, ${merged.stage}, ${merged.stage}, ${`intake:${plan.entry}`}, false,
        ${flags.inquiry}, ${flags.tour}, ${flags.toured}, ${flags.applied}, ${flags.enrolled},
        ${merged.startedAt}, ${now}, ${merged.startedAt}, ${now}
      )
    `;
  } else {
    await sql`
      update centre_leads set
        contact_name = ${name},
        contact_email = ${email},
        contact_phone = ${phone},
        child_label = ${childLabel},
        age_group = ${ageGroup},
        desired_start = ${desiredStart},
        source = ${merged.source},
        stage = ${merged.stage},
        auto_stage = ${merged.stage},
        auto_rule = ${`intake:${plan.entry}`},
        reached_inquiry = ${flags.inquiry},
        reached_tour = ${flags.tour},
        reached_toured = ${flags.toured},
        reached_applied = ${flags.applied},
        reached_enrolled = ${flags.enrolled},
        started_at = ${merged.startedAt},
        last_activity_at = ${now},
        updated_at = ${now}
      where id = ${id}
    `;
  }

  await writeExtras(sql, id, plan);
  const eventId = cleanEventId(input.eventId) || nid("le");
  await sql`
    insert into centre_lead_events (
      id, lead_id, daycare_id, from_stage, to_stage, rule_id, actor_user_id, created_at
    ) values (
      ${eventId}, ${id}, ${plan.daycareId}, ${existing?.stage ?? null}, ${merged.stage},
      ${`intake:${plan.entry}`}, ${null}, ${plan.firstTouchAt || now}
    )
    on conflict (id) do nothing
  `;

  return { ok: true, id, created: merged.created, stage: merged.stage, source: merged.source, entry: plan.entry };
}

function cleanEventId(value: string | null | undefined): string | null {
  const text = String(value || "").trim().slice(0, 120);
  return text || null;
}

export async function rememberCentreLead(sql: Sql, input: LeadWriteInput): Promise<LeadWriteResult> {
  try {
    return await createOrUpdateLead(sql, input);
  } catch {
    return { ok: false, reason: "save_failed" };
  }
}

type CentreKind = "real" | "qa";

type BackfillCounts = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  byCentreType: Record<CentreKind, { created: number; updated: number }>;
  byEntry: Record<string, number>;
};

function emptyCounts(): BackfillCounts {
  return {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    byCentreType: { real: { created: 0, updated: 0 }, qa: { created: 0, updated: 0 } },
    byEntry: {},
  };
}

type Fact = LeadWriteInput & { at: string };

async function loadCentres(sql: Sql): Promise<Map<string, CentreKind>> {
  const rows = await sql<{ id: string; is_test: number | null; is_demo: number | null; visibility: string | null }>`
    select id, is_test, is_demo, visibility from daycares
  `;
  const map = new Map<string, CentreKind>();
  for (const row of rows) {
    const qa = Number(row.is_test) === 1 || Number(row.is_demo) === 1 || row.visibility === "admin_only";
    map.set(row.id, qa ? "qa" : "real");
  }
  return map;
}

function stamp(value: string | Date | null | undefined): string {
  return iso(value) || new Date(0).toISOString();
}

/** Data only. Does not notify families or centres. Safe to run again. */
export async function backfillCentrePipeline(sql: Sql): Promise<BackfillCounts> {
  const counts = emptyCounts();
  const centres = await loadCentres(sql);
  const facts: Fact[] = [];

  const requests = await sql<{
    id: string;
    kind: string;
    user_id: string;
    daycare_id: string;
    contact_email: string | null;
    parent_first_name: string | null;
    parent_last_name: string | null;
    parent_phone: string | null;
    created_at: string | Date;
  }>`
    select id, kind, user_id, daycare_id, contact_email, parent_first_name, parent_last_name, parent_phone, created_at
    from lead_requests
  `.catch(() => []);
  for (const row of requests) {
    facts.push({
      entry: row.kind === "info" ? "listing_inquiry" : entryForLeadKind(row.kind),
      daycareId: row.daycare_id,
      parentUserId: row.user_id,
      email: row.contact_email,
      name: [row.parent_first_name, row.parent_last_name].filter(Boolean).join(" "),
      phone: row.parent_phone,
      firstTouchAt: stamp(row.created_at),
      at: stamp(row.created_at),
      eventId: `bf-lr-${row.id}`,
    });
  }

  const tours = await sql<{
    id: string;
    user_id: string;
    daycare_id: string;
    child_id: string | null;
    child_name: string | null;
    status: string;
    created_at: string | Date;
  }>`
    select id, user_id, daycare_id, child_id, child_name, status, created_at from tour_requests
  `.catch(() => []);
  for (const row of tours) {
    const done = row.status === "completed" || row.status === "attended";
    facts.push({
      entry: done ? "tour_completed" : "tour_request",
      daycareId: row.daycare_id,
      parentUserId: row.user_id,
      childId: row.child_id,
      childLabel: row.child_name,
      firstTouchAt: stamp(row.created_at),
      at: stamp(row.created_at),
      eventId: `bf-tr-${row.id}`,
    });
  }

  const waitlist = await sql<{
    id: string;
    user_id: string;
    daycare_id: string;
    age_group: string | null;
    child_label: string | null;
    status: string;
    joined_at: string | Date;
  }>`
    select id, user_id, daycare_id, age_group, child_label, status, joined_at from daycare_waitlist
  `.catch(() => []);
  for (const row of waitlist) {
    const entry: LeadEntryPoint =
      row.status === "enrolled" ? "booking_accepted" : row.status === "offered" ? "spot_offer" : "waitlist_join";
    facts.push({
      entry,
      daycareId: row.daycare_id,
      parentUserId: row.user_id,
      ageGroup: row.age_group,
      childLabel: row.child_label,
      firstTouchAt: stamp(row.joined_at),
      at: stamp(row.joined_at),
      eventId: `bf-wl-${row.id}`,
    });
  }

  const interests = await sql<{
    id: string;
    user_id: string;
    daycare_id: string;
    age_band: string | null;
    created_at: string | Date;
  }>`
    select id, user_id, daycare_id, age_band, created_at from waitlist_interests
  `.catch(() => []);
  for (const row of interests) {
    facts.push({
      entry: "waitlist_join",
      daycareId: row.daycare_id,
      parentUserId: row.user_id,
      ageGroup: row.age_band,
      firstTouchAt: stamp(row.created_at),
      at: stamp(row.created_at),
      eventId: `bf-wi-${row.id}`,
    });
  }

  const bookings = await sql<{
    id: string;
    user_id: string;
    daycare_id: string;
    child_id: string | null;
    start_month: string | null;
    schedule: string | null;
    age_group: string | null;
    status: string;
    created_at: string | Date;
  }>`
    select id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, created_at
    from bookings
  `.catch(() => []);
  for (const row of bookings) {
    const accepted = row.status === "accepted" || row.status === "enrolled";
    const waiting = row.status === "waitlist";
    facts.push({
      entry: accepted ? "booking_accepted" : waiting ? "waitlist_join" : "application",
      daycareId: row.daycare_id,
      parentUserId: row.user_id,
      childId: row.child_id,
      ageGroup: row.age_group,
      desiredStart: row.start_month,
      schedule: row.schedule,
      firstTouchAt: stamp(row.created_at),
      at: stamp(row.created_at),
      eventId: `bf-bk-${row.id}`,
    });
  }

  facts.sort((a, b) => a.at.localeCompare(b.at));
  counts.scanned = facts.length;
  for (const fact of facts) {
    const result = await createOrUpdateLead(sql, fact).catch(() => ({ ok: false as const, reason: "save_failed" }));
    if (!result.ok) {
      counts.skipped += 1;
      continue;
    }
    const kind = centres.get(String(fact.daycareId || "")) || "real";
    if (result.created) {
      counts.created += 1;
      counts.byCentreType[kind].created += 1;
    } else {
      counts.updated += 1;
      counts.byCentreType[kind].updated += 1;
    }
    counts.byEntry[fact.entry] = (counts.byEntry[fact.entry] || 0) + 1;
  }
  return counts;
}

export type { LeadSource };
