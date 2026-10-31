import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { learningPortfoliosEnabled } from "@/lib/features";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { parentMayReadStory, parseStory } from "@/lib/learning-stories";
import { nid } from "@/lib/utils";

const ENROLLED = ENROLLED_BOOKING_STATUSES;

async function ensureStories() {
  const sql = await getSql();
  await sql`
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
    )
  `.catch(() => undefined);
}

async function assertCentre(userId: string, daycareId: string) {
  const sql = await getSql();
  const ids = await listAccessibleDaycareIds(sql, userId);
  if (!ids.includes(daycareId)) throw new Error("This centre is not yours.");
}

export const storiesStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: learningPortfoliosEnabled() }));

export const listCentreStories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!learningPortfoliosEnabled()) return { enabled: false as const, centres: [], children: [], stories: [] };
    const sql = await getSql();
    await ensureStories();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    const centres = ids.length
      ? await sql.query<{ id: string; name: string }>(
          `select id, name from daycares where id = any($1::text[]) order by name`,
          [ids],
        ).catch(() => [])
      : [];
    const daycareId = centres.some((row) => row.id === data.daycareId) ? data.daycareId : centres[0]?.id || "";
    const children = daycareId
      ? await sql.query<{ id: string; name: string }>(
          `select distinct c.id, c.name
           from bookings b
           join children c on c.id = b.child_id
           where b.daycare_id = $1 and b.status = any($2::text[])
           order by c.name`,
          [daycareId, [...ENROLLED]],
        ).catch(() => [])
      : [];
    const stories = daycareId
      ? await sql<{ id: string; child_id: string; title: string; body: string; framework: string; domain: string; observed_on: string }>`
          select id, child_id, title, body, framework, domain, observed_on
          from learning_stories
          where daycare_id = ${daycareId} and is_private = 1
          order by observed_on desc
          limit 40
        `.catch(() => [])
      : [];
    return {
      enabled: true as const,
      daycareId,
      centres,
      children,
      stories: stories.map((row) => ({
        id: row.id,
        childId: row.child_id,
        title: row.title,
        body: row.body,
        framework: row.framework,
        domain: row.domain,
        observedOn: String(row.observed_on).slice(0, 10),
      })),
    };
  });

export const saveLearningStory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } & Parameters<typeof parseStory>[0]) => input)
  .handler(async ({ context, data }) => {
    if (!learningPortfoliosEnabled()) throw new Error("Learning stories are off.");
    const parsed = parseStory(data);
    if (!parsed.ok) throw new Error(parsed.error === "photo" ? "Stories do not take photos." : "Check the story.");
    const daycareId = String(data.daycareId || "").trim();
    await assertCentre(context.userId, daycareId);
    const sql = await getSql();
    const enrolled = await sql.query<{ id: string }>(
      `select c.id from children c
       join bookings b on b.child_id = c.id
       where c.id = $1 and b.daycare_id = $2 and b.status = any($3::text[])
       limit 1`,
      [parsed.story.childId, daycareId, [...ENROLLED]],
    );
    if (!enrolled[0]) throw new Error("That child is not enrolled here.");
    await ensureStories();
    const id = nid("sty");
    await sql`
      insert into learning_stories (
        id, daycare_id, child_id, title, body, framework, domain, observed_on, is_private, author_id
      ) values (
        ${id}, ${daycareId}, ${parsed.story.childId}, ${parsed.story.title}, ${parsed.story.body},
        ${parsed.story.framework}, ${parsed.story.domain}, ${parsed.story.observedOn}, 1, ${context.userId}
      )
    `;
    return { ok: true as const, id };
  });

export const listParentStories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!learningPortfoliosEnabled()) return { enabled: false as const, stories: [] };
    const sql = await getSql();
    await ensureStories();
    const rows = await sql.query<{
      id: string;
      title: string;
      body: string;
      framework: string;
      domain: string;
      observed_on: string;
      child_name: string;
      owner_id: string;
      enrolled: number;
    }>(
      `select s.id, s.title, s.body, s.framework, s.domain, s.observed_on, c.name as child_name,
              c.user_id as owner_id,
              case when b.id is null then 0 else 1 end as enrolled
       from learning_stories s
       join children c on c.id = s.child_id and c.user_id = $1
       left join bookings b on b.child_id = c.id and b.daycare_id = s.daycare_id
         and b.user_id = $1 and b.status = any($2::text[])
       where s.is_private = 1
       order by s.observed_on desc
       limit 40`,
      [context.userId, [...ENROLLED]],
    ).catch(() => []);
    return {
      enabled: true as const,
      stories: rows
        .filter((row) => parentMayReadStory({ enrolled: Number(row.enrolled) === 1, ownsChild: row.owner_id === context.userId }))
        .map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          framework: row.framework,
          domain: row.domain,
          observedOn: String(row.observed_on).slice(0, 10),
          childName: row.child_name,
        })),
    };
  });
