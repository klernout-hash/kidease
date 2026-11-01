import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import { evaluateFeatureFlag } from "@/lib/flags";
import type { GovActor } from "@/lib/server/gov-actor.server";
import {
  centreDelivery,
  defaultChannelPrefs,
  markRead,
  notificationCentreEnabled,
  notificationCentreMode,
  parseChannelPrefs,
} from "@/lib/wiring/notification-centre";
import { smsFacts } from "@/lib/server/wiring/runtime";
import { automationQuietNow } from "@/lib/automations";

async function listFor(userId: string) {
  const sql = await getSql();
  return sql<{
    id: string;
    title: string;
    body: string;
    href: string;
    feature: string;
    created_at: string;
    read_at: string | null;
    read_by: string | null;
  }>`
    select id, title, body, href, feature, created_at, read_at, read_by
    from role_inbox
    where user_id = ${userId}
    order by created_at desc
    limit 50
  `.catch(() => []);
}

export const notificationDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!notificationCentreEnabled()) return { enabled: false as const, rows: [], prefs: defaultChannelPrefs(), pushLive: false };
    const sql = await getSql();
    const prefs = await sql<{ channel: string; enabled: number }>`
      select channel, enabled from notification_channel_prefs where user_id = ${context.userId}
    `.catch(() => []);
    const stored = defaultChannelPrefs();
    for (const row of prefs) {
      if (row.channel in stored) stored[row.channel as keyof typeof stored] = Number(row.enabled) === 1;
    }
    return {
      enabled: true as const,
      rows: await listFor(context.userId),
      prefs: stored,
      pushLive: evaluateFeatureFlag("FEATURE_PUSH"),
      mode: notificationCentreMode(),
    };
  });

export const saveNoticePrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prefs?: unknown }) => ({ prefs: parseChannelPrefs(input?.prefs) }))
  .handler(async ({ context, data }) => {
    if (!notificationCentreEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const sms = await smsFacts(context.userId);
    const prefs = { ...data.prefs };
    if (prefs.sms && !sms.granted) prefs.sms = false;
    for (const [channel, enabled] of Object.entries(prefs)) {
      await sql`
        insert into notification_channel_prefs (user_id, channel, enabled)
        values (${context.userId}, ${channel}, ${enabled ? 1 : 0})
        on conflict (user_id, channel) do update set enabled = excluded.enabled
      `;
    }
    const plan = centreDelivery({
      mode: notificationCentreMode(),
      prefs,
      featureSms: evaluateFeatureFlag("FEATURE_SMS"),
      smsConsent: sms.granted,
      addressBlocked: sms.blocked,
      quiet: automationQuietNow(new Date()),
      featurePush: evaluateFeatureFlag("FEATURE_PUSH"),
    });
    return { ok: true as const, prefs, plan };
  });

export const readNotice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!notificationCentreEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const rows = await sql<{ user_id: string; read_at: string | null }>`
      select user_id, read_at from role_inbox where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "missing" };
    const receipt = markRead({
      readerId: context.userId,
      ownerId: row.user_id,
      already: row.read_at ? String(row.read_at) : null,
      now: new Date().toISOString(),
    });
    if ("error" in receipt) return { ok: false as const, error: receipt.error };
    await sql`
      update role_inbox set read_at = ${receipt.readAt}, read_by = ${receipt.readBy} where id = ${data.id}
    `;
    return { ok: true as const, readAt: receipt.readAt, readBy: receipt.readBy };
  });

export const govNotificationDesk = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    if (!notificationCentreEnabled()) return { enabled: false as const, rows: [] };
    const gov = context.gov as GovActor;
    const sql = await getSql();
    const rows = await sql<{ id: string; title: string; body: string; href: string; read_at: string | null }>`
      select id, title, body, href, read_at
      from role_inbox
      where user_id = ${gov.userId}
      order by created_at desc
      limit 50
    `.catch(() => [] as { id: string; title: string; body: string; href: string; read_at: string | null }[]);
    return { enabled: true as const, rows };
  });
