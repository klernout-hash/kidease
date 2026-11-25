/**
 * Staff job board server functions. FEATURE_STAFF_JOB_BOARD defaults off.
 *
 * Privacy: every provider-facing profile goes through providerProfileView().
 * A centre gets the full profile only after the person applied there, accepted
 * that centre's invite, or works there. Nothing here sends email or text.
 * The match score is the plain function in src/lib/staff-jobs.ts.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { staffJobBoardEnabled } from "@/lib/features";
import { geocode, haversineKm } from "@/lib/geo";
import { PROVINCES } from "@/lib/gov/places";
import { listAccessibleDaycareIds, loadCentreRole } from "@/lib/server/centre-access";
import {
  APPLICATION_STAGES,
  JOB_ABOUT_MAX,
  JOB_STEPS,
  JOB_TITLE_MAX,
  PROFILE_STEPS,
  STAFF_HIGHLIGHTS_MAX,
  canSetStage,
  cleanDate,
  cleanName,
  cleanPostalCode,
  cleanRadius,
  cleanText,
  cleanYears,
  findCertLevel,
  hasFullAccess,
  joinList,
  jobStepErrors,
  mayReadStaffResume,
  payCents,
  pickCareGroups,
  pickDays,
  pickLanguages,
  pickShifts,
  pickStage,
  pickVettingState,
  pickVisibility,
  pickWorkType,
  pickWorkTypes,
  profileStepErrors,
  provinceCode,
  providerProfileView,
  scoreMatch,
  toJobMatchInput,
  toStaffMatchInput,
  todayIso,
  vettingChecklist,
  visibleToCentre,
  VETTING_ITEMS,
  type ApplicationStage,
  type BackgroundCheckFact,
  type CentreAccess,
  type FullStaffProfile,
  type JobDraft,
  type LimitedStaffProfile,
  type MatchResult,
  type ProfileDraft,
  type ProvinceCode,
  type StaffProfileRecord,
  type VettingItem,
  type VettingRow,
  type VettingState,
} from "@/lib/staff-jobs";
import { nid } from "@/lib/utils";

const OFF = { ok: false as const, reason: "off" as const };
const SUGGEST_POOL = 200;
const SUGGEST_SHOW = 12;
const INVITES_PER_DAY = 40;

export const staffJobBoardFlag = createServerFn({ method: "GET" }).handler(async () => staffJobBoardEnabled());

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

type ProfileRow = {
  user_id: string;
  ref: string;
  first_name: string;
  last_name: string;
  province: string;
  cert_level: string;
  cert_expires_on: string | null;
  first_aid_expires_on: string | null;
  years_experience: number;
  care_groups: string;
  days: string;
  shifts: string;
  work_types: string;
  start_date: string | null;
  city: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  radius_km: number;
  languages: string;
  highlights: string;
  phone: string;
  resume_ref: string | null;
  visibility: string;
  hide_from_employer: number;
  email: string | null;
};

const PROFILE_COLUMNS = `p.user_id, p.ref, p.first_name, p.last_name, p.province, p.cert_level,
  p.cert_expires_on::text as cert_expires_on, p.first_aid_expires_on::text as first_aid_expires_on,
  p.years_experience, p.care_groups, p.days, p.shifts, p.work_types, p.start_date::text as start_date,
  p.city, p.postal_code, p.lat, p.lng, p.radius_km, p.languages, p.highlights, p.phone, p.resume_ref,
  p.visibility, p.hide_from_employer, u.email`;

function toRecord(row: ProfileRow): StaffProfileRecord {
  return {
    ref: row.ref,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email || "",
    phone: row.phone || "",
    province: provinceCode(row.province),
    city: row.city,
    postalCode: row.postal_code,
    radiusKm: cleanRadius(row.radius_km),
    certLevel: row.cert_level,
    certExpiresOn: cleanDate(row.cert_expires_on),
    firstAidExpiresOn: cleanDate(row.first_aid_expires_on),
    yearsExperience: cleanYears(row.years_experience),
    careGroups: pickCareGroups(row.care_groups),
    days: pickDays(row.days),
    shifts: pickShifts(row.shifts),
    workTypes: pickWorkTypes(row.work_types),
    startDate: cleanDate(row.start_date),
    languages: pickLanguages(row.languages),
    highlights: row.highlights,
    hasResume: Boolean(row.resume_ref),
    visibility: pickVisibility(row.visibility),
    hideFromEmployer: Number(row.hide_from_employer) !== 0,
  };
}

function toDraft(record: StaffProfileRecord): ProfileDraft {
  return {
    firstName: record.firstName,
    lastName: record.lastName,
    province: record.province,
    certLevel: record.certLevel,
    certExpiresOn: record.certExpiresOn ?? "",
    firstAidExpiresOn: record.firstAidExpiresOn ?? "",
    yearsExperience: String(record.yearsExperience),
    careGroups: record.careGroups,
    days: record.days,
    shifts: record.shifts,
    workTypes: record.workTypes,
    startDate: record.startDate ?? "",
    city: record.city,
    postalCode: record.postalCode,
    radiusKm: record.radiusKm,
    languages: record.languages,
    highlights: record.highlights,
    phone: record.phone,
    visibility: record.visibility,
    hideFromEmployer: record.hideFromEmployer,
  };
}

async function loadProfileRow(sql: Sql, userId: string): Promise<ProfileRow | null> {
  const rows = await sql
    .query<ProfileRow>(
      `select ${PROFILE_COLUMNS} from staff_profiles p left join "user" u on u.id = p.user_id where p.user_id = $1 limit 1`,
      [userId],
    )
    .catch(() => []);
  return rows[0] ?? null;
}

type JobRow = {
  id: string;
  daycare_id: string;
  role: string;
  about: string;
  cert_needed: string;
  province: string;
  care_groups: string;
  days: string;
  shifts: string;
  work_type: string;
  start_date: string | null;
  pay_min_cents: number | null;
  pay_max_cents: number | null;
  status: string | null;
  created_at: string | Date;
  name: string;
  slug: string;
  city: string | null;
  d_province: string | null;
  lat: number | null;
  lng: number | null;
};

const JOB_COLUMNS = `j.id, j.daycare_id, j.role, j.about, j.cert_needed, j.province, j.care_groups, j.days, j.shifts,
  j.work_type, j.start_date::text as start_date, j.pay_min_cents, j.pay_max_cents, j.status, j.created_at,
  d.name, d.slug, d.city, d.province as d_province, d.lat, d.lng`;

export type StaffJob = {
  id: string;
  daycareId: string;
  title: string;
  about: string;
  certNeeded: string;
  province: ProvinceCode | "";
  careGroups: string[];
  days: string[];
  shifts: string[];
  workType: string;
  startDate: string | null;
  payMinCents: number | null;
  payMaxCents: number | null;
  open: boolean;
  centre: string;
  slug: string;
  city: string;
};

function provinceFromDaycare(raw: string | null | undefined): ProvinceCode | "" {
  const direct = provinceCode(raw);
  if (direct) return direct;
  const v = String(raw ?? "").trim().toUpperCase();
  const hit = PROVINCES.find((p) => p.nameEn.toUpperCase() === v || p.nameFr.toUpperCase() === v);
  return hit ? provinceCode(hit.code) : "";
}

function toJob(row: JobRow): StaffJob {
  return {
    id: row.id,
    daycareId: row.daycare_id,
    title: row.role,
    about: row.about,
    certNeeded: row.cert_needed,
    province: provinceCode(row.province) || provinceFromDaycare(row.d_province),
    careGroups: pickCareGroups(row.care_groups),
    days: pickDays(row.days),
    shifts: pickShifts(row.shifts),
    workType: pickWorkType(row.work_type),
    startDate: cleanDate(row.start_date),
    payMinCents: row.pay_min_cents === null ? null : Number(row.pay_min_cents),
    payMaxCents: row.pay_max_cents === null ? null : Number(row.pay_max_cents),
    open: (row.status || "open") === "open",
    centre: row.name,
    slug: row.slug,
    city: row.city || "",
  };
}

function distanceFor(profile: ProfileRow | null, job: JobRow): number | null {
  if (!profile || profile.lat === null || profile.lng === null || job.lat === null || job.lng === null) return null;
  const km = haversineKm({ lat: Number(profile.lat), lng: Number(profile.lng) }, { lat: Number(job.lat), lng: Number(job.lng) });
  return Number.isFinite(km) ? km : null;
}

function matchFor(profile: ProfileRow, job: JobRow, today: string): MatchResult {
  const record = toRecord(profile);
  return scoreMatch(
    toStaffMatchInput({ ...record, distanceKm: distanceFor(profile, job) }),
    toJobMatchInput({ ...toJob(job) }),
    today,
  );
}

async function openBoardJobs(sql: Sql, limit: number): Promise<JobRow[]> {
  return sql
    .query<JobRow>(
      `select ${JOB_COLUMNS}
       from centre_job_posts j
       join daycares d on d.id = j.daycare_id
       where coalesce(j.board, 0) = 1
         and coalesce(j.status, 'open') = 'open'
         and coalesce(d.visibility, 'public') = 'public'
         and coalesce(d.is_test, 0) = 0
         and coalesce(d.is_demo, 0) = 0
       order by j.created_at desc
       limit $1`,
      [limit],
    )
    .catch(() => []);
}

/** Centres where this user may hire: owner or manager only. */
async function hiringCentreIds(sql: Sql, userId: string): Promise<string[]> {
  const ids = await listAccessibleDaycareIds(sql, userId);
  const roles = await Promise.all(ids.map(async (id) => ({ id, role: await loadCentreRole(sql, userId, id) })));
  return roles.filter((row) => row.role === "owner" || row.role === "manager").map((row) => row.id);
}

