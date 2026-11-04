/**
 * Persist and deliver unified alerts.
 * FEATURE_UNIFIED_ALERTS defaults off. FEATURE_UNIFIED_ALERTS_LIVE gates email and push.
 * Preview and tests never send. Push uses the existing FEATURE_PUSH path only.
 * SMS is not used. Call push is not used.
 */

import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { pushArmed } from "@/lib/channel-readiness";
import { unifiedAlertsEnabled, unifiedAlertsLive } from "@/lib/features";
import { isSuppressed } from "@/lib/server/email-suppressions";
import { lookupUser } from "@/lib/server/notify";
import { planUnifiedScan } from "@/lib/unified-alert-scan";
import {
  alertText,
  decideUnifiedAlert,
  defaultUnifiedSettings,
  digestReady,
  isUnifiedAlertType,
  normalizeAlertLocale,
  planPluginHook,
  publicCentreName,
  safeUnifiedHref,
  safetyBlocksAlert,
  unifiedAlertType,
  unifiedDeliveryBlocked,
  type DigestMode,
  type PluginHook,
  type UnifiedAudience,
  type UnifiedCandidate,
  type UnifiedSettings,
} from "@/lib/unified-alerts";
import { loadUnifiedFacts } from "@/lib/server/unified-alert-load";

type Sql = Awaited<ReturnType<typeof getSql>>;

const ENSURE_SQL = `
create table if not exists unified_alert_settings (
  user_id text primary key,
  master_enabled int not null default 1,
  in_app int not null default 1,
  email_on int not null default 1,
  push_on int not null default 0,
  quiet_start text not null default '21:00',
  quiet_end text not null default '08:00',
  quiet_custom int not null default 0,
  time_zone text not null default 'America/Winnipeg',
  digest text not null default 'off',
  updated_at timestamptz not null default now()
);
create table if not exists unified_alert_prefs (
  user_id text not null,
  type_id text not null,
  enabled int not null default 1,
  primary key (user_id, type_id)
);
create table if not exists unified_alert_events (
  id text primary key,
  user_id text not null,
  type_id text not null,
  audience text not null,
  locale text not null default 'en',
  title text not null,
  body text not null,
  href text not null,
  dedupe_key text not null,
  daycare_id text,
  counterparty_user_id text,
  critical int not null default 0,
  status text not null default 'inbox',
  channels text not null default 'in_app',
  read_at timestamptz,
  emailed_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists unified_alert_events_dedupe
  on unified_alert_events (user_id, dedupe_key);
`;

let ensured = false;

async function ensure(sql: Sql) {
  if (ensured) return;
  try {
    await sql.query(ENSURE_SQL);
    ensured = true;
  } catch {
    /* next call retries */
  }
}

function on(value: unknown): boolean {
  return !(value === 0 || value === false || value === "0");
}

function digestOf(value: string | null | undefined): DigestMode {
  return value === "daily" || value === "weekly" ? value : "off";
}

