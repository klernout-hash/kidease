/**
 * Fan saved-listing, licence, document, still-looking, and attention alerts
 * through dispatchCustomerAlert. Quiet hours, prefs, and CASL unsubscribe
 * stay in that path. Billing is never sent from here.
 */

import { getSql, type Sql } from "@/lib/db";
import {
  alertWeekKey,
  claimNeedsDocument,
  documentExpiryDue,
  licenceStatusWorthTelling,
  listingWatchChanged,
  savedListingDedupe,
  scheduleWatchKey,
  stillLookingDue,
  winnipegDayKey,
  type ListingWatchFacts,
} from "@/lib/alert-rules";

const ENSURE_SQL = [
  "alter table daycares add column if not exists first_aid_expiry date",
  "alter table reviews add column if not exists owner_reply text",
  "alter table reviews add column if not exists owner_reply_at timestamptz",
  `create table if not exists parent_search_checkins (
    user_id text primary key,
    looking int not null default 1,
    confirmed_at timestamptz,
    nudged_at timestamptz,
    updated_at timestamptz not null default now()
  )`,
];

let ensured = false;

async function ensure(sql: Sql) {
  if (ensured) return;
  try {
    for (const statement of ENSURE_SQL) await sql.query(statement);
    ensured = true;
  } catch {
    /* retry next call */
  }
}

type Centre = { id: string; name: string; slug: string | null };

async function centreOf(sql: Sql, daycareId: string): Promise<Centre | null> {
  const rows = await sql<Centre>`
    select id, name, slug from daycares where id = ${daycareId} limit 1
  `.catch(() => [] as Centre[]);
  return rows[0] ?? null;
}

async function savedParents(sql: Sql, daycareId: string): Promise<string[]> {
  const rows = await sql<{ user_id: string }>`
    select user_id from saved_daycares where daycare_id = ${daycareId} limit 80
  `.catch(() => [] as { user_id: string }[]);
  return rows.map((row) => row.user_id).filter((id) => id && !id.startsWith("guest:"));
}

async function owners(sql: Sql, daycareId: string): Promise<string[]> {
  const { listCentreOwnerEmails } = await import("@/lib/server/thread-access");
  const people = await listCentreOwnerEmails(sql, daycareId).catch(() => []);
  return people.map((person) => person.userId || "").filter((id) => id && !id.startsWith("guest:"));
}