async function centreAccess(sql: Sql, staffUserId: string, daycareId: string): Promise<CentreAccess & { member: boolean }> {
  const [apps, invites, members] = await Promise.all([
    sql<{ stage: string }>`
      select stage from job_applications where user_id = ${staffUserId} and daycare_id = ${daycareId}
    `.catch(() => [] as { stage: string }[]),
    sql<{ n: number }>`
      select count(*)::int as n from staff_job_invites
      where staff_user_id = ${staffUserId} and daycare_id = ${daycareId} and status = 'accepted'
    `.catch(() => [{ n: 0 }]),
    sql<{ n: number }>`
      select count(*)::int as n from centre_members
      where user_id = ${staffUserId} and daycare_id = ${daycareId} and status = 'active'
    `,
  ]);
  const member = (members[0]?.n ?? 0) > 0;
  return {
    applied: apps.length > 0,
    acceptedInvite: (invites[0]?.n ?? 0) > 0,
    hired: member || apps.some((row) => row.stage === "hired"),
    member,
  };
}

async function backgroundCheckFact(sql: Sql, daycareId: string, fullName: string): Promise<BackgroundCheckFact> {
  const name = fullName.trim().toLowerCase();
  if (!name) return { found: false, expiresOn: null };
  // background_check_records comes from the background-check guidance work. If the
  // table is not in this database, the checklist says "ask for a recent check".
  try {
    const rows = await sql<{ expires_on: string | null }>`
      select expires_on::text as expires_on from background_check_records
      where daycare_id = ${daycareId} and lower(btrim(person_name)) = ${name}
      order by expires_on desc nulls last
      limit 1
    `;
    return rows[0] ? { found: true, expiresOn: cleanDate(rows[0].expires_on) } : { found: false, expiresOn: null };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public browse (server-rendered on /jobs)
// ---------------------------------------------------------------------------

export const listOpenStaffJobs = createServerFn({ method: "GET" }).handler(async () => {
  if (!staffJobBoardEnabled()) return { enabled: false as const, jobs: [] as StaffJob[] };
  const sql = await getSql();
  const rows = await openBoardJobs(sql, 40);
  return { enabled: true as const, jobs: rows.map(toJob) };
});

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

export type StaffMatchRow = { job: StaffJob; match: MatchResult; applied: boolean };
export type StaffApplicationRow = { id: string; jobId: string; title: string; centre: string; stage: ApplicationStage };
export type StaffInviteRow = { id: string; jobId: string; title: string; centre: string; match: MatchResult | null };

export const getMyStaffBoard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!staffJobBoardEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const today = todayIso();
    const row = await loadProfileRow(sql, context.userId);
    const [jobs, apps, invites] = await Promise.all([
      openBoardJobs(sql, 100),
      sql
        .query<{ id: string; job_id: string; role: string; name: string; stage: string }>(
          `select a.id, a.job_id, j.role, d.name, a.stage
           from job_applications a
           join centre_job_posts j on j.id = a.job_id
           join daycares d on d.id = a.daycare_id
           where a.user_id = $1
           order by a.created_at desc
           limit 50`,
          [context.userId],
        )
        .catch(() => []),
      sql
        .query<JobRow & { invite_id: string }>(
          `select i.id as invite_id, ${JOB_COLUMNS}
           from staff_job_invites i
           join centre_job_posts j on j.id = i.job_id
           join daycares d on d.id = i.daycare_id
           where i.staff_user_id = $1 and i.status = 'sent' and coalesce(j.status, 'open') = 'open'
           order by i.created_at desc
           limit 20`,
          [context.userId],
        )
        .catch(() => []),
    ]);
    const appliedJobs = new Set(apps.map((a) => a.job_id));
    const matches: StaffMatchRow[] = row
      ? jobs
          .map((job) => ({ job: toJob(job), match: matchFor(row, job, today), applied: appliedJobs.has(job.id) }))
          .sort((a, b) => b.match.score - a.match.score)
          .slice(0, 30)
      : [];
    const record = row ? toRecord(row) : null;
    return {
      enabled: true as const,
      profile: record ? toDraft(record) : null,
      ref: record?.ref ?? null,
      hasResume: record?.hasResume ?? false,
      openJobs: jobs.length,
      matches,
      applications: apps.map(
        (a): StaffApplicationRow => ({ id: a.id, jobId: a.job_id, title: a.role, centre: a.name, stage: pickStage(a.stage) }),
      ),
      invites: invites.map(
        (job): StaffInviteRow => ({
          id: job.invite_id,
          jobId: job.id,
          title: job.role,
          centre: job.name,
          match: row ? matchFor(row, job, today) : null,
        }),
      ),
    };
  });

