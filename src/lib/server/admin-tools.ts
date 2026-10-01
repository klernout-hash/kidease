/**
 * Admin queues for the five tools. Each one checks its flag first.
 * Approving a listing change is the only write to a daycare, and only after a person asks.
 */

import { createServerFn } from "@tanstack/react-start";
import { AI_FLAGS, type AiFlag } from "@/lib/ai/flags";
import {
  PROTECTED_LISTING_ID,
  applyApprovedTruthChange,
  diffListingAgainstWebsite,
  parseAgeRangeMonths,
  readLicenceText,
  safeWebsiteUrl,
  scoreSpam,
  triageSupport,
  truthTargets,
  websitePlainText,
  type ListingFacts,
  type SpamKind,
  type TruthChange,
  type TruthField,
} from "@/lib/admin-tools";
import { aiFeatureOn } from "@/lib/server/ai-feature";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireAdmin } from "@/lib/server/roles";
import { nid } from "@/lib/utils";

const ADMIN_DISTINCT_ID = "kidease-admin";

export type TruthQueueRow = {
  id: string;
  daycareId: string;
  name: string;
  field: TruthField;
  current: string;
  proposed: string;
};

export type SpamQueueRow = {
  id: string;
  kind: SpamKind;
  score: number;
  reasons: string;
  excerpt: string;
  email: string | null;
};

export type TriageRow = {
  id: string;
  caseId: string | null;
  tag: string;
  draft: string;
};

export type LicenceReadRow = {
  id: string;
  centreName: string;
  licenceNumber: string | null;
  holderName: string | null;
  expiry: string | null;
};

async function adminFlagOn(flag: AiFlag): Promise<boolean> {
  try {
    return await aiFeatureOn(flag, ADMIN_DISTINCT_ID);
  } catch {
    return false;
  }
}

async function ensureTables(sql: Sql) {
  await sql`
    create table if not exists admin_truth_queue (
      id text primary key,
      daycare_id text not null,
      field text not null,
      current_value text not null default '',
      proposed_value text not null,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      decided_at timestamptz,
      decided_by text
    )
  `;
  await sql`
    create table if not exists admin_licence_reads (
      id text primary key,
      upload_id text,
      daycare_id text,
      centre_name text not null default '',
      licence_number text,
      holder_name text,
      expiry text,
      confirmed int not null default 0,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists admin_spam_queue (
      id text primary key,
      kind text not null,
      score int not null,
      reasons text not null default '',
      excerpt text not null default '',
      email text,
      source_id text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists admin_support_drafts (
      id text primary key,
      case_id text,
      tag text not null,
      draft text not null,
      sent int not null default 0,
      created_at timestamptz not null default now()
    )
  `;
}

export async function listTruthQueue(): Promise<{ on: boolean; rows: TruthQueueRow[] }> {
  const on = await adminFlagOn(AI_FLAGS.truthChecker);
  if (!on) return { on: false, rows: [] };
  try {
    const sql = await getSql();
    await ensureTables(sql);
    const rows = await sql<{
      id: string;
      daycare_id: string;
      name: string | null;
      field: TruthField;
      current_value: string;
      proposed_value: string;
    }>`
      select q.id, q.daycare_id, d.name, q.field, q.current_value, q.proposed_value
      from admin_truth_queue q
      left join daycares d on d.id = q.daycare_id
      where q.status = 'pending'
      order by q.created_at asc
      limit 100
    `;
    return {
      on: true,
      rows: rows.map((row) => ({
        id: row.id,
        daycareId: row.daycare_id,
        name: row.name || row.daycare_id,
        field: row.field,
        current: row.current_value,
        proposed: row.proposed_value,
      })),
    };
  } catch (err) {
    console.error("[kidease-admin] truth queue skipped", err instanceof Error ? err.message : "failed");
    return { on: true, rows: [] };
  }
}