export async function readUnifiedSettings(userId: string, audience: UnifiedAudience): Promise<UnifiedSettings> {
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{
    master_enabled: number | boolean;
    in_app: number | boolean;
    email_on: number | boolean;
    push_on: number | boolean;
    quiet_start: string;
    quiet_end: string;
    quiet_custom: number | boolean;
    time_zone: string;
    digest: string;
  }>`
    select master_enabled, in_app, email_on, push_on, quiet_start, quiet_end, quiet_custom, time_zone, digest
    from unified_alert_settings where user_id = ${userId} limit 1
  `.catch(() => []);
  const zoneRows = await sql<{ time_zone: string | null; locale: string | null }>`
    select time_zone, locale from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ time_zone: string | null; locale: string | null }>);
  const base = defaultUnifiedSettings(audience, zoneRows[0]?.time_zone);
  const row = rows[0];
  if (!row) return base;
  return {
    master: on(row.master_enabled),
    inApp: on(row.in_app),
    email: on(row.email_on),
    push: on(row.push_on),
    quietStart: row.quiet_start || base.quietStart,
    quietEnd: row.quiet_end || base.quietEnd,
    quietCustom: on(row.quiet_custom),
    timeZone: row.time_zone || base.timeZone,
    digest: digestOf(row.digest),
  };
}

export async function writeUnifiedSettings(
  userId: string,
  settings: UnifiedSettings,
  prefs: Array<{ typeId: string; enabled: boolean }>,
): Promise<void> {
  const sql = await getSql();
  await ensure(sql);
  await sql`
    insert into unified_alert_settings (
      user_id, master_enabled, in_app, email_on, push_on, quiet_start, quiet_end, quiet_custom, time_zone, digest, updated_at
    ) values (
      ${userId},
      ${settings.master ? 1 : 0},
      ${settings.inApp ? 1 : 0},
      ${settings.email ? 1 : 0},
      ${settings.push ? 1 : 0},
      ${settings.quietStart},
      ${settings.quietEnd},
      ${settings.quietCustom ? 1 : 0},
      ${settings.timeZone},
      ${settings.digest},
      now()
    )
    on conflict (user_id) do update set
      master_enabled = excluded.master_enabled,
      in_app = excluded.in_app,
      email_on = excluded.email_on,
      push_on = excluded.push_on,
      quiet_start = excluded.quiet_start,
      quiet_end = excluded.quiet_end,
      quiet_custom = excluded.quiet_custom,
      time_zone = excluded.time_zone,
      digest = excluded.digest,
      updated_at = now()
  `;
  for (const pref of prefs) {
    if (!isUnifiedAlertType(pref.typeId)) continue;
    await sql`
      insert into unified_alert_prefs (user_id, type_id, enabled)
      values (${userId}, ${pref.typeId}, ${pref.enabled ? 1 : 0})
      on conflict (user_id, type_id) do update set enabled = excluded.enabled
    `;
  }
}

async function typeEnabled(sql: Sql, userId: string, typeId: string): Promise<boolean> {
  const rows = await sql<{ enabled: number | boolean }>`
    select enabled from unified_alert_prefs where user_id = ${userId} and type_id = ${typeId} limit 1
  `.catch(() => [] as Array<{ enabled: number | boolean }>);
  if (!rows.length) return true;
  return on(rows[0]?.enabled);
}

async function prefMap(sql: Sql, userId: string): Promise<Record<string, boolean>> {
  const rows = await sql<{ type_id: string; enabled: number | boolean }>`
    select type_id, enabled from unified_alert_prefs where user_id = ${userId}
  `.catch(() => [] as Array<{ type_id: string; enabled: number | boolean }>);
  const out: Record<string, boolean> = {};
  for (const row of rows) out[row.type_id] = on(row.enabled);
  return out;
}

async function blockedPair(sql: Sql, candidate: UnifiedCandidate): Promise<boolean> {
  const type = unifiedAlertType(candidate.typeId);
  if (!type?.respectBlocks) return false;
  const rows = await sql<{ blocker_user_id: string; blocked_user_id: string | null; daycare_id: string | null }>`
    select blocker_user_id, blocked_user_id, daycare_id
    from safety_blocks
    where blocker_user_id = ${candidate.userId}
       or blocked_user_id = ${candidate.userId}
       or blocker_user_id = ${candidate.counterpartyUserId || ""}
    limit 40
  `.catch(() => []);
  return safetyBlocksAlert({
    blocks: rows.map((row) => ({
      blockerUserId: row.blocker_user_id,
      blockedUserId: row.blocked_user_id,
      daycareId: row.daycare_id,
    })),
    recipientUserId: candidate.userId,
    counterpartyUserId: candidate.counterpartyUserId,
    daycareId: candidate.daycareId,
  });
}

export type UnifiedEvent = {
  id: string;
  typeId: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  critical: boolean;
  webOnly: boolean;
};

export async function listUnifiedEvents(userId: string, native: boolean): Promise<UnifiedEvent[]> {
  if (!unifiedAlertsEnabled()) return [];
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{
    id: string;
    type_id: string;
    title: string;
    body: string;
    href: string;
    created_at: string | Date;
    read_at: string | Date | null;
    critical: number | boolean;
    audience: string;
  }>`
    select id, type_id, title, body, href, created_at, read_at, critical, audience
    from unified_alert_events
    where user_id = ${userId}
    order by created_at desc
    limit 40
  `.catch(() => []);
  return rows
    .filter((row) => !(native && (row.audience === "admin" || unifiedAlertType(row.type_id)?.webOnly)))
    .map((row) => ({
      id: row.id,
      typeId: row.type_id,
      title: row.title,
      body: row.body,
      href: safeUnifiedHref(row.href),
      createdAt: iso(row.created_at),
      readAt: row.read_at ? iso(row.read_at) : null,
      critical: on(row.critical),
      webOnly: row.audience === "admin" || Boolean(unifiedAlertType(row.type_id)?.webOnly),
    }));
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function countUnreadUnifiedAlerts(userId: string): Promise<number> {
  if (!unifiedAlertsEnabled()) return 0;
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from unified_alert_events
    where user_id = ${userId} and read_at is null
  `.catch(() => [] as Array<{ n: number }>);
  const n = Number(rows[0]?.n || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, Math.floor(n));
}

