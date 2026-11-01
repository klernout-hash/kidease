import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { curriculumPackEnabled, curriculumPackLive, storyCornerEnabled } from "@/lib/features";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { parseStory } from "@/lib/learning-stories";
import { nid } from "@/lib/utils";
import {
  ACTIVITY_LIBRARY,
  FRAMEWORK_LIBRARY,
  GOAL_LIBRARY,
  acceptStoryPhoto,
  activitiesFor,
  anonymiseCoverage,
  buildStatement,
  coverageReport,
  curriculumMode,
  docsFor,
  frameworkFor,
  goalsFor,
  homeIdeas,
  legacyStoryFields,
  monthPlan,
  normalizeProvince,
  parentMaySeeStory,
  photoView,
  reviewReminder,
  weekPlan,
  type AgeBand,
} from "@/lib/curriculum/pack";
import { creditVisible, readerFileAllowed, shelfBooks, shaMatches, uniteForLiteracy, type StoredBook } from "@/lib/story-corner/open-books";

const ENROLLED = [...ENROLLED_BOOKING_STATUSES];

const ENSURE_SQL = `
create table if not exists curriculum_story_meta (
  story_id text primary key,
  daycare_id text not null,
  province text not null,
  goal_ids jsonb not null default '[]'::jsonb,
  what_next text not null default '',
  age_band text not null default 'preschool',
  status text not null default 'draft',
  published_at timestamptz,
  photo_keys jsonb not null default '[]'::jsonb,
  home_activity_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists curriculum_replies (
  id text primary key,
  story_id text not null,
  parent_user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create table if not exists curriculum_plans (
  id text primary key,
  daycare_id text not null,
  province text not null,
  kind text not null,
  period_start date not null,
  room_label text not null default '',
  body text not null,
  goal_ids jsonb not null default '[]'::jsonb,
  author_user_id text not null,
  review_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists curriculum_plans_once
  on curriculum_plans (daycare_id, kind, period_start, room_label);
create table if not exists curriculum_reminder_log (
  id text primary key,
  daycare_id text not null,
  plan_id text not null default '',
  kind text not null,
  due_on date not null,
  note text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists curriculum_reminder_once
  on curriculum_reminder_log (daycare_id, plan_id, kind, due_on);
create table if not exists learning_stories (
  id text primary key,
  daycare_id text not null,
  child_id text not null,
  title text not null,
  body text not null,
  framework text not null,
  domain text not null,
  observed_on date not null,
  is_private int not null default 1,
  author_id text not null,
  created_at timestamptz not null default now()
);
`;

async function ensureCurriculum() {
  const sql = await getSql();
  await sql.query(ENSURE_SQL).catch(() => undefined);
}

function gate() {
  return {
    pack: curriculumPackEnabled(),
    live: curriculumPackLive(),
    stories: storyCornerEnabled(),
    mode: curriculumMode(curriculumPackEnabled(), curriculumPackLive()),
  };
}

async function assertCentre(userId: string, daycareId: string) {
  const sql = await getSql();
  const ids = await listAccessibleDaycareIds(sql, userId);
  if (!ids.includes(daycareId)) throw new Error("This centre is not yours.");
  return sql;
}

export const curriculumStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => gate());