export async function listSpamQueue(): Promise<{ on: boolean; rows: SpamQueueRow[] }> {
  const on = await adminFlagOn(AI_FLAGS.spamFilter);
  if (!on) return { on: false, rows: [] };
  try {
    const sql = await getSql();
    await ensureTables(sql);
    const rows = await sql<{
      id: string;
      kind: SpamKind;
      score: number;
      reasons: string;
      excerpt: string;
      email: string | null;
    }>`
      select id, kind, score, reasons, excerpt, email
      from admin_spam_queue
      order by created_at desc
      limit 100
    `;
    return { on: true, rows: rows.map((row) => ({ ...row, kind: row.kind, email: row.email })) };
  } catch (err) {
    console.error("[kidease-admin] spam queue skipped", err instanceof Error ? err.message : "failed");
    return { on: true, rows: [] };
  }
}

export async function listSupportDrafts(): Promise<{ on: boolean; rows: TriageRow[] }> {
  const on = await adminFlagOn(AI_FLAGS.supportTriage);
  if (!on) return { on: false, rows: [] };
  try {
    const sql = await getSql();
    await ensureTables(sql);
    const rows = await sql<{ id: string; case_id: string | null; tag: string; draft: string }>`
      select id, case_id, tag, draft
      from admin_support_drafts
      where sent = 0
      order by created_at desc
      limit 100
    `;
    return {
      on: true,
      rows: rows.map((row) => ({ id: row.id, caseId: row.case_id, tag: row.tag, draft: row.draft })),
    };
  } catch (err) {
    console.error("[kidease-admin] triage queue skipped", err instanceof Error ? err.message : "failed");
    return { on: true, rows: [] };
  }
}

export const listLicenceReads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ on: boolean; rows: LicenceReadRow[] }> => {
    await requireAdmin(context.userId);
    const on = await adminFlagOn(AI_FLAGS.licenceReader);
    if (!on) return { on: false, rows: [] };
    try {
      const sql = await getSql();
      await ensureTables(sql);
      const rows = await sql<{
        id: string;
        centre_name: string;
        licence_number: string | null;
        holder_name: string | null;
        expiry: string | null;
      }>`
        select id, centre_name, licence_number, holder_name, expiry
        from admin_licence_reads
        where confirmed = 0
        order by created_at desc
        limit 50
      `;
      return {
        on: true,
        rows: rows.map((row) => ({
          id: row.id,
          centreName: row.centre_name,
          licenceNumber: row.licence_number,
          holderName: row.holder_name,
          expiry: row.expiry,
        })),
      };
    } catch (err) {
      console.error("[kidease-admin] licence reads skipped", err instanceof Error ? err.message : "failed");
      return { on: true, rows: [] };
    }
  });

async function insertTruthChange(sql: Sql, daycareId: string, change: TruthChange) {
  if (daycareId === PROTECTED_LISTING_ID) return false;
  const existing = await sql<{ id: string }>`
    select id from admin_truth_queue
    where daycare_id = ${daycareId} and field = ${change.field} and status = 'pending'
    limit 1
  `;
  if (existing[0]) return false;
  await sql`
    insert into admin_truth_queue (id, daycare_id, field, current_value, proposed_value, status)
    values (${nid("trq")}, ${daycareId}, ${change.field}, ${change.current}, ${change.proposed}, 'pending')
  `;
  return true;
}

type TruthListing = ListingFacts & { id: string; website?: string | null; agesConfirmed?: boolean | number | null };

export async function runTruthCheckerJob(options: {
  flagOn?: boolean;
  listings?: TruthListing[];
  fetchText?: (url: string) => Promise<string | null>;
} = {}) {
  const on = options.flagOn ?? (await adminFlagOn(AI_FLAGS.truthChecker));
  if (!on) return { ok: true as const, skipped: "flag-off" as const, queued: 0 };
  const listings = truthTargets(options.listings ?? (await loadWebsiteListings()));
  const fetchText = options.fetchText ?? fetchWebsiteText;
  let queued = 0;
  const sql = await getSql();
  await ensureTables(sql);
  for (const listing of listings) {
    const url = safeWebsiteUrl(listing.website);
    if (!url) continue;
    const text = await fetchText(url);
    if (!text) continue;
    const changes = diffListingAgainstWebsite(listing, text);
    for (const change of changes) {
      if (await insertTruthChange(sql, listing.id, change)) queued += 1;
    }
  }
  return { ok: true as const, skipped: null, queued };
}