export const saveMyStaffProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ProfileDraft) => input)
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const draft: ProfileDraft = {
      firstName: cleanName(data.firstName),
      lastName: cleanName(data.lastName),
      province: provinceCode(data.province),
      certLevel: findCertLevel(data.certLevel) ? String(data.certLevel) : "",
      certExpiresOn: cleanDate(data.certExpiresOn) ?? "",
      firstAidExpiresOn: cleanDate(data.firstAidExpiresOn) ?? "",
      yearsExperience: String(cleanYears(data.yearsExperience)),
      careGroups: pickCareGroups(data.careGroups),
      days: pickDays(data.days),
      shifts: pickShifts(data.shifts),
      workTypes: pickWorkTypes(data.workTypes),
      startDate: cleanDate(data.startDate) ?? "",
      city: cleanText(data.city, 80),
      postalCode: cleanPostalCode(data.postalCode),
      radiusKm: cleanRadius(data.radiusKm),
      languages: pickLanguages(data.languages),
      highlights: cleanText(data.highlights, STAFF_HIGHLIGHTS_MAX),
      phone: cleanText(data.phone, 30),
      visibility: pickVisibility(data.visibility),
      hideFromEmployer: data.hideFromEmployer !== false,
    };
    const errors = PROFILE_STEPS.flatMap((step) => profileStepErrors(step, draft));
    if (String(data.postalCode || "").trim() && !draft.postalCode) errors.push("postal_code");
    if (errors.length) return { ok: false as const, reason: "invalid" as const, errors };
    // City centre only. The street is never stored or shown.
    const spot = geocode(draft.province ? `${draft.city}, ${draft.province}` : draft.city) ?? geocode(draft.city);
    const sql = await getSql();
    await sql`
      insert into staff_profiles (
        user_id, ref, first_name, last_name, province, cert_level, cert_expires_on, first_aid_expires_on,
        years_experience, care_groups, days, shifts, work_types, start_date, city, postal_code, lat, lng,
        radius_km, languages, highlights, phone, visibility, hide_from_employer, updated_at
      ) values (
        ${context.userId}, ${nid("sp")}, ${draft.firstName}, ${draft.lastName}, ${draft.province}, ${draft.certLevel},
        ${draft.certExpiresOn || null}, ${draft.firstAidExpiresOn || null}, ${Number(draft.yearsExperience)},
        ${joinList(draft.careGroups)}, ${joinList(draft.days)}, ${joinList(draft.shifts)}, ${joinList(draft.workTypes)},
        ${draft.startDate || null}, ${draft.city}, ${draft.postalCode}, ${spot?.lat ?? null}, ${spot?.lng ?? null},
        ${draft.radiusKm}, ${joinList(draft.languages)}, ${draft.highlights}, ${draft.phone}, ${draft.visibility},
        ${draft.hideFromEmployer ? 1 : 0}, now()
      )
      on conflict (user_id) do update set
        first_name = excluded.first_name, last_name = excluded.last_name, province = excluded.province,
        cert_level = excluded.cert_level, cert_expires_on = excluded.cert_expires_on,
        first_aid_expires_on = excluded.first_aid_expires_on, years_experience = excluded.years_experience,
        care_groups = excluded.care_groups, days = excluded.days, shifts = excluded.shifts,
        work_types = excluded.work_types, start_date = excluded.start_date, city = excluded.city,
        postal_code = excluded.postal_code, lat = excluded.lat, lng = excluded.lng, radius_km = excluded.radius_km,
        languages = excluded.languages, highlights = excluded.highlights, phone = excluded.phone,
        visibility = excluded.visibility, hide_from_employer = excluded.hide_from_employer, updated_at = now()
    `;
    return { ok: true as const };
  });

