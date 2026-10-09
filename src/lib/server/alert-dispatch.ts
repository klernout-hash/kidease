/**
 * Category prefs, quiet-hours queue, native push, and email fallback.
 * FEATURE_PUSH still gates the device send. Billing never sends while
 * SUBSCRIPTIONS_ENABLED is off. Web subscriptions are stored for later
 * delivery. This file does not invent seats, fees, or police checks.
 */

import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { subscriptionsEnabled } from "@/lib/features";
import { pushArmed } from "@/lib/channel-readiness";
import { isAllowedWebPushEndpoint } from "@/lib/web-push";
import {
  ALERT_CATEGORIES,
  alertEmailLetter,
  alertPushCopy,
  alertQuietNow,
  decideCustomerAlert,
  isAlertCategory,
  isCriticalAlert,
  nextAlertSendAt,
  normalizeAlertLocale,
  prefEnabled,
  safeAlertHref,
  type AlertCategory,
  type AlertLocale,
  type AlertPrefMap,
  type AlertVars,
} from "@/lib/alert-push";
import { ALERT_UNSUB_TTL_MS, signAlertUnsubToken, verifyAlertUnsubToken } from "@/lib/alert-push-token";
import { sendPushNotification } from "@/lib/server/push.server";

type Sql = Awaited<ReturnType<typeof getSql>>;

const ENSURE_SQL = `
create table if not exists notification_prefs (
  user_id text not null,
  category text not null,
  enabled int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
create table if not exists notification_outbox (
  id text primary key,
  user_id text not null,
  category text not null,
  locale text not null default 'en',
  title text not null,
  body text not null,
  href text not null,
  dedupe_key text not null,
  critical int not null default 0,
  email_fallback int not null default 0,
  send_after timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists notification_outbox_user_dedupe
  on notification_outbox (user_id, dedupe_key);
create table if not exists web_push_subscriptions (
  id text primary key,
  user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  locale text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists web_push_subscriptions_endpoint_uidx
  on web_push_subscriptions (endpoint);
`;

export type AlertDispatchResult = {
  status: "skipped" | "held" | "delivered";
  reason?: string;
  pushed: boolean;
  emailed: boolean;
};

type OutboxRow = {
  id: string;
  user_id: string;
  category: string;
  locale: string;
  title: string;
  body: string;
  href: string;
  critical: number | boolean;
  email_fallback: number | boolean;
};

let ensured = false;

async function ensure(sql: Sql) {
  if (ensured) return;
  try {
    await sql.query(ENSURE_SQL);
    ensured = true;
  } catch {
    /* retry on the next call */
  }
}

function flagOn(value: unknown): boolean {
  return !(value === 0 || value === false || value === "0");
}

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

function absoluteHref(href: string): string {
  if (href.startsWith("https://")) return href;
  return `${appOrigin()}${href.startsWith("/") ? href : `/${href}`}`;
}

export function alertUnsubUrl(userId: string, category: AlertCategory): string {
  const secret = (process.env.BETTER_AUTH_SECRET || "").trim();
  const token = signAlertUnsubToken(
    { userId, category, exp: Date.now() + ALERT_UNSUB_TTL_MS },
    secret,
  );
  if (!token) return `${appOrigin()}/unsubscribe`;
  return `${appOrigin()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function readAlertPrefs(userId: string): Promise<AlertPrefMap> {
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{ category: string; enabled: number | boolean }>`
    select category, enabled from notification_prefs where user_id = ${userId}
  `.catch(() => [] as { category: string; enabled: number | boolean }[]);
  const out = {} as AlertPrefMap;
  for (const category of ALERT_CATEGORIES) out[category] = true;
  for (const row of rows) {
    if (isAlertCategory(row.category)) out[row.category] = flagOn(row.enabled);
  }
  return out;
}

export async function writeAlertPrefs(
  userId: string,
  updates: Array<{ category: string; enabled: boolean }>,
): Promise<AlertPrefMap> {
  const sql = await getSql();
  await ensure(sql);
  const paid = subscriptionsEnabled();
  for (const item of updates) {
    if (!isAlertCategory(item.category)) continue;
    if (item.category === "billing" && !paid) continue;
    const enabled = item.enabled ? 1 : 0;
    await sql`
      insert into notification_prefs (user_id, category, enabled, updated_at)
      values (${userId}, ${item.category}, ${enabled}, now())
      on conflict (user_id, category) do update
        set enabled = excluded.enabled, updated_at = now()
    `.catch(() => undefined);
  }
  return readAlertPrefs(userId);
}

async function localeFor(sql: Sql, userId: string, explicit?: AlertLocale): Promise<AlertLocale> {
  if (explicit) return explicit;
  const rows = await sql<{ locale: string | null }>`
    select locale from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as { locale: string | null }[]);
  return normalizeAlertLocale(rows[0]?.locale);
}