export async function readListingWatch(sql: Sql, daycareId: string): Promise<ListingWatchFacts | null> {
  const rows = await sql<{
    infant_monthly: number | null;
    toddler_monthly: number | null;
    preschool_monthly: number | null;
    part_time_monthly: number | null;
    age_min_months: number | null;
    age_max_months: number | null;
    hours: string | null;
    schedule_options: unknown;
  }>`
    select infant_monthly, toddler_monthly, preschool_monthly, part_time_monthly,
           age_min_months, age_max_months, hours, schedule_options
    from daycares where id = ${daycareId} limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row) return null;
  return {
    infantMonthly: Number(row.infant_monthly) || 0,
    toddlerMonthly: Number(row.toddler_monthly) || 0,
    preschoolMonthly: Number(row.preschool_monthly) || 0,
    partTimeMonthly: Number(row.part_time_monthly) || 0,
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    hours: String(row.hours || ""),
    scheduleKey: scheduleWatchKey(row.schedule_options),
  };
}

export async function notifySavedListingChange(input: {
  daycareId: string;
  before: ListingWatchFacts | null;
  after: ListingWatchFacts;
  now?: Date;
}): Promise<number> {
  if (!input.before || !listingWatchChanged(input.before, input.after)) return 0;
  const sql = await getSql();
  const centre = await centreOf(sql, input.daycareId);
  if (!centre) return 0;
  const parents = await savedParents(sql, centre.id);
  if (!parents.length) return 0;
  const now = input.now ?? new Date();
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  const href = centre.slug ? `/daycare/${centre.slug}` : "/search";
  const dedupeKey = savedListingDedupe(centre.id, input.after, winnipegDayKey(now));
  let sent = 0;
  for (const userId of parents) {
    const result = await dispatchCustomerAlert({
      userId,
      category: "saved_listing",
      vars: { name: centre.name },
      href,
      dedupeKey,
      emailFallback: true,
      now,
    }).catch(() => null);
    if (result && result.status !== "skipped") sent += 1;
  }
  return sent;
}

export async function notifyLicenceWatchers(input: {
  daycareId: string;
  before: string | null;
  after: string | null;
  now?: Date;
}): Promise<number> {
  if (!licenceStatusWorthTelling(input.before, input.after)) return 0;
  const sql = await getSql();
  const centre = await centreOf(sql, input.daycareId);
  if (!centre) return 0;
  const parents = await savedParents(sql, centre.id);
  const now = input.now ?? new Date();
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  const href = centre.slug ? `/daycare/${centre.slug}` : "/search";
  const status = String(input.after || "").slice(0, 40);
  let sent = 0;
  for (const userId of parents) {
    const result = await dispatchCustomerAlert({
      userId,
      category: "licence_status",
      vars: { name: centre.name, status },
      href,
      dedupeKey: `licence:${centre.id}:${status}:${alertWeekKey(now)}`.slice(0, 180),
      emailFallback: true,
      now,
    }).catch(() => null);
    if (result && result.status !== "skipped") sent += 1;
  }
  return sent;
}

export async function notifyListingAttention(input: {
  daycareId: string;
  sourceId: string;
  kind: "photo" | "review";
  now?: Date;
}): Promise<number> {
  const sql = await getSql();
  const centre = await centreOf(sql, input.daycareId);
  if (!centre) return 0;
  const people = await owners(sql, centre.id);
  const now = input.now ?? new Date();
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  let sent = 0;
  for (const userId of people) {
    const result = await dispatchCustomerAlert({
      userId,
      category: "listing_attention",
      vars: { name: centre.name, status: input.kind },
      href: "/provider",
      dedupeKey: `attention:${input.kind}:${input.sourceId}:${userId}`.slice(0, 180),
      emailFallback: true,
      now,
    }).catch(() => null);
    if (result && result.status !== "skipped") sent += 1;
  }
  return sent;
}

export async function notifyReviewReply(input: {
  userId: string;
  daycareName: string;
  slug: string | null;
  reviewId: string;
  now?: Date;
}): Promise<void> {
  const userId = String(input.userId || "").trim();
  if (!userId || userId.startsWith("guest:")) return;
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  await dispatchCustomerAlert({
    userId,
    category: "review_reply",
    vars: { name: input.daycareName },
    href: input.slug ? `/daycare/${input.slug}#listing-reviews` : "/notifications",
    dedupeKey: `review-reply:${input.reviewId}`.slice(0, 180),
    emailFallback: true,
    now: input.now,
  }).catch(() => undefined);
}

export async function notifyClaimNeedsDocument(input: {
  userId: string;
  daycareId: string;
  daycareName: string;
  now?: Date;
  /** False when the operator letter already went out, so the owner is not emailed twice. */
  emailFallback?: boolean;
}): Promise<void> {
  if (!input.userId) return;
  const now = input.now ?? new Date();
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  await dispatchCustomerAlert({
    userId: input.userId,
    category: "claim",
    vars: { name: input.daycareName, status: "needs_docs" },
    href: "/provider",
    dedupeKey: `claim-docs:${input.daycareId}:${input.userId}:${winnipegDayKey(now)}`.slice(0, 180),
    emailFallback: input.emailFallback !== false,
    now,
  }).catch(() => undefined);
}

export { claimNeedsDocument };