async function insertApplication(sql: Sql, userId: string, jobId: string, source: "apply" | "invite") {
  const jobs = await sql<{ id: string; daycare_id: string }>`
    select id, daycare_id from centre_job_posts
    where id = ${jobId} and coalesce(board, 0) = 1 and coalesce(status, 'open') = 'open'
    limit 1
  `;
  const job = jobs[0];
  if (!job) throw new Error("That job is closed.");
  const profile = await loadProfileRow(sql, userId);
  if (!profile) throw new Error("Make your profile first.");
  const email = (profile.email || "").trim();
  if (!email) throw new Error("Add an email on your account first.");
  const name = `${profile.first_name} ${profile.last_name}`.trim().slice(0, 120) || email;
  await sql`
    insert into job_applications (id, job_id, daycare_id, user_id, name, email, note, stage, stage_at, source)
    values (${nid("app")}, ${job.id}, ${job.daycare_id}, ${userId}, ${name}, ${email.slice(0, 200)}, '', 'applied', now(), ${source})
    on conflict (job_id, user_id) do nothing
  `;
  return job;
}

/** One tap. Applying opens the full profile to this centre only. */
export const applyToStaffJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => ({ jobId: String(input?.jobId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const sql = await getSql();
    await insertApplication(sql, context.userId, data.jobId, "apply");
    {
      // KidEase's own CRM (form:job-apply). Not the centre's applicant list.
      const { captureFormLead } = await import("@/lib/server/ghl-form-lead");
      await captureFormLead({ form: "job-apply", userId: context.userId });
    }
    return { ok: true as const };
  });

export const answerStaffJobInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { inviteId: string; accept: boolean }) => ({
    inviteId: String(input?.inviteId || "").trim(),
    accept: input?.accept === true,
  }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const sql = await getSql();
    const rows = await sql<{ id: string; job_id: string }>`
      select id, job_id from staff_job_invites
      where id = ${data.inviteId} and staff_user_id = ${context.userId} and status = 'sent'
      limit 1
    `;
    const invite = rows[0];
    if (!invite) throw new Error("That invite is not here anymore.");
    if (data.accept) await insertApplication(sql, context.userId, invite.job_id, "invite");
    await sql`
      update staff_job_invites set status = ${data.accept ? "accepted" : "declined"}, answered_at = now()
      where id = ${invite.id}
    `;
    return { ok: true as const };
  });

