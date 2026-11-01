import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { broadcastMode, centreInAudience, daycareEmailPlan, noticeBodyOk, parentChannelPlan, type Audience } from "@/lib/compliance/broadcast";
import { caslSmsGranted, logPractice, readScope, sendComplianceEmail, sendComplianceSms, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";
import { assertGovWritable } from "@/lib/server/gov-actor.server";

function audienceOf(input: { kind?: string; province?: string; city?: string; fsa?: string }): Audience | null {
  const province = String(input.province || "").trim().toUpperCase();
  const kind = String(input.kind || "province");
  if (kind === "city") return { kind: "city", province, city: String(input.city || "").trim() };
  if (kind === "fsa") return { kind: "fsa", province, fsa: String(input.fsa || "").trim().toUpperCase() };
  if (kind === "province") return { kind: "province", province };
  return null;
}

async function deliver(input: { body: string; audience: Audience; actorId: string; mode: ReturnType<typeof broadcastMode> }) {
  const sql = await sqlClient();
  const centres = await sql<{ id: string; province: string; city: string; postal_code: string; contact_email: string | null }>`
    select id, province, city, postal_code, contact_email from daycares where province = ${input.audience.province} limit 500
  `.catch(() => []);
  const hits = centres.filter((row) => centreInAudience({ province: row.province, city: row.city, postal: row.postal_code }, input.audience));
  const id = nid("brd");
  await sql`
    insert into gov_broadcasts (id, province, audience_kind, body, created_by)
    values (${id}, ${input.audience.province}, ${input.audience.kind}, ${input.body}, ${input.actorId})
  `;
  let logged = 0;
  let sent = 0;
  let skipped = 0;
  for (const centre of hits) {
    const emailPlan = daycareEmailPlan(input.mode, Boolean(centre.contact_email));
    const status = emailPlan === "send" ? "sent" : emailPlan === "log" ? "logged" : "skipped";
    await sql`
      insert into gov_broadcast_deliveries (id, broadcast_id, channel, status, target_kind)
      values (${nid("dlv")}, ${id}, 'email', ${status}, 'daycare')
    `;
    if (emailPlan === "send" && centre.contact_email) {
      const result = await sendComplianceEmail({ to: centre.contact_email, subject: "KidEase: a notice for your area", text: input.body });
      if (result === "sent") sent += 1;
      else logged += 1;
    } else if (emailPlan === "log") logged += 1;
    else skipped += 1;
    const parents = await sql<{ user_id: string }>`
      select distinct user_id from bookings where daycare_id = ${centre.id} and status in ('confirmed', 'active', 'enrolled', 'accepted') limit 200
    `.catch(() => []);
    for (const parent of parents) {
      const casl = await caslSmsGranted(parent.user_id);
      const emailRow = await sql<{ email: string | null; phone: string | null }>`
        select u.email, p.phone from "user" u left join profiles p on p.user_id = u.id where u.id = ${parent.user_id} limit 1
      `.catch(() => []);
      const plan = parentChannelPlan(input.mode, casl, Boolean(emailRow[0]?.email));
      for (const [channel, delivery] of [["email", plan.email], ["sms", plan.sms]] as const) {
        const rowStatus = delivery === "send" ? "sent" : delivery === "log" ? "logged" : "skipped";
        await sql`
          insert into gov_broadcast_deliveries (id, broadcast_id, channel, status, target_kind)
          values (${nid("dlv")}, ${id}, ${channel}, ${rowStatus}, 'parent')
        `;
        if (delivery === "log") logged += 1;
        if (delivery === "skip") skipped += 1;
        if (delivery === "send" && channel === "email" && emailRow[0]?.email) {
          const result = await sendComplianceEmail({ to: emailRow[0].email, subject: "KidEase: a notice for your area", text: input.body });
          if (result === "sent") sent += 1;
        }
        if (delivery === "send" && channel === "sms" && emailRow[0]?.phone) {
          const result = await sendComplianceSms({ to: emailRow[0].phone, body: `${input.body} Reply STOP to opt out.`, consentGranted: true });
          if (result === "sent") sent += 1;
        }
      }
    }
  }
  logPractice("FEATURE_GOV_BROADCAST", { action: "send", id, province: input.audience.province, logged, sent, skipped, mode: input.mode });
  return { id, logged, sent, skipped };
}

export const loadGovBroadcasts = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = broadcastMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, rows: [] };
    const sql = await sqlClient();
    const rows = await sql<{ id: string; body: string; created_at: string }>`
      select id, body, created_at from gov_broadcasts where province = ${province} order by created_at desc limit 20
    `.catch(() => []);
    return { enabled: true as const, mode, province, rows };
  });

export const sendGovBroadcast = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { kind?: string; province?: string; city?: string; fsa?: string; body?: string }) => input)
  .handler(async ({ context, data }) => {
    const gov = context.gov as { province: string; userId: string; readOnly: boolean; demo: boolean };
    assertGovWritable(gov as never);
    const mode = broadcastMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const scope = await readScope(gov.userId);
    const home = scope?.province || gov.province;
    const audience = audienceOf({ ...data, province: home });
    const body = String(data.body || "").trim();
    if (!audience || !noticeBodyOk(body)) return { ok: false as const, reason: "form" };
    if (audience.province !== home) return { ok: false as const, reason: "province" };
    const result = await deliver({ body, audience, actorId: gov.userId, mode });
    return { ok: true as const, ...result };
  });

export const loadAdminBroadcasts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const mode = broadcastMode(process.env);
    return { enabled: mode !== "off", mode, province: "ALL", rows: [] as { id: string; body: string }[] };
  });

export const sendAdminBroadcast = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind?: string; province?: string; city?: string; fsa?: string; body?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = broadcastMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const audience = audienceOf(data);
    const body = String(data.body || "").trim();
    if (!audience || !noticeBodyOk(body)) return { ok: false as const, reason: "form" };
    const result = await deliver({ body, audience, actorId: context.userId, mode });
    return { ok: true as const, ...result };
  });