export const loadCurriculumDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    const flags = gate();
    if (!flags.pack) return { enabled: false as const, flags };
    const sql = await getSql();
    await ensureCurriculum();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    const centres = ids.length
      ? await sql
          .query<{ id: string; name: string; province: string | null }>(
            `select id, name, province from daycares where id = any($1::text[]) order by name`,
            [ids],
          )
          .catch(() => [])
      : [];
    const daycareId = centres.some((row) => row.id === data.daycareId) ? data.daycareId : centres[0]?.id || "";
    const centre = centres.find((row) => row.id === daycareId);
    const province = normalizeProvince(centre?.province);
    const children = daycareId
      ? await sql
          .query<{ id: string; name: string; room: string | null; booking_id: string }>(
            `select distinct c.id, c.name, a.room_id as room, b.id as booking_id
             from bookings b
             join children c on c.id = b.child_id
             left join care_child_room_assignments a on a.booking_id = b.id and a.daycare_id = b.daycare_id
             where b.daycare_id = $1 and b.status = any($2::text[])
             order by c.name`,
            [daycareId, ENROLLED],
          )
          .catch(() => [])
      : [];
    const stories = daycareId
      ? await sql
          .query<{
            id: string;
            child_id: string;
            title: string;
            body: string;
            observed_on: string;
            goal_ids: unknown;
            what_next: string | null;
            status: string | null;
            age_band: string | null;
            photo_keys: unknown;
          }>(
            `select s.id, s.child_id, s.title, s.body, s.observed_on::text as observed_on,
                    m.goal_ids, m.what_next, m.status, m.age_band, m.photo_keys
             from learning_stories s
             left join curriculum_story_meta m on m.story_id = s.id
             where s.daycare_id = $1 and s.is_private = 1
             order by s.observed_on desc
             limit 40`,
            [daycareId],
          )
          .catch(() => [])
      : [];
    const plans = daycareId
      ? await sql
          .query<{ id: string; kind: string; period_start: string; body: string; review_due_on: string | null }>(
            `select id, kind, period_start::text as period_start, body, review_due_on::text as review_due_on
             from curriculum_plans where daycare_id = $1 order by period_start desc limit 12`,
            [daycareId],
          )
          .catch(() => [])
      : [];
    return {
      enabled: true as const,
      flags,
      daycareId,
      centres: centres.map((row) => ({ id: row.id, name: row.name, province: normalizeProvince(row.province) })),
      province,
      framework: province ? frameworkFor(province) : null,
      goals: province ? goalsFor(province) : [],
      docs: province ? docsFor(province) : [],
      activities: province ? activitiesFor(province) : [],
      children: children.map((row) => ({ id: row.id, name: row.name, room: row.room, bookingId: row.booking_id })),
      stories: stories.map((row) => ({
        id: row.id,
        childId: row.child_id,
        title: row.title,
        body: row.body,
        observedOn: String(row.observed_on).slice(0, 10),
        goalIds: Array.isArray(row.goal_ids) ? row.goal_ids.map(String) : [],
        whatNext: row.what_next || "",
        status: row.status === "published" ? "published" : "draft",
        ageBand: row.age_band || "preschool",
        photoCount: Array.isArray(row.photo_keys) ? row.photo_keys.length : 0,
      })),
      plans,
      catalogCount: { goals: GOAL_LIBRARY.length, activities: ACTIVITY_LIBRARY.length, provinces: FRAMEWORK_LIBRARY.length },
    };
  });

export const saveCurriculumStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId?: string;
      childId?: string;
      title?: string;
      body?: string;
      observedOn?: string;
      goalId?: string;
      whatNext?: string;
      ageBand?: string;
      publish?: boolean;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const flags = gate();
    if (!flags.pack) throw new Error("Learning pack is off.");
    const daycareId = String(data.daycareId || "").trim();
    const sql = await assertCentre(context.userId, daycareId);
    await ensureCurriculum();
    const centre = await sql<{ province: string | null }>`select province from daycares where id = ${daycareId} limit 1`;
    const province = normalizeProvince(centre[0]?.province);
    if (!province) throw new Error("Add a province on the listing first.");
    const goal = goalsFor(province).find((row) => row.id === String(data.goalId || ""));
    if (!goal) throw new Error("Pick a goal for this province.");
    const legacy = legacyStoryFields(province, goal.theme);
    const parsed = parseStory({
      childId: data.childId,
      title: data.title,
      body: data.body,
      framework: legacy.framework,
      domain: legacy.domain,
      observedOn: data.observedOn,
    });
    if (!parsed.ok) throw new Error("Check the child, the date, and the note.");
    const enrolled = await sql.query<{ id: string }>(
      `select c.id from children c
       join bookings b on b.child_id = c.id
       where c.id = $1 and b.daycare_id = $2 and b.status = any($3::text[])
       limit 1`,
      [parsed.story.childId, daycareId, ENROLLED],
    );
    if (!enrolled[0]) throw new Error("That child is not enrolled here.");
    const ageBand: AgeBand = (["infant", "toddler", "preschool", "school"] as const).includes(data.ageBand as AgeBand)
      ? (data.ageBand as AgeBand)
      : "preschool";
    const whatNext = String(data.whatNext || "").trim().slice(0, 1000);
    const wantsPublish = Boolean(data.publish);
    const status = wantsPublish && flags.mode === "live" ? "published" : "draft";
    const id = nid("sty");
    await sql`
      insert into learning_stories (
        id, daycare_id, child_id, title, body, framework, domain, observed_on, is_private, author_id
      ) values (
        ${id}, ${daycareId}, ${parsed.story.childId}, ${parsed.story.title}, ${parsed.story.body},
        ${parsed.story.framework}, ${parsed.story.domain}, ${parsed.story.observedOn}, 1, ${context.userId}
      )
    `;
    const ideas = homeIdeas(province, [goal.id], ageBand).map((row) => row.id);
    await sql`
      insert into curriculum_story_meta (
        story_id, daycare_id, province, goal_ids, what_next, age_band, status, published_at, home_activity_ids
      ) values (
        ${id}, ${daycareId}, ${province}, ${JSON.stringify([goal.id])}::jsonb, ${whatNext}, ${ageBand},
        ${status}, ${status === "published" ? new Date().toISOString() : null}, ${JSON.stringify(ideas)}::jsonb
      )
    `;
    if (wantsPublish && flags.mode !== "live") {
      await sql`
        insert into curriculum_reminder_log (id, daycare_id, plan_id, kind, due_on, note)
        values (${nid("log")}, ${daycareId}, ${id}, ${"publish_intent"}, ${parsed.story.observedOn}, ${"Publish stayed a draft because the live switch is off."})
      `;
    }
    return { ok: true as const, id, status, ideas };
  });