/** Quebec Law 25: ask a person to look at an automated match. */
export const requestMatchReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { side: string; jobId?: string; message?: string }) => ({
    side: input?.side === "provider" ? ("provider" as const) : ("staff" as const),
    jobId: String(input?.jobId || "").trim().slice(0, 80) || null,
    message: cleanText(input?.message, 1000),
  }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const sql = await getSql();
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from staff_match_review_requests
      where user_id = ${context.userId} and created_at > now() - interval '24 hours'
    `.catch(() => [{ n: 0 }]);
    if ((recent[0]?.n ?? 0) >= 5) throw new Error("You sent a few already. We will reply. You can also write to privacy@kidease.ca.");
    await sql`
      insert into staff_match_review_requests (id, user_id, side, job_id, message)
      values (${nid("smr")}, ${context.userId}, ${data.side}, ${data.jobId}, ${data.message})
    `;
    return { ok: true as const };
  });

export type MatchReviewRow = {
  id: string;
  side: "staff" | "provider";
  jobId: string | null;
  message: string;
  status: "open" | "answered";
  createdAt: string;
  answeredAt: string | null;
  email: string | null;
  name: string | null;
  dueBy: string;
};

const REVIEW_ANSWER_DAYS = 30;

function isoOf(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Admin queue for match review requests. Admin only. Sends no email. */
export const listMatchReviewRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!staffJobBoardEnabled()) return OFF;
    try {
      const { requireAdmin } = await import("@/lib/server/roles");
      await requireAdmin(context.userId);
    } catch {
      return { ok: false as const, reason: "forbidden" as const };
    }
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      side: string;
      job_id: string | null;
      message: string;
      status: string;
      created_at: string | Date;
      answered_at: string | Date | null;
      email: string | null;
      name: string | null;
    }>`
      select r.id, r.side, r.job_id, r.message, r.status, r.created_at, r.answered_at, u.email, u.name
      from staff_match_review_requests r
      left join "user" u on u.id = r.user_id
      order by (r.status = 'open') desc, r.created_at asc
      limit 100
    `.catch(() => null);
    if (!rows) return { ok: false as const, reason: "unavailable" as const };
    return {
      ok: true as const,
      requests: rows.map((row): MatchReviewRow => {
        const created = isoOf(row.created_at) as string;
        return {
          id: row.id,
          side: row.side === "provider" ? "provider" : "staff",
          jobId: row.job_id,
          message: row.message,
          status: row.status === "answered" ? "answered" : "open",
          createdAt: created,
          answeredAt: isoOf(row.answered_at),
          email: row.email,
          name: row.name,
          dueBy: new Date(new Date(created).getTime() + REVIEW_ANSWER_DAYS * 86_400_000).toISOString(),
        };
      }),
    };
  });

/** Admin marks a match review request answered after replying to the person. */
export const markMatchReviewAnswered = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id || "").trim().slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    if (!data.id) return { ok: false as const, reason: "missing" as const };
    try {
      const { requireAdmin } = await import("@/lib/server/roles");
      await requireAdmin(context.userId);
    } catch {
      return { ok: false as const, reason: "forbidden" as const };
    }
    const sql = await getSql();
    const done = await sql<{ id: string }>`
      update staff_match_review_requests
      set status = 'answered', answered_at = now()
      where id = ${data.id} and status = 'open'
      returning id
    `.catch(() => null);
    if (!done) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const, changed: done.length === 1 };
  });

// ---------------------------------------------------------------------------
// Provider side
// ---------------------------------------------------------------------------

export type HiringJob = StaffJob & { applicants: number };
export type ApplicantCard = {
  applicationId: string;
  stage: ApplicationStage;
  profile: FullStaffProfile;
  match: MatchResult;
};
export type SuggestedCard = { profile: LimitedStaffProfile; invited: boolean };

export const getHiringDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!staffJobBoardEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const ids = await hiringCentreIds(sql, context.userId);
    if (!ids.length) return { enabled: true as const, centres: [], jobs: [] as HiringJob[] };
    const [centres, posts] = await Promise.all([
      sql
        .query<{ id: string; name: string; province: string | null }>(
          `select id, name, province from daycares where id = any($1::text[]) order by name limit 20`,
          [ids],
        )
        .catch(() => []),
      sql
        .query<JobRow & { applicants: number }>(
          `select ${JOB_COLUMNS},
             (select count(*)::int from job_applications a where a.job_id = j.id) as applicants
           from centre_job_posts j
           join daycares d on d.id = j.daycare_id
           where j.daycare_id = any($1::text[]) and coalesce(j.board, 0) = 1
           order by j.created_at desc
           limit 40`,
          [ids],
        )
        .catch(() => []),
    ]);
    return {
      enabled: true as const,
      centres: centres.map((c) => ({ id: c.id, name: c.name, province: provinceFromDaycare(c.province) })),
      jobs: posts.map((row): HiringJob => ({ ...toJob(row), applicants: Number(row.applicants) || 0 })),
    };
  });

async function jobForHirer(sql: Sql, userId: string, jobId: string): Promise<JobRow> {
  const ids = await hiringCentreIds(sql, userId);
  const rows = await sql
    .query<JobRow>(
      `select ${JOB_COLUMNS} from centre_job_posts j join daycares d on d.id = j.daycare_id where j.id = $1 limit 1`,
      [jobId],
    )
    .catch(() => []);
  const job = rows[0];
  if (!job || !ids.includes(job.daycare_id)) throw new Error("That job is not on this account.");
  return job;
}

export const postStaffJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: JobDraft) => input)
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const draft: JobDraft = {
      daycareId: String(data.daycareId || "").trim(),
      title: cleanText(data.title, JOB_TITLE_MAX),
      certNeeded: findCertLevel(data.certNeeded) ? String(data.certNeeded) : "",
      careGroups: pickCareGroups(data.careGroups),
      days: pickDays(data.days),
      shifts: pickShifts(data.shifts),
      workType: pickWorkType(data.workType),
      startDate: cleanDate(data.startDate) ?? "",
      payMin: String(data.payMin ?? ""),
      payMax: String(data.payMax ?? ""),
      about: cleanText(data.about, JOB_ABOUT_MAX),
    };
    const errors = JOB_STEPS.flatMap((step) => jobStepErrors(step, draft));
    if (errors.length) return { ok: false as const, reason: "invalid" as const, errors };
    const sql = await getSql();
    const ids = await hiringCentreIds(sql, context.userId);
    if (!ids.includes(draft.daycareId)) throw new Error("That daycare is not on this account.");
    const centre = await sql<{ province: string | null }>`select province from daycares where id = ${draft.daycareId} limit 1`;
    const id = nid("job");
    await sql`
      insert into centre_job_posts (
        id, daycare_id, user_id, role, note, status, board, cert_needed, province, care_groups, days, shifts,
        work_type, start_date, pay_min_cents, pay_max_cents, about
      ) values (
        ${id}, ${draft.daycareId}, ${context.userId}, ${draft.title}, ${draft.about.slice(0, 280)}, 'open', 1,
        ${draft.certNeeded}, ${provinceFromDaycare(centre[0]?.province)}, ${joinList(draft.careGroups)},
        ${joinList(draft.days)}, ${joinList(draft.shifts)}, ${draft.workType}, ${draft.startDate || null},
        ${payCents(draft.payMin)}, ${payCents(draft.payMax)}, ${draft.about}
      )
    `;
    return { ok: true as const, id };
  });

export const setStaffJobOpen = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; open: boolean }) => ({ jobId: String(input?.jobId || "").trim(), open: input?.open === true }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const sql = await getSql();
    await jobForHirer(sql, context.userId, data.jobId);
    await sql`update centre_job_posts set status = ${data.open ? "open" : "closed"} where id = ${data.jobId}`;
    return { ok: true as const };
  });

/** Applicants (full profile: they applied) and people who fit (short profile). */
export const getStaffJobPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => ({ jobId: String(input?.jobId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const today = todayIso();
    const job = await jobForHirer(sql, context.userId, data.jobId);
    const apps = await sql
      .query<ProfileRow & { application_id: string; stage: string }>(
        `select a.id as application_id, a.stage, ${PROFILE_COLUMNS}
         from job_applications a
         join staff_profiles p on p.user_id = a.user_id
         left join "user" u on u.id = p.user_id
         where a.job_id = $1
         order by a.created_at desc
         limit 80`,
        [job.id],
      )
      .catch(() => []);
    const applicants: ApplicantCard[] = [];
    for (const row of apps) {
      const access = await centreAccess(sql, row.user_id, job.daycare_id);
      const profile = providerProfileView(toRecord(row), access, today);
      if (profile.view !== "full") continue;
      applicants.push({
        applicationId: row.application_id,
        stage: pickStage(row.stage),
        profile,
        match: matchFor(row, job, today),
      });
    }
    if (!toJob(job).open) return { enabled: true as const, job: toJob(job), applicants, suggested: [] as SuggestedCard[] };
    const appliedUsers = new Set(apps.map((row) => row.user_id));
    const [pool, invited, employees] = await Promise.all([
      sql
        .query<ProfileRow>(
          `select ${PROFILE_COLUMNS}
           from staff_profiles p
           left join "user" u on u.id = p.user_id
           where p.visibility = 'open' and p.user_id <> $2
             and ($1 = '' or p.province = $1 or p.province = '')
           order by p.updated_at desc
           limit ${SUGGEST_POOL}`,
          [provinceCode(job.province) || provinceFromDaycare(job.d_province), context.userId],
        )
        .catch(() => []),
      sql<{ staff_user_id: string }>`
        select staff_user_id from staff_job_invites where job_id = ${job.id}
      `.catch(() => [] as { staff_user_id: string }[]),
      sql<{ user_id: string }>`
        select user_id from centre_members where daycare_id = ${job.daycare_id} and status = 'active'
      `,
    ]);
    const invitedSet = new Set(invited.map((row) => row.staff_user_id));
    const employeeSet = new Set(employees.map((row) => row.user_id));
    const suggested: SuggestedCard[] = pool
      .filter((row) => !appliedUsers.has(row.user_id))
      .filter((row) =>
        visibleToCentre({
          visibility: pickVisibility(row.visibility),
          hideFromEmployer: Number(row.hide_from_employer) !== 0,
          isCurrentEmployer: employeeSet.has(row.user_id),
          access: { applied: false, acceptedInvite: false, hired: false },
        }),
      )
      .map((row) => {
        const view = providerProfileView(toRecord(row), { applied: false, acceptedInvite: false, hired: false }, today);
        return { profile: view as LimitedStaffProfile, invited: invitedSet.has(row.user_id) };
      })
      .slice(0, SUGGEST_SHOW);
    return { enabled: true as const, job: toJob(job), applicants, suggested };
  });

export const inviteStaffToJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; ref: string }) => ({
    jobId: String(input?.jobId || "").trim(),
    ref: String(input?.ref || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const sql = await getSql();
    const job = await jobForHirer(sql, context.userId, data.jobId);
    if (!toJob(job).open) throw new Error("This job is closed. Reopen it before sending an invite.");
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from staff_job_invites
      where invited_by = ${context.userId} and created_at > now() - interval '24 hours'
    `.catch(() => [{ n: 0 }]);
    if ((recent[0]?.n ?? 0) >= INVITES_PER_DAY) throw new Error("That is a lot of invites today. Try again tomorrow.");
    const rows = await sql<{ user_id: string; visibility: string; hide_from_employer: number }>`
      select user_id, visibility, hide_from_employer from staff_profiles where ref = ${data.ref} limit 1
    `;
    const person = rows[0];
    if (!person) throw new Error("That profile is not here anymore.");
    const access = await centreAccess(sql, person.user_id, job.daycare_id);
    const allowed = visibleToCentre({
      visibility: pickVisibility(person.visibility),
      hideFromEmployer: Number(person.hide_from_employer) !== 0,
      isCurrentEmployer: access.member,
      access,
    });
    if (!allowed) throw new Error("That profile is not here anymore.");
    await sql`
      insert into staff_job_invites (id, job_id, daycare_id, staff_user_id, invited_by)
      values (${nid("sji")}, ${job.id}, ${job.daycare_id}, ${person.user_id}, ${context.userId})
      on conflict (job_id, staff_user_id) do nothing
    `;
    return { ok: true as const };
  });

