import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { defaultNoticePrefs, lifecycleEnabled, type NoticePrefs } from "@/lib/lifecycle";

function readPrefs(raw: unknown): NoticePrefs {
  const base = defaultNoticePrefs();
  if (!raw || typeof raw !== "object") return base;
  const body = raw as Partial<NoticePrefs>;
  for (const key of ["tours", "messages", "spots", "account", "tips"] as const) {
    const row = body[key];
    if (!row) continue;
    base[key] = { email: Boolean(row.email), sms: Boolean(row.sms) };
  }
  base.tips.sms = false;
  base.unsubscribedAll = Boolean(body.unsubscribedAll);
  return base;
}

export const loadLifecyclePrefs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!lifecycleEnabled()) return { enabled: false as const, prefs: defaultNoticePrefs() };
    const sql = await getSql();
    const rows = await sql<{ prefs: unknown }>`
      select prefs from lifecycle_prefs where user_id = ${context.userId} limit 1
    `;
    return { enabled: true as const, prefs: readPrefs(rows[0]?.prefs) };
  });

export const saveLifecyclePrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: NoticePrefs) => input)
  .handler(async ({ context, data }) => {
    if (!lifecycleEnabled()) return { ok: false as const, reason: "off" as const };
    const prefs = readPrefs(data);
    const sql = await getSql();
    await sql`
      insert into lifecycle_prefs (user_id, prefs, updated_at)
      values (${context.userId}, ${JSON.stringify(prefs)}::jsonb, now())
      on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now()
    `;
    return { ok: true as const, prefs };
  });