export async function markUnifiedRead(userId: string, input: { id?: string; all?: boolean }): Promise<void> {
  const sql = await getSql();
  await ensure(sql);
  if (input.all) {
    await sql`
      update unified_alert_events set read_at = now()
      where user_id = ${userId} and read_at is null
    `.catch(() => undefined);
    return;
  }
  if (input.id) {
    await sql`
      update unified_alert_events set read_at = now()
      where id = ${input.id} and user_id = ${userId} and read_at is null
    `.catch(() => undefined);
  }
}

async function localeFor(sql: Sql, userId: string): Promise<"en" | "fr"> {
  const rows = await sql<{ locale: string | null }>`
    select locale from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ locale: string | null }>);
  return normalizeAlertLocale(rows[0]?.locale);
}

export async function emitUnifiedAlert(candidate: UnifiedCandidate): Promise<{ status: string; reason?: string }> {
  const blockedEnv = unifiedDeliveryBlocked(process.env);
  if (!unifiedAlertsEnabled()) return { status: "skipped", reason: "flag" };
  if (blockedEnv) return { status: "skipped", reason: blockedEnv };
  const type = unifiedAlertType(candidate.typeId);
  if (!type || !candidate.userId) return { status: "skipped", reason: "unknown" };
  const sql = await getSql();
  await ensure(sql);
  const audience: UnifiedAudience = type.audience === "admin" ? "admin" : type.audience;
  const settings = await readUnifiedSettings(candidate.userId, audience === "admin" ? "parent" : audience);
  const enabled = await typeEnabled(sql, candidate.userId, candidate.typeId);
  const blocked = await blockedPair(sql, candidate);
  const decision = decideUnifiedAlert({
    typeId: candidate.typeId,
    settings,
    typeEnabled: enabled,
    flagOn: true,
    live: unifiedAlertsLive(),
    pushArmed: pushArmed(),
    previewOrTest: false,
    blocked,
    duplicate: false,
    shift: candidate.shift,
    forceCritical: candidate.typeId === "staff_ratio" ? candidate.status === "over" : undefined,
  });
  if (decision.action === "skip") return { status: "skipped", reason: decision.reason };
  const locale = await localeFor(sql, candidate.userId);
  const text = alertText(candidate.typeId, locale, { name: candidate.name, status: candidate.status });
  const id = nid("ual");
  const inserted = await sql<{ id: string }>`
    insert into unified_alert_events (
      id, user_id, type_id, audience, locale, title, body, href, dedupe_key,
      daycare_id, counterparty_user_id, critical, status, channels
    ) values (
      ${id},
      ${candidate.userId},
      ${candidate.typeId},
      ${type.audience},
      ${locale},
      ${text.title},
      ${text.body},
      ${safeUnifiedHref(candidate.href)},
      ${candidate.dedupeKey.slice(0, 180)},
      ${candidate.daycareId || null},
      ${candidate.counterpartyUserId || null},
      ${decision.channels.length && (type.critical || candidate.status === "over") ? 1 : 0},
      ${decision.status},
      ${decision.channels.join(",")}
    )
    on conflict (user_id, dedupe_key) do nothing
    returning id
  `.catch(() => [] as Array<{ id: string }>);
  if (!inserted.length) return { status: "skipped", reason: "duplicate" };
  if (decision.outbound === "now") {
    await deliverOutbound(candidate.userId, text, safeUnifiedHref(candidate.href), decision.channels);
    if (decision.channels.includes("email") || decision.channels.includes("push")) {
      await sql`
        update unified_alert_events
        set emailed_at = case when ${decision.channels.includes("email") ? 1 : 0} = 1 then now() else emailed_at end,
            pushed_at = case when ${decision.channels.includes("push") ? 1 : 0} = 1 then now() else pushed_at end
        where id = ${id}
      `.catch(() => undefined);
    }
  }
  return { status: "recorded", reason: decision.status };
}

async function deliverOutbound(
  userId: string,
  text: { title: string; body: string },
  href: string,
  channels: string[],
): Promise<void> {
  if (unifiedDeliveryBlocked(process.env) || !unifiedAlertsLive()) return;
  if (channels.includes("email")) {
    const user = await lookupUser(userId).catch(() => null);
    const email = user?.email?.trim() || "";
    if (email && !(await isSuppressed(email).catch(() => false))) {
      const { sendTransactionalMail } = await import("@/lib/transactional-mail");
      const safeBody = text.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await sendTransactionalMail({
        purpose: "customer_alert",
        to: email,
        subject: text.title,
        text: text.body,
        html: `<p>${safeBody}</p>`,
      }).catch(() => undefined);
    }
  }
  if (channels.includes("push") && pushArmed()) {
    const { sendPushNotification } = await import("@/lib/server/push.server");
    await sendPushNotification({ userId, title: text.title, body: text.body, url: href }).catch(() => undefined);
  }
}

export async function emitPluginHook(input: Parameters<typeof planPluginHook>[0] & { hook: PluginHook | string }) {
  const candidate = planPluginHook(input);
  if (!candidate) return { status: "skipped", reason: "hook" };
  return emitUnifiedAlert(candidate);
}

export async function emitMessageAlert(input: {
  messageId: string;
  sender: "parent" | "provider";
  parentUserId: string;
  daycareId: string;
  centreName: string;
}): Promise<void> {
  if (!unifiedAlertsEnabled() || unifiedDeliveryBlocked(process.env)) return;
  let centreName = input.centreName;
  if (!centreName.trim()) {
    const sql = await getSql();
    const named = await sql<{ name: string }>`
      select name from daycares where id = ${input.daycareId} limit 1
    `.catch(() => [] as Array<{ name: string }>);
    centreName = named[0]?.name || "";
  }
  const name = publicCentreName(centreName, "en");
  if (input.sender === "provider") {
    await emitUnifiedAlert({
      typeId: "parent_new_message",
      userId: input.parentUserId,
      dedupeKey: `parent_new_message:${input.messageId}`,
      name,
      status: "",
      href: "/inbox",
      daycareId: input.daycareId,
    });
    return;
  }
  const sql = await getSql();
  const owners = await sql<{ user_id: string }>`
    select user_id from centre_members
    where daycare_id = ${input.daycareId} and status = 'active' and role in ('owner', 'manager')
    limit 8
  `.catch(() => [] as Array<{ user_id: string }>);
  const extra = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${input.daycareId} limit 4
  `.catch(() => [] as Array<{ user_id: string }>);
  const ids = [...new Set([...owners, ...extra].map((row) => row.user_id))];
  for (const userId of ids) {
    await emitUnifiedAlert({
      typeId: "daycare_new_message",
      userId,
      dedupeKey: `daycare_new_message:${input.messageId}`,
      name,
      status: "",
      href: "/inbox",
      daycareId: input.daycareId,
      counterpartyUserId: input.parentUserId,
    });
  }
}