async function applicationForHirer(sql: Sql, userId: string, applicationId: string) {
  const rows = await sql<{ id: string; job_id: string; daycare_id: string; user_id: string; stage: string }>`
    select id, job_id, daycare_id, user_id, stage from job_applications where id = ${applicationId} limit 1
  `;
  const app = rows[0];
  if (!app) throw new Error("That application is not here.");
  const ids = await hiringCentreIds(sql, userId);
  if (!ids.includes(app.daycare_id)) throw new Error("That daycare is not on this account.");
  return app;
}

export const getStaffApplicant = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { applicationId: string }) => ({ applicationId: String(input?.applicationId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const today = todayIso();
    const app = await applicationForHirer(sql, context.userId, data.applicationId);
    const job = await jobForHirer(sql, context.userId, app.job_id);
    const row = await loadProfileRow(sql, app.user_id);
    if (!row) throw new Error("That profile is not here anymore.");
    const access = await centreAccess(sql, app.user_id, app.daycare_id);
    let stage = pickStage(app.stage);
    if (stage === "applied" && canSetStage({ to: "viewed", actor: "system", fullAccess: hasFullAccess(access) })) {
      await sql`update job_applications set stage = 'viewed', stage_at = now() where id = ${app.id} and stage = 'applied'`.catch(() => []);
      stage = "viewed";
    }
    const record = toRecord(row);
    const profile = providerProfileView(record, access, today);
    if (profile.view !== "full") throw new Error("That profile is not here anymore.");
    const saved = await sql<{ item: string; state: string; note: string }>`
      select item, state, note from staff_vetting_checks where application_id = ${app.id}
    `.catch(() => [] as { item: string; state: string; note: string }[]);
    const savedMap: Partial<Record<VettingItem, { state: VettingState; note: string }>> = {};
    for (const s of saved) {
      if ((VETTING_ITEMS as readonly string[]).includes(s.item)) {
        savedMap[s.item as VettingItem] = { state: pickVettingState(s.state), note: s.note };
      }
    }
    const fullName = `${profile.firstName} ${profile.lastName}`;
    const checklist: VettingRow[] = vettingChecklist({
      certLevel: record.certLevel,
      certExpiresOn: record.certExpiresOn,
      firstAidExpiresOn: record.firstAidExpiresOn,
      backgroundCheck: await backgroundCheckFact(sql, app.daycare_id, fullName),
      saved: savedMap,
      today,
    });
    return {
      enabled: true as const,
      applicationId: app.id,
      stage,
      member: access.member,
      profile,
      match: matchFor(row, job, today),
      checklist,
      jobTitle: job.role,
    };
  });

export const setStaffApplicationStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { applicationId: string; stage: string }) => ({
    applicationId: String(input?.applicationId || "").trim(),
    stage: (APPLICATION_STAGES as readonly string[]).includes(String(input?.stage)) ? pickStage(input.stage) : null,
  }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    if (!data.stage) throw new Error("Pick a step.");
    const sql = await getSql();
    const app = await applicationForHirer(sql, context.userId, data.applicationId);
    const access = await centreAccess(sql, app.user_id, app.daycare_id);
    if (!canSetStage({ to: data.stage, actor: "provider", fullAccess: hasFullAccess(access) })) throw new Error("Pick a step.");
    await sql`update job_applications set stage = ${data.stage}, stage_at = now() where id = ${app.id}`;
    return { ok: true as const };
  });