export const attachCurriculumPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; storyId?: string; bookingId?: string; contentType?: string; bodyBase64?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!curriculumPackEnabled()) throw new Error("Learning pack is off.");
    const daycareId = String(data.daycareId || "").trim();
    const storyId = String(data.storyId || "").trim();
    const bookingId = String(data.bookingId || "").trim();
    const sql = await assertCentre(context.userId, daycareId);
    const booking = await sql<{ status: string; photo_consent_at: string | Date | null; child_id: string | null }>`
      select status, photo_consent_at, child_id from bookings
      where id = ${bookingId} and daycare_id = ${daycareId}
      limit 1
    `;
    const row = booking[0];
    const consentAt = row?.photo_consent_at instanceof Date ? row.photo_consent_at.toISOString() : row?.photo_consent_at || null;
    const enrolled = Boolean(row && ENROLLED.includes(row.status as (typeof ENROLLED)[number]));
    const key = `family-docs/curriculum/${daycareId}/${row?.child_id || "child"}/${nid("photo")}.jpg`;
    const decision = acceptStoryPhoto({ consentAt, enrolled, key });
    if (!decision.ok) throw new Error(decision.reason === "consent" ? "A parent must opt in before a photo is saved." : "Photos stay with enrolled children.");
    const bodyBase64 = String(data.bodyBase64 || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    try {
      const { putR2Object } = await import("@/lib/server/r2.server");
      await putR2Object({ key, contentType: String(data.contentType || "image/jpeg"), bodyBase64 });
    } catch {
      throw new Error("Photo storage is not ready.");
    }
    await sql`
      update curriculum_story_meta
      set photo_keys = photo_keys || ${JSON.stringify([key])}::jsonb, updated_at = now()
      where story_id = ${storyId} and daycare_id = ${daycareId}
    `;
    return { ok: true as const, key };
  });

export const viewCurriculumPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { storyId?: string; key?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!curriculumPackEnabled() || !curriculumPackLive()) return { blocked: true as const, reason: "off" };
    const sql = await getSql();
    const key = String(data.key || "");
    const rows = await sql.query<{ photo_consent_at: string | null; parent_user_id: string | null; status: string }>(
      `select b.photo_consent_at::text as photo_consent_at, b.user_id as parent_user_id, b.status
       from curriculum_story_meta m
       join learning_stories s on s.id = m.story_id
       join bookings b on b.child_id = s.child_id and b.daycare_id = s.daycare_id
       where m.story_id = $1 and b.status = any($2::text[])
       limit 1`,
      [String(data.storyId || ""), ENROLLED],
    ).catch(() => []);
    const row = rows[0];
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    const staff = ids.length > 0;
    const parent = row?.parent_user_id === context.userId;
    if (!staff && !parent) return { blocked: true as const, reason: "enrol" };
    let signed: string | null = null;
    try {
      const { presignR2Get } = await import("@/lib/server/r2.server");
      signed = presignR2Get(key, 120).url;
    } catch {
      signed = null;
    }
    const view = photoView({
      key,
      consentAt: row?.photo_consent_at || null,
      enrolled: Boolean(row),
      signedUrl: signed,
    });
    if ("blocked" in view) return view;
    return { url: view.url };
  });