export async function runUnifiedAlertScan(now = new Date()): Promise<{ scanned: number; recorded: number }> {
  if (!unifiedAlertsEnabled() || unifiedDeliveryBlocked(process.env)) return { scanned: 0, recorded: 0 };
  const facts = await loadUnifiedFacts(now);
  const planned = planUnifiedScan(facts);
  let recorded = 0;
  for (const candidate of planned) {
    const result = await emitUnifiedAlert(candidate);
    if (result.status === "recorded") recorded += 1;
  }
  await releaseHeld(now);
  return { scanned: planned.length, recorded };
}

async function releaseHeld(now: Date): Promise<void> {
  if (!unifiedAlertsLive() || unifiedDeliveryBlocked(process.env)) return;
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    type_id: string;
    title: string;
    body: string;
    href: string;
    status: string;
    channels: string;
  }>`
    select id, user_id, type_id, title, body, href, status, channels
    from unified_alert_events
    where status in ('held', 'digest')
      and created_at > now() - interval '8 days'
    order by created_at asc
    limit 80
  `.catch(() => []);
  for (const row of rows) {
    const type = unifiedAlertType(row.type_id);
    const settings = await readUnifiedSettings(row.user_id, type?.audience === "staff" ? "staff" : "parent");
    const ready = digestReady({
      digest: settings.digest,
      status: row.status === "digest" ? "digest" : "held",
      now,
      timeZone: settings.timeZone,
      quietStart: settings.quietStart,
      quietEnd: settings.quietEnd,
      staffShiftQuiet: type?.audience === "staff" && !settings.quietCustom,
    });
    if (!ready) continue;
    const channels = row.channels.split(",").filter(Boolean);
    await deliverOutbound(row.user_id, { title: row.title, body: row.body }, safeUnifiedHref(row.href), channels);
    await sql`
      update unified_alert_events
      set status = 'inbox', emailed_at = coalesce(emailed_at, now())
      where id = ${row.id}
    `.catch(() => undefined);
  }
}