export const saveStaffVetting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { applicationId: string; item: string; state: string; note?: string }) => ({
    applicationId: String(input?.applicationId || "").trim(),
    item: (VETTING_ITEMS as readonly string[]).includes(String(input?.item)) ? (input.item as VettingItem) : null,
    state: pickVettingState(input?.state),
    note: cleanText(input?.note, 200),
  }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    if (!data.item) throw new Error("Pick a line.");
    const sql = await getSql();
    const app = await applicationForHirer(sql, context.userId, data.applicationId);
    await sql`
      insert into staff_vetting_checks (application_id, item, state, note, checked_by, checked_at)
      values (${app.id}, ${data.item}, ${data.state}, ${data.note}, ${context.userId}, now())
      on conflict (application_id, item) do update set
        state = excluded.state, note = excluded.note, checked_by = excluded.checked_by, checked_at = now()
    `;
    return { ok: true as const };
  });

/**
 * The provider chose to hire. Mark the step and save a pending staff invite
 * through the existing invite path, without sending mail. The person accepts it
 * on their KidEase page.
 */
export const hireStaffApplicant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { applicationId: string }) => ({ applicationId: String(input?.applicationId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!staffJobBoardEnabled()) return OFF;
    const sql = await getSql();
    const app = await applicationForHirer(sql, context.userId, data.applicationId);
    const access = await centreAccess(sql, app.user_id, app.daycare_id);
    if (!canSetStage({ to: "hired", actor: "provider", fullAccess: hasFullAccess(access) })) throw new Error("Pick a step.");
    await sql`update job_applications set stage = 'hired', stage_at = now() where id = ${app.id}`;
    if (access.member) return { ok: true as const, invited: false, inviteError: null };
    const row = await loadProfileRow(sql, app.user_id);
    const email = (row?.email || "").trim();
    if (!email) return { ok: true as const, invited: false, inviteError: "No email on their account." };
    const { createCentreEmployeeInvite } = await import("@/lib/server/centre-members");
    try {
      await createCentreEmployeeInvite(
        context.userId,
        { daycareId: app.daycare_id, email, name: row ? `${row.first_name} ${row.last_name}`.trim() : "", preset: "staff" },
        { send: false },
      );
      return { ok: true as const, invited: true, inviteError: null };
    } catch (err) {
      return { ok: true as const, invited: false, inviteError: err instanceof Error ? err.message : "Invite not saved." };
    }
  });