type WatchRow = {
  user_id: string;
  looking: number | boolean | null;
  confirmed_at: string | Date | null;
  nudged_at: string | Date | null;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function runStillLookingJob(now = new Date()): Promise<{ nudged: number }> {
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<WatchRow>`
    select u.user_id, c.looking, c.confirmed_at, c.nudged_at
    from (
      select user_id from saved_searches where alerts_enabled = 1
      union
      select user_id from saved_daycares
    ) u
    left join parent_search_checkins c on c.user_id = u.user_id
    limit 40
  `.catch(() => [] as WatchRow[]);
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  let nudged = 0;
  for (const row of rows) {
    if (!row.user_id || row.user_id.startsWith("guest:")) continue;
    const looking = row.looking == null ? null : !(row.looking === 0 || row.looking === false);
    if (
      !stillLookingDue({
        hasWatch: true,
        looking,
        confirmedAt: asDate(row.confirmed_at),
        nudgedAt: asDate(row.nudged_at),
        now,
      })
    ) {
      continue;
    }
    const result = await dispatchCustomerAlert({
      userId: row.user_id,
      category: "still_looking",
      href: "/account?section=alerts&desk=parent",
      dedupeKey: `still-looking:${row.user_id}:${alertWeekKey(now)}`,
      emailFallback: true,
      now,
    }).catch(() => null);
    if (!result || result.reason === "error") continue;
    nudged += 1;
    await sql`
      insert into parent_search_checkins (user_id, looking, nudged_at, updated_at)
      values (${row.user_id}, ${looking === false ? 0 : 1}, ${now}, now())
      on conflict (user_id) do update
        set nudged_at = excluded.nudged_at, updated_at = now()
    `.catch(() => undefined);
  }
  return { nudged };
}

type ExpiryCentre = {
  id: string;
  name: string;
  license_expiry: string | null;
  first_aid_expiry: string | null;
};

export async function runDocumentExpiryJob(now = new Date()): Promise<{ notified: number }> {
  const sql = await getSql();
  await ensure(sql);
  const centres = await sql<ExpiryCentre>`
    select id, name, license_expiry::text as license_expiry, first_aid_expiry::text as first_aid_expiry
    from daycares
    where license_expiry is not null or first_aid_expiry is not null
    limit 40
  `.catch(() => [] as ExpiryCentre[]);
  const docs = await sql<{
    daycare_id: string;
    name: string;
    id: string;
    expires_on: string | null;
  }>`
    select d.id as daycare_id, d.name, doc.id, doc.expires_on::text as expires_on
    from provider_screening_documents doc
    join daycares d on d.id = doc.daycare_id
    where doc.expires_on is not null
      and doc.status not in ('rejected')
    limit 40
  `.catch(() => []);
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  const week = alertWeekKey(now);
  let notified = 0;
  const tasks: Array<{ daycareId: string; name: string; kind: string; source: string }> = [];
  for (const centre of centres) {
    if (centre.license_expiry && documentExpiryDue(centre.license_expiry, now)) {
      tasks.push({ daycareId: centre.id, name: centre.name, kind: "licence", source: centre.id });
    }
    if (centre.first_aid_expiry && documentExpiryDue(centre.first_aid_expiry, now)) {
      tasks.push({ daycareId: centre.id, name: centre.name, kind: "first_aid", source: centre.id });
    }
  }
  for (const doc of docs) {
    if (doc.expires_on && documentExpiryDue(doc.expires_on, now)) {
      tasks.push({ daycareId: doc.daycare_id, name: doc.name, kind: "screening", source: doc.id });
    }
  }
  for (const task of tasks.slice(0, 40)) {
    const people = await owners(sql, task.daycareId);
    for (const userId of people) {
      const result = await dispatchCustomerAlert({
        userId,
        category: "document_expiry",
        vars: { name: task.name, status: task.kind },
        href: "/provider",
        dedupeKey: `doc:${task.kind}:${task.source}:${userId}:${week}`.slice(0, 180),
        emailFallback: true,
        now,
      }).catch(() => null);
      if (result && result.status !== "skipped") notified += 1;
    }
  }
  return { notified };
}

export async function runCustomerAlertMaintenance(now = new Date()): Promise<{ nudged: number; notified: number }> {
  const still = await runStillLookingJob(now).catch(() => ({ nudged: 0 }));
  const docs = await runDocumentExpiryJob(now).catch(() => ({ notified: 0 }));
  return { nudged: still.nudged, notified: docs.notified };
}

export async function confirmStillLooking(userId: string, looking: boolean, now = new Date()): Promise<void> {
  const sql = await getSql();
  await ensure(sql);
  const flag = looking ? 1 : 0;
  await sql`
    insert into parent_search_checkins (user_id, looking, confirmed_at, updated_at)
    values (${userId}, ${flag}, ${now}, now())
    on conflict (user_id) do update
      set looking = excluded.looking, confirmed_at = excluded.confirmed_at, updated_at = now()
  `;
}