export async function audiencesFor(userId: string): Promise<UnifiedAudience[]> {
  const sql = await getSql();
  const profile = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ role: string | null }>);
  const role = profile[0]?.role || "parent";
  const owned = await sql<{ user_id: string }>`
    select user_id from provider_daycares where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ user_id: string }>);
  const member = await sql<{ role: string }>`
    select role from centre_members where user_id = ${userId} and status = 'active' limit 4
  `.catch(() => [] as Array<{ role: string }>);
  const gov = await sql<{ user_id: string }>`
    select user_id from government_members where user_id = ${userId} and status = 'active' limit 1
  `.catch(() => [] as Array<{ user_id: string }>);
  const set = new Set<UnifiedAudience>();
  if (role === "parent" || role === "admin" || role === "government" || !owned.length) set.add("parent");
  if (role === "provider" || owned.length || member.some((row) => row.role === "owner" || row.role === "manager")) {
    set.add("daycare");
  }
  if (member.some((row) => row.role === "staff" || row.role === "manager")) set.add("staff");
  if (role === "government" || gov.length || role === "admin") set.add("admin");
  if (!set.size) set.add("parent");
  return [...set];
}

export async function unifiedDesk(userId: string, native: boolean) {
  const audiences = (await audiencesFor(userId)).filter((audience) => !(native && audience === "admin"));
  const primary = audiences.includes("staff") ? "staff" : audiences.includes("daycare") ? "daycare" : "parent";
  const settings = await readUnifiedSettings(userId, primary);
  const sql = await getSql();
  await ensure(sql);
  const prefs = await prefMap(sql, userId);
  const events = await listUnifiedEvents(userId, native);
  return {
    enabled: unifiedAlertsEnabled(),
    live: unifiedAlertsLive(),
    pushArmed: pushArmed(),
    audiences,
    settings,
    prefs,
    events,
  };
}