// ---------------------------------------------------------------------------
// Resume access (used by /api/staff-resume)
// ---------------------------------------------------------------------------

/** The person, or a hiring centre with full access to them. Never a limited viewer. */
export async function authorizeStaffResume(input: { userId: string; ref: string }) {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; resume_ref: string | null; resume_mime: string | null; resume_name: string | null }>`
    select user_id, resume_ref, resume_mime, resume_name from staff_profiles where ref = ${input.ref} limit 1
  `;
  const row = rows[0];
  if (!row?.resume_ref) throw new Error("File not found");
  if (mayReadStaffResume(row.user_id === input.userId, [])) return { ...row, audience: "self" as const };
  const ids = await hiringCentreIds(sql, input.userId);
  for (const id of ids) {
    const access = await centreAccess(sql, row.user_id, id);
    if (mayReadStaffResume(false, [access])) return { ...row, audience: "provider" as const };
  }
  // A short-profile viewer cannot tell whether a resume was uploaded.
  throw new Error("File not found");
}

export async function saveStaffResume(input: { userId: string; body: Buffer; mime: string; filename: string }) {
  if (!staffJobBoardEnabled()) throw new Error("The job board is not open yet.");
  const sql = await getSql();
  const row = await loadProfileRow(sql, input.userId);
  if (!row) throw new Error("Save your profile first, then add a resume.");
  const { persistPrivateDoc } = await import("@/lib/server/private-docs");
  const { R2_STAFF_RESUME_PREFIX, safeDocKeyPart } = await import("@/lib/private-docs");
  const stored = await persistPrivateDoc({
    prefix: R2_STAFF_RESUME_PREFIX,
    keyTail: `${safeDocKeyPart(row.ref)}/${safeDocKeyPart(nid("cv"))}`,
    body: input.body,
    mime: input.mime,
  });
  await sql`
    update staff_profiles
    set resume_ref = ${stored.storageRef}, resume_mime = ${stored.mime},
        resume_name = ${input.filename.slice(0, 160)}, updated_at = now()
    where user_id = ${input.userId}
  `;
  return { ok: true as const, ref: row.ref };
}

export type { ProfileDraft, JobDraft };