export const grantCurriculumPhotoConsent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!curriculumPackEnabled()) return { ok: false as const };
    const sql = await getSql();
    const wrote = await sql
      .query<{ id: string }>(
        `update bookings set photo_consent_at = now()
         where id = $1 and user_id = $2 and status = any($3::text[])
         returning id`,
        [String(data.bookingId || ""), context.userId, ENROLLED],
      )
      .catch(() => []);
    if (!wrote[0]) throw new Error("Enrolment not found");
    return { ok: true as const };
  });

export const saveCurriculumPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; kind?: string; periodStart?: string; answers?: string[]; room?: string }) => input)
  .handler(async ({ context, data }) => {
    if (!curriculumPackEnabled()) throw new Error("Learning pack is off.");
    const daycareId = String(data.daycareId || "").trim();
    const sql = await assertCentre(context.userId, daycareId);
    await ensureCurriculum();
    const centre = await sql<{ name: string; province: string | null }>`select name, province from daycares where id = ${daycareId} limit 1`;
    const province = normalizeProvince(centre[0]?.province);
    if (!province) throw new Error("Add a province on the listing first.");
    const kind = data.kind === "month" || data.kind === "statement" ? data.kind : "week";
    const periodStart = String(data.periodStart || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) throw new Error("Pick a start date.");
    const doc = docsFor(province)[0];
    const answers = Array.isArray(data.answers) ? data.answers.map((row) => String(row || "").slice(0, 800)) : [];
    const template = kind === "month" ? monthPlan(province, periodStart) : weekPlan(province, periodStart);
    const statement = buildStatement({
      doc,
      centreName: centre[0]?.name || "Our centre",
      answers,
      goalLabels: goalsFor(province).map((goal) => goal.en),
    });
    const body = kind === "statement" ? statement.text : JSON.stringify(template);
    const reminder = reviewReminder(doc, periodStart);
    const id = nid("plan");
    const room = String(data.room || "").slice(0, 80);
    await sql`
      insert into curriculum_plans (
        id, daycare_id, province, kind, period_start, room_label, body, goal_ids, author_user_id, review_due_on
      ) values (
        ${id}, ${daycareId}, ${province}, ${kind}, ${periodStart}, ${room}, ${body},
        ${JSON.stringify(goalsFor(province).map((goal) => goal.id))}::jsonb, ${context.userId},
        ${reminder.dueOn || null}
      )
      on conflict (daycare_id, kind, period_start, room_label) do update
      set body = excluded.body, review_due_on = excluded.review_due_on, updated_at = now()
    `;
    if (reminder.dueOn) {
      await sql`
        insert into curriculum_reminder_log (id, daycare_id, plan_id, kind, due_on, note)
        values (
          ${nid("log")}, ${daycareId}, ${id}, ${"annual_review"}, ${reminder.dueOn},
          ${reminder.reviewStatus === "confirmed" ? "Yearly review is in the rule. KidEase only logs it." : "Yearly reminder only. A legal duty to review on this date was not confirmed."}
        )
        on conflict (daycare_id, plan_id, kind, due_on) do nothing
      `;
    }
    return { ok: true as const, id, body, reminder };
  });

