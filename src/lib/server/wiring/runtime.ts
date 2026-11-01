/**
 * Delivery for wiring features. Dry-run writes a log row only.
 * Live email and SMS leave here. SMS still needs FEATURE_SMS and CASL.
 * Nothing in this file prints a secret or a database URL.
 */

import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { evaluateFeatureFlag } from "@/lib/flags";
import { automationQuietNow, emailBlocked } from "@/lib/automations";
import { planServiceNotice, type NoticePlan } from "@/lib/wiring/common";
import type { AutomationMode } from "@/lib/automations";

type Sql = Awaited<ReturnType<typeof getSql>>;

export async function db(): Promise<Sql> {
  return getSql();
}

export function newId(prefix: string): string {
  return nid(prefix);
}

export async function accountEmail(userId: string): Promise<string | null> {
  const sql = await db();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `.catch(() => []);
  const email = String(rows[0]?.email || "")
    .trim()
    .toLowerCase();
  return email.includes("@") ? email : null;
}

export async function smsFacts(userId: string): Promise<{
  granted: boolean;
  blocked: boolean;
  phone: string | null;
}> {
  const sql = await db();
  const rows = await sql<{ address: string | null; granted: number | null; withdrawn_at: string | null }>`
    select address, granted, withdrawn_at
    from casl_consents
    where user_id = ${userId} and channel = 'sms' and purpose = 'service'
    limit 1
  `.catch(() => []);
  const row = rows[0];
  const granted = Number(row?.granted) === 1 && !row?.withdrawn_at;
  const phone = String(row?.address || "").trim() || null;
  if (!granted || !phone) return { granted: false, blocked: false, phone: null };
  const blocks = await sql<{ n: number }>`
    select count(*)::int as n
    from casl_address_blocks
    where channel = 'sms' and address = ${phone} and purpose in ('service', 'all')
  `.catch(() => [{ n: 0 }]);
  return { granted: true, blocked: Number(blocks[0]?.n) > 0, phone };
}

export async function emailSuppressed(email: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql<{ reason: string | null }>`
    select reason from email_suppressions where email = ${email.toLowerCase()} limit 1
  `.catch(() => []);
  const reason = rows[0]?.reason;
  if (reason !== "bounce" && reason !== "complaint" && reason !== "unsubscribe" && reason !== "manual") {
    return false;
  }
  return emailBlocked({ suppressed: true, reason, commercial: false });
}

export async function daycareUserIds(daycareId: string): Promise<string[]> {
  const sql = await db();
  const rows = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${daycareId}
    union
    select user_id from centre_members
    where daycare_id = ${daycareId} and status = 'active'
  `.catch(() => []);
  return [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
}

export async function governmentUserIds(province: string): Promise<string[]> {
  const sql = await db();
  const code = province.trim().toUpperCase();
  const rows = await sql<{ user_id: string }>`
    select m.user_id
    from government_members m
    join government_orgs o on o.id = m.org_id
    join profiles p on p.user_id = m.user_id
    where upper(o.province) = ${code}
      and m.status = 'active'
      and p.role = 'government'
  `.catch(() => []);
  return rows.map((row) => row.user_id);
}

async function logNotice(input: {
  feature: string;
  userId: string;
  channel: string;
  mode: "logged" | "sent";
  body: string;
}) {
  const sql = await db();
  await sql`
    insert into wiring_notices (id, feature, user_id, channel, mode, body)
    values (${newId("wn")}, ${input.feature}, ${input.userId}, ${input.channel}, ${input.mode}, ${input.body.slice(0, 500)})
  `.catch(() => undefined);
}

async function inbox(input: {
  userId: string;
  role: string;
  feature: string;
  title: string;
  body: string;
  href: string;
  senderUserId: string | null;
}) {
  const sql = await db();
  await sql`
    insert into role_inbox (id, user_id, role, feature, title, body, href, sender_user_id)
    values (
      ${newId("in")}, ${input.userId}, ${input.role}, ${input.feature},
      ${input.title.slice(0, 140)}, ${input.body.slice(0, 500)}, ${input.href.slice(0, 200)},
      ${input.senderUserId}
    )
  `.catch(() => undefined);
}

export async function deliverNotice(input: {
  feature: string;
  flag: string;
  mode: AutomationMode;
  userId: string;
  role: string;
  title: string;
  body: string;
  href: string;
  senderUserId?: string | null;
  province?: string | null;
  wantEmail?: boolean;
  wantSms?: boolean;
  wantPush?: boolean;
}): Promise<NoticePlan> {
  const sms = await smsFacts(input.userId);
  const pushOn = evaluateFeatureFlag("FEATURE_PUSH");
  const smsOn = evaluateFeatureFlag("FEATURE_SMS");
  const plan = planServiceNotice({
    mode: input.mode,
    email: input.wantEmail !== false,
    sms: Boolean(input.wantSms),
    push: Boolean(input.wantPush),
    featureSms: smsOn,
    smsConsent: sms.granted,
    addressBlocked: sms.blocked,
    quiet: automationQuietNow(new Date(), null, input.province),
    featurePush: pushOn,
    pushPref: Boolean(input.wantPush),
  });
  if (plan.mode === "off") return plan;
  const mode = plan.mode === "live" ? "sent" : "logged";
  for (const channel of plan.channels) {
    await logNotice({ feature: input.feature, userId: input.userId, channel, mode, body: input.body });
  }
  if (plan.mode !== "live") return plan;
  if (plan.channels.includes("in_app")) {
    await inbox({
      userId: input.userId,
      role: input.role,
      feature: input.feature,
      title: input.title,
      body: input.body,
      href: input.href,
      senderUserId: input.senderUserId ?? null,
    });
  }
  if (plan.channels.includes("email")) {
    const email = await accountEmail(input.userId);
    if (email && !(await emailSuppressed(email))) {
      try {
        const { sendTransactionalMail } = await import("@/lib/transactional-mail");
        const safe = input.body.replace(/[&<>]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"));
        await sendTransactionalMail({
          purpose: "customer_alert",
          to: email,
          subject: input.title.slice(0, 140),
          text: input.body,
          html: `<p>${safe}</p>`,
        });
      } catch {
        console.error("[kidease-wiring] mail skipped", input.feature);
      }
    }
  }
  if (plan.channels.includes("sms") && sms.phone) {
    try {
      const { sendSms } = await import("@/lib/server/sms");
      await sendSms({ to: sms.phone, body: input.body, consentGranted: true, audience: "user" });
    } catch {
      console.error("[kidease-wiring] text skipped", input.feature);
    }
  }
  return plan;
}