function webPushPath(href: string): string {
  const safe = safeAlertHref(href);
  if (safe.startsWith("/")) return safe;
  try {
    const url = new URL(safe);
    return `${url.pathname}${url.search}`.slice(0, 300) || "/notifications";
  } catch {
    return "/notifications";
  }
}

async function deliverChannels(row: OutboxRow): Promise<{ pushed: boolean; emailed: boolean }> {
  const category = isAlertCategory(row.category) ? row.category : null;
  const href = absoluteHref(safeAlertHref(row.href));
  const push = await sendPushNotification({
    userId: row.user_id,
    title: row.title,
    body: row.body,
    url: href,
  }).catch(() => null);
  const { sendWebPushToUser } = await import("@/lib/server/web-push-send");
  const web = await sendWebPushToUser({
    userId: row.user_id,
    title: row.title,
    body: row.body,
    url: webPushPath(row.href),
  }).catch(() => ({ sent: 0 }));
  const pushed = Boolean(push && push.ok && push.sent > 0) || web.sent > 0;
  let emailed = false;
  if (!pushed && category && flagOn(row.email_fallback)) {
    emailed = await sendFallbackEmail(row, href);
  }
  return { pushed, emailed };
}

async function sendFallbackEmail(row: OutboxRow, href: string): Promise<boolean> {
  const category = isAlertCategory(row.category) ? row.category : null;
  if (!category) return false;
  const { lookupUser } = await import("@/lib/server/notify");
  const user = await lookupUser(row.user_id).catch(() => ({ email: null as string | null }));
  const email = String(user.email || "").trim();
  if (!email || !email.includes("@")) return false;
  const { isSuppressed } = await import("@/lib/server/email-suppressions");
  if (await isSuppressed(email).catch(() => false)) return false;
  const locale = normalizeAlertLocale(row.locale);
  const letter = alertEmailLetter({
    title: row.title,
    body: row.body,
    href,
    unsubUrl: alertUnsubUrl(row.user_id, category),
    locale,
  });
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  const sent = await sendTransactionalMail({
    purpose: "customer_alert",
    to: email,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  }).catch(() => null);
  return sent?.status === "sent";
}

async function markSent(sql: Sql, id: string) {
  await sql`update notification_outbox set sent_at = now() where id = ${id}`.catch(() => undefined);
}

async function deliverStored(sql: Sql, row: OutboxRow, now: Date): Promise<{ pushed: boolean; emailed: boolean }> {
  const prefs = await readAlertPrefs(row.user_id);
  const stored = isAlertCategory(row.category) ? prefs[row.category] : false;
  const decision = decideCustomerAlert({
    category: row.category,
    prefEnabled: prefEnabled(stored),
    subscriptionsOn: subscriptionsEnabled(),
    quiet: alertQuietNow(now),
  });
  if (decision.action !== "send") {
    if (decision.action === "skip") await markSent(sql, row.id);
    return { pushed: false, emailed: false };
  }
  const result = await deliverChannels(row);
  await markSent(sql, row.id);
  return result;
}

export async function drainAlertOutbox(opts?: { now?: Date }): Promise<{ drained: number }> {
  const now = opts?.now ?? new Date();
  if (alertQuietNow(now)) return { drained: 0 };
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<OutboxRow>`
    select id, user_id, category, locale, title, body, href, critical, email_fallback
    from notification_outbox
    where sent_at is null and send_after <= ${now}
    order by send_after asc
    limit 40
  `.catch(() => [] as OutboxRow[]);
  let drained = 0;
  for (const row of rows) {
    await deliverStored(sql, row, now);
    drained += 1;
  }
  return { drained };
}