export const curriculumCoverage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!curriculumPackEnabled()) return { enabled: false as const };
    const sql = await assertCentre(context.userId, data.daycareId);
    const centre = await sql<{ province: string | null }>`select province from daycares where id = ${data.daycareId} limit 1`;
    const province = normalizeProvince(centre[0]?.province);
    if (!province) return { enabled: true as const, province: null, report: null };
    const children = await sql
      .query<{ id: string; name: string; room: string | null }>(
        `select distinct c.id, c.name, r.name as room
         from bookings b
         join children c on c.id = b.child_id
         left join care_child_room_assignments a on a.booking_id = b.id
         left join care_rooms r on r.id = a.room_id
         where b.daycare_id = $1 and b.status = any($2::text[])`,
        [data.daycareId, ENROLLED],
      )
      .catch(() => []);
    const stories = await sql
      .query<{ child_id: string; goal_ids: unknown; status: string | null }>(
        `select s.child_id, m.goal_ids, m.status
         from learning_stories s
         join curriculum_story_meta m on m.story_id = s.id
         where s.daycare_id = $1`,
        [data.daycareId],
      )
      .catch(() => []);
    const report = coverageReport({
      province,
      children: children.map((row) => ({ id: row.id, name: row.name, room: row.room || "Unassigned" })),
      stories: stories.map((row) => ({
        childId: row.child_id,
        goalIds: Array.isArray(row.goal_ids) ? row.goal_ids.map(String) : [],
        status: row.status === "published" ? "published" : "draft",
      })),
    });
    return { enabled: true as const, province, report };
  });

export const listCurriculumTimeline = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const flags = gate();
    if (!flags.pack) return { enabled: false as const, live: false as const, stories: [], bookingId: "" };
    const sql = await getSql();
    const booking = await sql
      .query<{ id: string }>(
        `select id from bookings where user_id = $1 and status = any($2::text[]) order by created_at desc limit 1`,
        [context.userId, ENROLLED],
      )
      .catch(() => []);
    const bookingId = booking[0]?.id || "";
    if (flags.mode !== "live") return { enabled: true as const, live: false as const, stories: [], bookingId };
    await ensureCurriculum();
    const rows = await sql
      .query<{
        id: string;
        title: string;
        body: string;
        what_next: string;
        observed_on: string;
        child_name: string;
        owner_id: string;
        enrolled: number;
        home_activity_ids: unknown;
        province: string;
      }>(
        `select s.id, s.title, s.body, m.what_next, s.observed_on::text as observed_on, c.name as child_name,
                c.user_id as owner_id,
                case when b.id is null then 0 else 1 end as enrolled,
                m.home_activity_ids, m.province
         from learning_stories s
         join curriculum_story_meta m on m.story_id = s.id and m.status = 'published'
         join children c on c.id = s.child_id and c.user_id = $1
         left join bookings b on b.child_id = c.id and b.daycare_id = s.daycare_id
           and b.user_id = $1 and b.status = any($2::text[])
         where s.is_private = 1
         order by s.observed_on desc
         limit 40`,
        [context.userId, ENROLLED],
      )
      .catch(() => []);
    return {
      enabled: true as const,
      live: true as const,
      bookingId,
      stories: rows
        .filter((row) =>
          parentMaySeeStory({
            mode: "live",
            status: "published",
            enrolled: Number(row.enrolled) === 1,
            ownsChild: row.owner_id === context.userId,
          }),
        )
        .map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          whatNext: row.what_next || "",
          observedOn: String(row.observed_on).slice(0, 10),
          childName: row.child_name,
          province: row.province,
          ideas: ACTIVITY_LIBRARY.filter((activity) => Array.isArray(row.home_activity_ids) && row.home_activity_ids.includes(activity.id)).map((activity) => ({
            id: activity.id,
            titleEn: activity.titleEn,
            titleFr: activity.titleFr,
            stepsEn: activity.stepsEn,
            stepsFr: activity.stepsFr,
          })),
        })),
    };
  });

export const replyToCurriculumStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { storyId?: string; body?: string }) => input)
  .handler(async ({ context, data }) => {
    if (curriculumMode(curriculumPackEnabled(), curriculumPackLive()) !== "live") throw new Error("Replies open when stories are live.");
    const body = String(data.body || "").trim().slice(0, 1000);
    if (body.length < 2) throw new Error("Write a short reply.");
    const sql = await getSql();
    const storyId = String(data.storyId || "");
    const rows = await sql.query<{ ok: number }>(
      `select 1 as ok
       from learning_stories s
       join curriculum_story_meta m on m.story_id = s.id and m.status = 'published'
       join children c on c.id = s.child_id and c.user_id = $2
       join bookings b on b.child_id = c.id and b.daycare_id = s.daycare_id and b.user_id = $2 and b.status = any($3::text[])
       where s.id = $1 and s.is_private = 1
       limit 1`,
      [storyId, context.userId, ENROLLED],
    );
    if (!rows[0]) throw new Error("That story is not yours.");
    await sql`
      insert into curriculum_replies (id, story_id, parent_user_id, body)
      values (${nid("reply")}, ${storyId}, ${context.userId}, ${body})
    `;
    return { ok: true as const };
  });

