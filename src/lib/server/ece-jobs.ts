/**
 * ECE job post, apply, and applicant list.
 * FEATURE_ECE_JOBS defaults off. Does not charge.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { cleanEceNote, cleanEceRole, ecePostReady } from "@/lib/ece-jobs";
import { eceJobsEnabled } from "@/lib/features";
import { nid } from "@/lib/utils";
import { listAccessibleDaycareIds } from "./centre-access";

export const eceJobsFlag = createServerFn({ method: "GET" }).handler(async () => eceJobsEnabled());

export const listPublicEceJobs = createServerFn({ method: "GET" }).handler(async () => {
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
    order by j.created_at desc
    limit 40
  `.catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    note: row.note,
    daycareId: row.daycare_id,
    name: row.name,
    slug: row.slug,
    city: row.city || "",
  }));
});

export const postEceJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; role: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!eceJobsEnabled()) return { ok: false as const, reason: "off" as const };
    const role = cleanEceRole(data.role);
    if (!ecePostReady(role)) throw new Error("Add the role title");
    const sql = await getSql();
    const centres = await listAccessibleDaycareIds(sql, context.userId);
    if (!centres.includes(data.daycareId)) throw new Error("That centre is not on this account");
    const id = nid("job");
    await sql`
      insert into centre_job_posts (id, daycare_id, user_id, role, note)
      values (${id}, ${data.daycareId}, ${context.userId}, ${role}, ${cleanEceNote(data.note || "")})
    `;
    return { ok: true as const, id };
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
    return { ok: true as const };
  });

export const listMyEceApplicants = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!eceJobsEnabled()) return [];
    const sql = await getSql();
    const centres = await listAccessibleDaycareIds(sql, context.userId);
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
    const centres = await listAccessibleDaycareIds(sql, context.userId);
    if (!centres.length) return [];
    const rows = await sql
      .query<{ id: string; name: string }>(
        `select id, name from daycares where id = any($1::text[]) order by name limit 20`,
        [centres],
      )
      .catch(() => []);
    return rows;
  });
