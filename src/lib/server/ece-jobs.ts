/**
 * ECE job post, apply, and applicant list.
 * FEATURE_ECE_JOBS defaults off. Does not charge.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql, type Sql } from "@/lib/db";
import { cleanEceNote, cleanEceRole, ecePostReady } from "@/lib/ece-jobs";
import { eceJobsEnabled } from "@/lib/features";
import { canadaProvinceCode, jobAppStatus, jobPostStatus, provinceBucket, staffingShortage } from "@/lib/gap-features";
import { PROVINCES } from "@/lib/gov/places";
import { govScopeProvince } from "@/lib/gov/province-choice";
import type { GovActor } from "@/lib/server/gov-actor.server";
import { nid } from "@/lib/utils";


async function eceOwnerCentreIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from provider_daycares where user_id = ${userId}
    union
    select daycare_id from centre_members
    where user_id = ${userId} and status = 'active' and role = 'owner'
  `;
  if (!rows.length) setResponseStatus(403);
  return rows.map(({ daycare_id }) => daycare_id);
}

function eceOwnerDenied() {
  setResponseStatus(403);
  return { ok: false as const, reason: "owner" as const };
}

export const eceJobsFlag = createServerFn({ method: "GET" }).handler(async () => eceJobsEnabled());

export async function publicEceJobRows() {
  if (!eceJobsEnabled()) return [];
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    role: string;
    note: string;
    daycare_id: string;
    name: string;
    slug: string;
    city: string | null;
  }>`
    select j.id, j.role, j.note, j.daycare_id, d.name, d.slug, d.city
    from centre_job_posts j
    join daycares d on d.id = j.daycare_id
    where coalesce(d.visibility, 'public') = 'public'
      and coalesce(d.is_test, 0) = 0
      and coalesce(d.is_demo, 0) = 0
      and coalesce(j.status, 'open') = 'open'
    order by j.created_at desc
    limit 40
  `.catch(() =>
    sql<{
      id: string;
      role: string;
      note: string;
      daycare_id: string;
      name: string;
      slug: string;
      city: string | null;
    }>`
      select j.id, j.role, j.note, j.daycare_id, d.name, d.slug, d.city
      from centre_job_posts j
      join daycares d on d.id = j.daycare_id
      where coalesce(d.visibility, 'public') = 'public'
        and coalesce(d.is_test, 0) = 0
        and coalesce(d.is_demo, 0) = 0
      order by j.created_at desc
      limit 40
    `.catch(() => []),
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    note: row.note,
    daycareId: row.daycare_id,
    name: row.name,
    slug: row.slug,
    city: row.city || "",
  }));
}

export const listPublicEceJobs = createServerFn({ method: "GET" }).handler(async () => publicEceJobRows());

export const postEceJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; role: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!eceJobsEnabled()) return { ok: false as const, reason: "off" as const };
    const role = cleanEceRole(data.role);
    if (!ecePostReady(role)) throw new Error("Add the role title");
    const sql = await getSql();
    const id = nid("job");
    const rows = await sql<{ id: string }>`
      insert into centre_job_posts (id, daycare_id, user_id, role, note)
      select ${id}, d.id, ${context.userId}, ${role}, ${cleanEceNote(data.note || "")}
      from daycares d
      where d.id = ${data.daycareId} and (
        exists (select 1 from provider_daycares p where p.daycare_id = d.id and p.user_id = ${context.userId})
        or exists (select 1 from centre_members m where m.daycare_id = d.id and m.user_id = ${context.userId}
          and m.status = 'active' and m.role = 'owner')
      )
      returning id
    `;
    return rows.length ? { ok: true as const, id } : eceOwnerDenied();
  });

export const applyToEceJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!eceJobsEnabled()) return { ok: false as const, reason: "off" as const };
    const jobId = String(data.jobId || "").trim();
    const sql = await getSql();
    const jobs = await sql<{ id: string; daycare_id: string }>`
      select id, daycare_id from centre_job_posts where id = ${jobId} limit 1
    `;
    const job = jobs[0];
    if (!job) throw new Error("That role is not posted");
    const who = await sql<{ name: string | null; email: string | null }>`
      select name, email from "user" where id = ${context.userId} limit 1
    `.catch(() => [] as { name: string | null; email: string | null }[]);
    const email = (who[0]?.email || "").trim();
    if (!email) throw new Error("Add an email on your account first");
    await sql`
      insert into job_applications (id, job_id, daycare_id, user_id, name, email, note)
      values (
        ${nid("app")}, ${job.id}, ${job.daycare_id}, ${context.userId},
        ${(who[0]?.name || "").trim().slice(0, 120) || email},
        ${email.slice(0, 200)},
        ${cleanEceNote(data.note || "")}
      )
      on conflict (job_id, user_id) do update set note = excluded.note
    `;
    {
      // KidEase's own CRM (form:job-apply). Not the centre's applicant list.
      const { captureFormLead } = await import("@/lib/server/ghl-form-lead");
      await captureFormLead({ form: "job-apply", userId: context.userId, email, name: who[0]?.name });
    }
    return { ok: true as const };
  });

export const listMyEceApplicants = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!eceJobsEnabled()) return [];
    const sql = await getSql();
    const centres = await eceOwnerCentreIds(sql, context.userId);
    if (!centres.length) return [];
    const rows = await sql
      .query<{
        id: string;
        role: string;
        name: string;
        email: string;
        note: string;
        created_at: string | Date;
      }>(
        `select a.id, j.role, a.name, a.email, a.note, a.created_at
         from job_applications a
         join centre_job_posts j on j.id = a.job_id
         where a.daycare_id = any($1::text[])
         order by a.created_at desc
         limit 40`,
        [centres],
      )
      .catch(() => []);
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      name: row.name,
      email: row.email,
      note: row.note,
      at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  });

export const listMyCentresForJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!eceJobsEnabled()) return [];
    const sql = await getSql();
    const centres = await eceOwnerCentreIds(sql, context.userId);
    if (!centres.length) return [];
    const rows = await sql
      .query<{ id: string; name: string }>(
        `select id, name from daycares where id = any($1::text[]) order by name limit 20`,
        [centres],
      )
      .catch(() => []);
    return rows;
  });

export const listManagedEceJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!eceJobsEnabled()) return { enabled: false as const, posts: [], applicants: [] };
    const sql = await getSql();
    const centres = await eceOwnerCentreIds(sql, context.userId);
    if (!centres.length) return { enabled: true as const, posts: [], applicants: [] };
    const posts = await sql
      .query<{
        id: string;
        role: string;
        note: string;
        status: string | null;
        daycare_id: string;
        name: string;
        city: string | null;
      }>(
        `select j.id, j.role, j.note, j.status, j.daycare_id, d.name, d.city
         from centre_job_posts j
         join daycares d on d.id = j.daycare_id
         where j.daycare_id = any($1::text[])
         order by j.created_at desc
         limit 40`,
        [centres],
      )
      .catch(() => []);
    const applicants = await sql
      .query<{
        id: string;
        job_id: string;
        role: string;
        name: string;
        email: string;
        note: string;
        status: string | null;
        centre: string;
      }>(
        `select a.id, a.job_id, j.role, a.name, a.email, a.note, a.status, d.name as centre
         from job_applications a
         join centre_job_posts j on j.id = a.job_id
         join daycares d on d.id = a.daycare_id
         where a.daycare_id = any($1::text[])
         order by a.created_at desc
         limit 80`,
        [centres],
      )
      .catch(() => []);
    return {
      enabled: true as const,
      posts: posts.map((row) => ({
        id: row.id,
        role: row.role,
        note: row.note,
        status: jobPostStatus(row.status),
        daycareId: row.daycare_id,
        name: row.name,
        city: row.city || "",
      })),
      applicants: applicants.map((row) => ({
        id: row.id,
        jobId: row.job_id,
        role: row.role,
        name: row.name,
        email: row.email,
        note: row.note,
        status: jobAppStatus(row.status),
        centre: row.centre,
      })),
    };
  });

export const setEceJobStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId?: string; status?: string }) => ({
    jobId: String(input?.jobId || "").trim(),
    status: input?.status === "closed" ? "closed" : "open",
  }))
  .handler(async ({ context, data }) => {
    if (!eceJobsEnabled()) return { ok: false as const, reason: "off" as const };
    if (!data.jobId) throw new Error("That role is not posted");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update centre_job_posts target set status = ${data.status}
      where target.id = ${data.jobId} and (
        exists (select 1 from provider_daycares p where p.daycare_id = target.daycare_id and p.user_id = ${context.userId})
        or exists (select 1 from centre_members m where m.daycare_id = target.daycare_id and m.user_id = ${context.userId}
          and m.status = 'active' and m.role = 'owner')
      )
      returning target.id
    `;
    return rows.length ? { ok: true as const } : eceOwnerDenied();
  });

export const setEceApplicationStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { applicationId?: string; status?: string }) => ({
    applicationId: String(input?.applicationId || "").trim(),
    status: jobAppStatus(input?.status),
  }))
  .handler(async ({ context, data }) => {
    if (!eceJobsEnabled()) return { ok: false as const, reason: "off" as const };
    if (!data.applicationId) throw new Error("That application is not here");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update job_applications target set status = ${data.status}
      where target.id = ${data.applicationId} and (
        exists (select 1 from provider_daycares p where p.daycare_id = target.daycare_id and p.user_id = ${context.userId})
        or exists (select 1 from centre_members m where m.daycare_id = target.daycare_id and m.user_id = ${context.userId}
          and m.status = 'active' and m.role = 'owner')
      )
      returning target.id
    `;
    return rows.length ? { ok: true as const } : eceOwnerDenied();
  });

/** Province counts only. Names and emails stay off this response. */
export const listJobShortage = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { province?: string } | undefined) => ({
    province: canadaProvinceCode(input?.province) ?? "",
  }))
  .handler(async ({ data, context }) => {
    const province = canadaProvinceCode(govScopeProvince(context.gov as GovActor, data.province)) ?? "";
    if (!eceJobsEnabled()) {
      return { enabled: false as const, province, openJobs: 0, centres: 0 };
    }
    // This view supports one province; do not invent a national total for CA/ALL.
    if (!province) return { enabled: true as const, ...staffingShortage([], "") };
    const provinceInfo = PROVINCES.find((row) => row.code === province);
    const provinceAliases = [province, provinceInfo?.nameEn, provinceInfo?.nameFr]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toUpperCase());
    const sql = await getSql();
    const rows = await sql<{ province: string | null; open_jobs: number; centres: number }>`
      select upper(coalesce(d.province, '')) as province,
             count(*)::int as open_jobs,
             count(distinct j.daycare_id)::int as centres
      from centre_job_posts j
      join daycares d on d.id = j.daycare_id
      where coalesce(j.status, 'open') = 'open'
        and coalesce(d.is_test, 0) = 0
        and coalesce(d.is_demo, 0) = 0
        and upper(btrim(coalesce(d.province, ''))) = any(${provinceAliases}::text[])
      group by 1
    `.catch(() => []);
    const buckets = new Map<string, { province: string; openJobs: number; centres: number }>();
    for (const row of rows) {
      const rowProvince = provinceBucket(row.province);
      if (rowProvince !== province) continue;
      const current = buckets.get(rowProvince) ?? { province: rowProvince, openJobs: 0, centres: 0 };
      current.openJobs += Number(row.open_jobs) || 0;
      current.centres += Number(row.centres) || 0;
      buckets.set(rowProvince, current);
    }
    const tally = staffingShortage([...buckets.values()], province);
    return { enabled: true as const, ...tally };
  });