export const governmentCurriculumTotals = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "").trim() }))
  .handler(async ({ data }) => {
    if (!curriculumPackEnabled()) return { enabled: false as const, live: false as const, rows: [] };
    const province = normalizeProvince(data.province);
    const sql = await getSql();
    await ensureCurriculum();
    const rows = await sql
      .query<{ province: string; goal_ids: unknown }>(
        `select d.province, m.goal_ids
         from curriculum_story_meta m
         join daycares d on d.id = m.daycare_id
         where m.status = 'published'`,
      )
      .catch(() => []);
    const counts = new Map<string, number>();
    let children = 0;
    for (const row of rows) {
      const code = normalizeProvince(row.province);
      if (!code || (province && code !== province)) continue;
      children += 1;
      const goals = Array.isArray(row.goal_ids) ? row.goal_ids.map(String) : [];
      for (const goalId of goals) counts.set(goalId, (counts.get(goalId) || 0) + 1);
    }
    const aggregate = anonymiseCoverage({
      province: province || "BC",
      childCount: children,
      coveredCounts: [...counts.entries()].map(([goalId, n]) => ({ goalId, children: n })),
    });
    return {
      enabled: true as const,
      live: curriculumPackLive(),
      preview: !curriculumPackLive(),
      province: province || "ALL",
      childCount: aggregate.childCount,
      goals: aggregate.goals.map((goal) => ({
        goalId: goal.goalId,
        label: GOAL_LIBRARY.find((row) => row.id === goal.goalId)?.en || "",
        children: goal.children,
      })),
    };
  });

async function readManifest(): Promise<StoredBook[]> {
  const path = join(process.cwd(), "data/story-corner/manifest.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { books?: StoredBook[] };
    return Array.isArray(parsed.books) ? parsed.books : [];
  } catch {
    return [];
  }
}

export const listStoryCorner = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string; language?: string } | undefined) => ({
    province: String(input?.province || "").trim(),
    language: input?.language === "fr" ? "fr" : input?.language === "all" ? "all" : "en",
  }))
  .handler(async ({ data }) => {
    if (!storyCornerEnabled()) {
      return { enabled: false as const, books: [], unite: uniteForLiteracy() };
    }
    const province = normalizeProvince(data.province);
    const language = data.language === "all" ? undefined : data.language === "fr" ? "fr" : "en";
    const books = shelfBooks(await readManifest(), { language, province }).filter(creditVisible);
    return {
      enabled: true as const,
      books: books.map((book) => ({
        id: book.id,
        title: book.title,
        language: book.language,
        age: book.age,
        credit: book.credit,
        licenceUrl: book.licenceUrl,
        logoPath: book.logoPath,
        attributionUrl: book.attributionUrl,
        changeNote: book.changeNote,
        source: book.source,
        goalIds: province ? book.goalIds.filter((id) => id.startsWith(`${province}-`)) : book.goalIds,
      })),
      unite: uniteForLiteracy(),
    };
  });

export const openStoryCornerFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ data }) => {
    if (!storyCornerEnabled()) return { ok: false as const, reason: "off" };
    const books = await readManifest();
    const book = books.find((row) => row.id === data.id);
    if (!book || !creditVisible(book) || !readerFileAllowed(book.localPath)) return { ok: false as const, reason: "missing" };
    try {
      const bytes = new Uint8Array(await readFile(join(process.cwd(), book.localPath)));
      if (!shaMatches(bytes, book.sha256)) return { ok: false as const, reason: "hash" };
      if (bytes.byteLength > 4_000_000) return { ok: false as const, reason: "large" };
      return { ok: true as const, mime: book.localPath.endsWith(".pdf") ? "application/pdf" : "application/octet-stream", bodyBase64: Buffer.from(bytes).toString("base64") };
    } catch {
      return { ok: false as const, reason: "missing" };
    }
  });
