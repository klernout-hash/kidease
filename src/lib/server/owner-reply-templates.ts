import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteLeads } from "@/lib/centre-roles";
import { getSql, type Sql } from "@/lib/db";
import { ownerReplyTemplatesEnabled } from "@/lib/features";
import { mergeOwnerTemplates, parseOwnerTemplate, type OwnerReplyTemplate } from "@/lib/owner-reply-templates";
import { loadCentreRole } from "@/lib/server/centre-access";

const ENSURE = `create table if not exists centre_reply_templates (
  daycare_id text not null,
  locale text not null,
  template_id text not null,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (daycare_id, locale, template_id)
)`;

let ensured = false;

async function ensure(sql: Sql) {
  if (ensured) return;
  await sql.query(ENSURE);
  ensured = true;
}

async function canEdit(userId: string, daycareId: string) {
  const sql = await getSql();
  const role = await loadCentreRole(sql, userId, daycareId);
  return centreCanWriteLeads(role) && role !== "staff" && role !== "read_only";
}

export const listOwnerReplyTemplates = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; locale: string }) => input)
  .handler(async ({ context, data }) => {
    const locale = data.locale === "fr" ? "fr" : "en";
    if (!ownerReplyTemplatesEnabled()) return { enabled: false as const, templates: [] as OwnerReplyTemplate[] };
    const daycareId = String(data.daycareId || "").trim().slice(0, 80);
    if (!daycareId) return { enabled: true as const, templates: mergeOwnerTemplates(locale, []) };
    const sql = await getSql();
    const role = await loadCentreRole(sql, context.userId, daycareId);
    if (!centreCanWriteLeads(role)) return { enabled: true as const, templates: mergeOwnerTemplates(locale, []) };
    try {
      await ensure(sql);
      const rows = await sql<{ template_id: string; title: string; body: string }>`
        select template_id, title, body from centre_reply_templates
        where daycare_id = ${daycareId} and locale = ${locale}
      `;
      return {
        enabled: true as const,
        templates: mergeOwnerTemplates(
          locale,
          rows.map((row) => ({ id: row.template_id, title: row.title, body: row.body })),
        ),
      };
    } catch {
      return { enabled: true as const, templates: mergeOwnerTemplates(locale, []) };
    }
  });

export const saveOwnerReplyTemplate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; locale: string; id: string; title: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    if (!ownerReplyTemplatesEnabled()) return { ok: false as const, reason: "off" as const };
    const daycareId = String(data.daycareId || "").trim().slice(0, 80);
    const locale = data.locale === "fr" ? "fr" : "en";
    const parsed = parseOwnerTemplate(data);
    if (!daycareId || !parsed) return { ok: false as const, reason: "invalid" as const };
    if (!(await canEdit(context.userId, daycareId))) return { ok: false as const, reason: "forbidden" as const };
    const sql = await getSql();
    await ensure(sql);
    await sql`
      insert into centre_reply_templates (daycare_id, locale, template_id, title, body, updated_at)
      values (${daycareId}, ${locale}, ${parsed.id}, ${parsed.title}, ${parsed.body}, now())
      on conflict (daycare_id, locale, template_id) do update set
        title = excluded.title,
        body = excluded.body,
        updated_at = now()
    `;
    return { ok: true as const, template: parsed };
  });