async function loadWebsiteListings(): Promise<TruthListing[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    phone: string | null;
    hours: string | null;
    address: string | null;
    website: string | null;
    age_min_months: number | null;
    age_max_months: number | null;
    ages_confirmed: number | null;
  }>`
    select id, phone, hours, address, website, age_min_months, age_max_months, ages_confirmed
    from daycares
    where website is not null and btrim(website) <> ''
      and id <> ${PROTECTED_LISTING_ID}
    limit 80
  `;
  return rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    hours: row.hours,
    address: row.address,
    website: row.website,
    agesConfirmed: Number(row.ages_confirmed) === 1,
    ageLabel:
      row.age_max_months && row.age_max_months > 0
        ? `${row.age_min_months ?? 0} months to ${row.age_max_months} months`
        : "",
  }));
}

async function fetchWebsiteText(url: string): Promise<string | null> {
  const safe = safeWebsiteUrl(url);
  if (!safe) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(safe, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    const html = await res.text();
    return websitePlainText(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const approveTruthChange = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => String(id || "").trim())
  .handler(async ({ context, data: id }) => {
    await requireAdmin(context.userId);
    if (!(await adminFlagOn(AI_FLAGS.truthChecker))) return { ok: false as const, error: "off" as const };
    const sql = await getSql();
    await ensureTables(sql);
    const rows = await sql<{
      id: string;
      daycare_id: string;
      field: TruthField;
      current_value: string;
      proposed_value: string;
    }>`
      select id, daycare_id, field, current_value, proposed_value
      from admin_truth_queue
      where id = ${id} and status = 'pending'
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "missing" as const };
    if (row.daycare_id === PROTECTED_LISTING_ID) return { ok: false as const, error: "protected" as const };
    const change: TruthChange = { field: row.field, current: row.current_value, proposed: row.proposed_value };
    const listing = { id: row.daycare_id };
    const next = applyApprovedTruthChange(listing, change, true);
    if (next === listing) return { ok: false as const, error: "refused" as const };
    if (row.field === "phone") {
      await sql`update daycares set phone = ${change.proposed} where id = ${row.daycare_id} and id <> ${PROTECTED_LISTING_ID}`;
    } else if (row.field === "hours") {
      await sql`update daycares set hours = ${change.proposed} where id = ${row.daycare_id} and id <> ${PROTECTED_LISTING_ID}`;
    } else if (row.field === "address") {
      await sql`update daycares set address = ${change.proposed} where id = ${row.daycare_id} and id <> ${PROTECTED_LISTING_ID}`;
    } else if (row.field === "ages") {
      const confirmed = await sql<{ ages_confirmed: number | null }>`
        select ages_confirmed from daycares where id = ${row.daycare_id} limit 1
      `;
      if (Number(confirmed[0]?.ages_confirmed) === 1) return { ok: false as const, error: "ages-confirmed" as const };
      const range = parseAgeRangeMonths(change.proposed);
      if (!range) return { ok: false as const, error: "ages-unreadable" as const };
      await sql`
        update daycares
        set age_min_months = ${range.min}, age_max_months = ${range.max}
        where id = ${row.daycare_id} and id <> ${PROTECTED_LISTING_ID} and coalesce(ages_confirmed, 0) = 0
      `;
    }
    await sql`
      update admin_truth_queue
      set status = 'approved', decided_at = now(), decided_by = ${context.userId}
      where id = ${row.id} and status = 'pending'
    `;
    return { ok: true as const };
  });

export async function maybeReadLicence(input: { uploadId?: string | null; daycareId?: string | null; centreName?: string | null; text: string }) {
  try {
    if (!(await adminFlagOn(AI_FLAGS.licenceReader))) return;
    const suggestion = readLicenceText(input.text);
    if (!suggestion.licenceNumber && !suggestion.holderName && !suggestion.expiry) return;
    if (suggestion.confirmed !== false) return;
    const sql = await getSql();
    await ensureTables(sql);
    await sql`
      insert into admin_licence_reads (
        id, upload_id, daycare_id, centre_name, licence_number, holder_name, expiry, confirmed
      ) values (
        ${nid("licr")},
        ${input.uploadId || null},
        ${input.daycareId || null},
        ${(input.centreName || "").slice(0, 160)},
        ${suggestion.licenceNumber},
        ${suggestion.holderName},
        ${suggestion.expiry},
        0
      )
    `;
  } catch (err) {
    console.error("[kidease-admin] licence read skipped", err instanceof Error ? err.message : "failed");
  }
}

export const confirmLicenceRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => String(id || "").trim())
  .handler(async ({ context, data: id }) => {
    await requireAdmin(context.userId);
    if (!(await adminFlagOn(AI_FLAGS.licenceReader))) return { ok: false as const, error: "off" as const };
    const sql = await getSql();
    await ensureTables(sql);
    const rows = await sql<{
      id: string;
      daycare_id: string | null;
      licence_number: string | null;
    }>`
      select id, daycare_id, licence_number
      from admin_licence_reads
      where id = ${id} and confirmed = 0
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "missing" as const };
    if (row.daycare_id && row.daycare_id !== PROTECTED_LISTING_ID && row.licence_number) {
      await sql`
        update daycares
        set license_number = ${row.licence_number}
        where id = ${row.daycare_id}
          and id <> ${PROTECTED_LISTING_ID}
          and (license_number is null or btrim(license_number) = '')
      `;
    }
    await sql`update admin_licence_reads set confirmed = 1 where id = ${row.id}`;
    return { ok: true as const, approved: false as const };
  });

export async function maybeQueueSpam(input: { kind: SpamKind; text: string; email?: string | null; sourceId?: string | null }) {
  try {
    if (!(await adminFlagOn(AI_FLAGS.spamFilter))) return;
    const scored = scoreSpam(input);
    if (!scored.high) return;
    const sql = await getSql();
    await ensureTables(sql);
    await sql`
      insert into admin_spam_queue (id, kind, score, reasons, excerpt, email, source_id)
      values (
        ${nid("spq")},
        ${scored.kind},
        ${scored.score},
        ${scored.reasons.join(", ").slice(0, 200)},
        ${(input.text || "").replace(/\s+/g, " ").trim().slice(0, 240)},
        ${(input.email || "").slice(0, 200) || null},
        ${input.sourceId || null}
      )
    `;
  } catch (err) {
    console.error("[kidease-admin] spam score skipped", err instanceof Error ? err.message : "failed");
  }
}

export async function maybeQueueSignup(userId: string, extra?: { name?: string | null; email?: string | null; company?: string | null; phone?: string | null }) {
  try {
    if (!(await adminFlagOn(AI_FLAGS.spamFilter))) return;
    let email = extra?.email || "";
    let name = extra?.name || "";
    if (!email) {
      const sql = await getSql();
      const rows = await sql.query<{ email: string | null; name: string | null }>(
        `select email, name from "user" where id = $1 limit 1`,
        [userId],
      ).catch(() => [] as Array<{ email: string | null; name: string | null }>);
      email = rows[0]?.email || "";
      name = name || rows[0]?.name || "";
    }
    await maybeQueueSpam({
      kind: "signup",
      text: [name, extra?.company, extra?.phone].filter(Boolean).join(" "),
      email,
      sourceId: userId,
    });
  } catch (err) {
    console.error("[kidease-admin] signup score skipped", err instanceof Error ? err.message : "failed");
  }
}

export async function maybeDraftSupport(input: { caseId?: string | null; message: string }) {
  try {
    if (!(await adminFlagOn(AI_FLAGS.supportTriage))) return;
    const triage = triageSupport(input.message);
    if (triage.send !== false) return;
    const sql = await getSql();
    await ensureTables(sql);
    await sql`
      insert into admin_support_drafts (id, case_id, tag, draft, sent)
      values (${nid("sd")}, ${input.caseId || null}, ${triage.tag}, ${triage.draft}, 0)
    `;
  } catch (err) {
    console.error("[kidease-admin] triage skipped", err instanceof Error ? err.message : "failed");
  }
}