export async function dispatchCustomerAlert(input: {
  userId: string;
  category: AlertCategory;
  vars?: AlertVars;
  href: string;
  dedupeKey: string;
  emailFallback?: boolean;
  locale?: AlertLocale;
  now?: Date;
}): Promise<AlertDispatchResult> {
  const userId = String(input.userId || "").trim();
  if (!userId || userId.startsWith("guest:")) {
    return { status: "skipped", reason: "no_user", pushed: false, emailed: false };
  }
  try {
    const now = input.now ?? new Date();
    await drainAlertOutbox({ now });
    const sql = await getSql();
    await ensure(sql);
    const prefs = await readAlertPrefs(userId);
    const decision = decideCustomerAlert({
      category: input.category,
      prefEnabled: prefEnabled(prefs[input.category]),
      subscriptionsOn: subscriptionsEnabled(),
      quiet: alertQuietNow(now),
    });
    if (decision.action === "skip") {
      return { status: "skipped", reason: decision.reason, pushed: false, emailed: false };
    }
    const locale = await localeFor(sql, userId, input.locale);
    const copy = alertPushCopy(input.category, locale, input.vars);
    const href = safeAlertHref(input.href);
    const dedupeKey = String(input.dedupeKey || "").trim().slice(0, 180);
    if (!dedupeKey) return { status: "skipped", reason: "dedupe", pushed: false, emailed: false };
    const sendAfter = decision.action === "hold" ? nextAlertSendAt(now) : now;
    const id = nid("nao");
    const inserted = await sql<{ id: string }>`
      insert into notification_outbox (
        id, user_id, category, locale, title, body, href, dedupe_key,
        critical, email_fallback, send_after
      ) values (
        ${id}, ${userId}, ${input.category}, ${locale}, ${copy.title}, ${copy.body}, ${href}, ${dedupeKey},
        ${isCriticalAlert(input.category) ? 1 : 0}, ${input.emailFallback ? 1 : 0}, ${sendAfter}
      )
      on conflict (user_id, dedupe_key) do nothing
      returning id
    `.catch(() => [] as { id: string }[]);
    if (!inserted[0]) return { status: "skipped", reason: "duplicate", pushed: false, emailed: false };
    if (decision.action === "hold") return { status: "held", pushed: false, emailed: false };
    const sent = await deliverChannels({
      id,
      user_id: userId,
      category: input.category,
      locale,
      title: copy.title,
      body: copy.body,
      href,
      critical: isCriticalAlert(input.category) ? 1 : 0,
      email_fallback: input.emailFallback ? 1 : 0,
    });
    await markSent(sql, id);
    return { status: "delivered", pushed: sent.pushed, emailed: sent.emailed };
  } catch (err) {
    console.error("[kidease-alert] dispatch failed", err instanceof Error ? err.name : "error");
    return { status: "skipped", reason: "error", pushed: false, emailed: false };
  }
}

export async function applyAlertUnsubscribeToken(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = (process.env.BETTER_AUTH_SECRET || "").trim();
  const payload = verifyAlertUnsubToken(token, secret);
  if (!payload) return { ok: false, error: "This unsubscribe link is invalid or expired." };
  const sql = await getSql();
  await ensure(sql);
  const categories = payload.category === "all" ? [...ALERT_CATEGORIES] : [payload.category];
  for (const category of categories) {
    await sql`
      insert into notification_prefs (user_id, category, enabled, updated_at)
      values (${payload.userId}, ${category}, 0, now())
      on conflict (user_id, category) do update
        set enabled = 0, updated_at = now()
    `.catch(() => undefined);
  }
  return { ok: true };
}

function validEndpoint(raw: string): string | null {
  const value = raw.trim();
  if (!isAllowedWebPushEndpoint(value)) return null;
  return value;
}

function validKey(raw: string, min: number, max: number): string | null {
  const value = raw.trim();
  if (value.length < min || value.length > max) return null;
  if (!/^[A-Za-z0-9_\-+/=]+$/.test(value)) return null;
  return value;
}

export async function upsertWebPushSubscription(
  userId: string,
  input: { endpoint: string; p256dh: string; authKey: string; locale?: string },
): Promise<{ ok: true; id: string } | { ok: false; skipped: true; error: string }> {
  if (!pushArmed()) {
    return { ok: false, skipped: true, error: "Push registration is off." };
  }
  const endpoint = validEndpoint(input.endpoint);
  const p256dh = validKey(input.p256dh, 16, 200);
  const authKey = validKey(input.authKey, 8, 200);
  if (!endpoint || !p256dh || !authKey) {
    return { ok: false, skipped: true, error: "A valid web push subscription is required." };
  }
  const sql = await getSql();
  await ensure(sql);
  const locale = normalizeAlertLocale(input.locale);
  const existing = await sql<{ id: string }>`
    select id from web_push_subscriptions where endpoint = ${endpoint} limit 1
  `.catch(() => [] as { id: string }[]);
  if (existing[0]) {
    await sql`
      update web_push_subscriptions
      set user_id = ${userId}, p256dh = ${p256dh}, auth_key = ${authKey}, locale = ${locale}, last_seen_at = now()
      where id = ${existing[0].id}
    `;
    return { ok: true, id: existing[0].id };
  }
  const id = nid("wps");
  try {
    await sql`
      insert into web_push_subscriptions (id, user_id, endpoint, p256dh, auth_key, locale)
      values (${id}, ${userId}, ${endpoint}, ${p256dh}, ${authKey}, ${locale})
    `;
  } catch {
    return { ok: false, skipped: true, error: "Push registration is off." };
  }
  return { ok: true, id };
}
