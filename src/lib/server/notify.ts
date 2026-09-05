import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  afterEnrollmentAdminNotify,
  afterPublicAdminNotify,
  actorConfirmationReplyTo,
  actorConfirmationText,
  ACTOR_CONFIRM_SUBJECT,
  resolveMailReplyTo,
  sendMailThenPersist,
  VISITOR_AUTO_REPLY_SUBJECT,
  VISITOR_AUTO_REPLY_TEXT,
} from "@/lib/server/notify-mail";

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "kyle@kidease.ca").trim();
const MAIL_FROM = (process.env.MAIL_FROM || "KidEase <kyle@kidease.ca>").trim();
const ADMIN_SMS = (process.env.ADMIN_SMS || "+12048088398").replace(/[^\d+]/g, "");
const SMS_KINDS = new Set<PlatformKind>(["chat", "contact", "enroll", "spot_request", "account", "signup"]);

export type PlatformKind =
  | "account"
  | "claim"
  | "signup"
  | "listing"
  | "spot_request"
  | "payment"
  | "promo"
  | "contact"
  | "support"
  | "enroll"
  | "chat";

export type ProviderJoinKind = "claim" | "signup" | "listing";

export type PlatformEvent = {
  kind: PlatformKind;
  title?: string;
  daycareName?: string;
  address?: string;
  city?: string;
  province?: string;
  slug?: string;
  actorName?: string | null;
  actorEmail?: string | null;
  detail?: string;
};

export type ProviderJoinPayload = {
  kind: ProviderJoinKind;
  daycareName?: string;
  address?: string;
  city?: string;
  province?: string;
  slug?: string;
  providerName?: string | null;
  providerEmail?: string | null;
};

function appOrigin() {
  return process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
}

export async function lookupUser(userId: string) {
  const sql = await getSql();
  const rows = await sql
    .query<{ email: string | null; name: string | null }>(`select email, name from "user" where id = $1 limit 1`, [userId])
    .catch(() => [] as { email: string | null; name: string | null }[]);
  return { email: rows[0]?.email ?? null, name: rows[0]?.name ?? null };
}

function listingUrl(slug?: string) {
  const origin = appOrigin();
  if (slug) return `${origin}/daycare/${slug}`;
  return `${origin}/admin`;
}

function whenWinnipeg() {
  return new Date().toLocaleString("en-CA", { timeZone: "America/Winnipeg", dateStyle: "full", timeStyle: "short" });
}

function defaultTitle(kind: PlatformKind) {
  switch (kind) {
    case "account":
      return "New parent account";
    case "claim":
      return "New daycare listing claimed";
    case "listing":
      return "New daycare listing created";
    case "signup":
      return "New daycare provider account";
    case "spot_request":
      return "New spot request";
    case "payment":
      return "Payment received";
    case "promo":
      return "Priority listing purchased";
    case "contact":
      return "New contact form message";
    case "support":
      return "New support message";
    case "enroll":
      return "Daycare enroll request";
    case "chat":
      return "Live Chat message";
    default:
      return "KidEase update";
  }
}

const KIND_LABEL: Record<string, string> = {
  account: "New accounts",
  claim: "Listings claimed",
  signup: "Provider accounts",
  listing: "Listings created",
  spot_request: "Spot requests",
  payment: "Payments",
  promo: "Priority listings",
  contact: "Contact messages",
  support: "Support messages",
  enroll: "Daycare enrollments",
  chat: "Live Chat",
};

function winnipegDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Winnipeg" }).format(new Date());
}

function digestCopy(
  day: string,
  rows: Array<{
    kind: string;
    daycare_name: string | null;
    provider_name: string | null;
    provider_email: string | null;
    address: string | null;
    city: string | null;
    slug: string | null;
    created_at: string;
  }>,
) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${KIND_LABEL[k] || k}: ${n}`)
    .join("\n");
  const lines = rows.map((r) => {
    const who = [r.provider_name, r.provider_email].filter(Boolean).join(" · ") || "—";
    const place = [r.daycare_name, r.city].filter(Boolean).join(" · ") || r.address || "—";
    const when = new Date(r.created_at).toLocaleString("en-CA", {
      timeZone: "America/Winnipeg",
      hour: "numeric",
      minute: "2-digit",
    });
    return `• ${KIND_LABEL[r.kind] || r.kind} — ${place} (${who}) at ${when}`;
  });
  const title = `KidEase daily digest — ${day}`;
  const admin = `${appOrigin()}/admin`;
  const text = [
    title,
    `${rows.length} event${rows.length === 1 ? "" : "s"} in the last 24 hours.`,
    "",
    summary,
    "",
    lines.join("\n"),
    "",
    `Admin: ${admin}`,
  ].join("\n");
  const htmlSummary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, n]) =>
        `<td style="padding:10px 12px;border:1px solid #e3ddd3;"><strong>${esc(KIND_LABEL[k] || k)}</strong><br/>${n}</td>`,
    )
    .join("");
  const htmlItems = rows
    .map((r) => {
      const who = [r.provider_name, r.provider_email].filter(Boolean).join(" · ") || "—";
      const place = [r.daycare_name, r.city].filter(Boolean).join(" · ") || r.address || "—";
      const when = new Date(r.created_at).toLocaleString("en-CA", {
        timeZone: "America/Winnipeg",
        hour: "numeric",
        minute: "2-digit",
      });
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e3ddd3;vertical-align:top;width:38%;">${esc(KIND_LABEL[r.kind] || r.kind)}<br/><span style="color:#5c6578;font-size:12px;">${esc(when)}</span></td>
        <td style="padding:10px 0;border-bottom:1px solid #e3ddd3;">${esc(place)}<br/><span style="color:#5c6578;font-size:12px;">${esc(who)}</span></td>
      </tr>`;
    })
    .join("");
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;">Daily digest</h1>
      <p style="margin:8px 0 0;color:#5c6578;">${esc(day)} · ${rows.length} event${rows.length === 1 ? "" : "s"} · last 24 hours</p>
    </td></tr>
    <tr><td style="padding:16px 28px 8px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>${htmlSummary}</tr></table>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">${htmlItems}</table>
      <p style="margin:24px 0 0;">
        <a href="${admin}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;">Open admin</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { title, text, html };
}

async function ensureDigestTable() {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists digest_sends (
        day text primary key,
        sent_at timestamptz not null default now(),
        event_count int not null default 0,
        email_status text not null
      )`,
    )
    .catch(() => undefined);
}

export async function sendDailyDigest() {
  await ensureEventsTable();
  await ensureDigestTable();
  const sql = await getSql();
  const day = winnipegDay();
  const already = await sql<{ day: string }>`select day from digest_sends where day = ${day}`.catch(
    () => [] as { day: string }[],
  );
  if (already[0]) return { ok: true as const, skipped: true as const, day, reason: "already-sent" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await sql<{
    kind: string;
    daycare_name: string | null;
    provider_name: string | null;
    provider_email: string | null;
    address: string | null;
    city: string | null;
    slug: string | null;
    created_at: string;
  }>`
    select kind, daycare_name, provider_name, provider_email, address, city, slug, created_at
    from platform_events
    where created_at >= ${since}
    order by created_at desc
    limit 200
  `.catch(() => []);

  if (!rows.length) {
    await sql`insert into digest_sends (day, event_count, email_status) values (${day}, 0, ${"empty"})`.catch(
      () => undefined,
    );
    return { ok: true as const, skipped: true as const, empty: true as const, day };
  }

  const { title, text, html } = digestCopy(day, rows);
  let status = "queued";
  let error: string | null = null;
  try {
    status = await deliverEmail(title, text, html);
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "send failed";
    console.error("[kidease-digest]", error);
  }
  await sql`insert into digest_sends (day, event_count, email_status) values (${day}, ${rows.length}, ${status})`.catch(
    () => undefined,
  );
  return { ok: true as const, day, count: rows.length, status, error };
}

function emailCopy(p: PlatformEvent) {
  const when = whenWinnipeg();
  const title = p.title || defaultTitle(p.kind);
  const location = [p.address, p.city, p.province].filter(Boolean).join(", ") || "—";
  const link = listingUrl(p.slug);
  const rows: Array<[string, string]> = [
    ["Who", [p.actorName, p.actorEmail].filter(Boolean).join(" · ") || "—"],
    ["Daycare", p.daycareName || "—"],
    ["Location", location],
    ["When", `${when} (Winnipeg)`],
  ];
  if (p.detail) rows.push(["Details", p.detail]);
  const text = [title, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Open: ${link}`].join("\n");
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<p style="margin:16px 0 0;"><strong>${esc(k)}</strong><br/>${esc(v).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;">${esc(title)}</h1>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;">
      ${htmlRows}
      <p style="margin:24px 0 0;">
        <a href="${link}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;">Open KidEase</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { title, text, html };
}

function esc(s: string) {
  return [...s]
    .map((ch) => {
      if (ch === "&") return "&#38;";
      if (ch === "<") return "&#60;";
      if (ch === ">") return "&#62;";
      if (ch === '"') return "&#34;";
      if (ch === "'") return "&#39;";
      return ch;
    })
    .join("");
}

async function deliverEmail(subject: string, text: string, html: string, to = ADMIN_EMAIL, replyTo?: string) {
  const reply = resolveMailReplyTo(replyTo, ADMIN_EMAIL);
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [to],
        reply_to: reply,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return "sent";
  }
  const sendgrid = process.env.SENDGRID_API_KEY?.trim();
  if (sendgrid) {
    const fromMatch = MAIL_FROM.match(/^(.*)<([^>]+)>$/);
    const fromName = fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase";
    const fromEmail = fromMatch?.[2]?.trim() || ADMIN_EMAIL;
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: reply },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return "sent";
  }
  console.info("[kidease-mail]", to, subject, "reply_to", reply, "\n", text);
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY)");
  }
  return "logged";
}

function thanksEmailCopy(subject: string, text: string) {
  const paragraphs = text
    .split("\n\n")
    .map((p) => `<p style="margin:16px 0 0;">${esc(p)}</p>`)
    .join("");
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      ${paragraphs}
    </td></tr>
  </table>
</body></html>`;
  return { title: subject, text, html };
}

/** Immediate parent/provider confirmation. Reply-To is Kyle so they can reach him. */
async function sendActorConfirmation(kind: string, to: string) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const { title, text, html } = thanksEmailCopy(ACTOR_CONFIRM_SUBJECT, actorConfirmationText(kind));
  await deliverEmail(title, text, html, to, actorConfirmationReplyTo(ADMIN_EMAIL));
}

async function sendVisitorAutoReply(to: string, name: string) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const who = name.split(" ")[0] || "there";
  const text = `Hi ${who},\n\n${VISITOR_AUTO_REPLY_TEXT}`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;font-size:16px;line-height:1.6;">
      <p style="margin:0;">Hi ${esc(who)},</p>
      <p>Thanks for sending your request to KidEase. One of our KidEase representatives will get back to you within 24 hours.</p>
      <p>Thank you</p>
      <p style="margin:24px 0 0;">Talk soon,<br/>Kyle<br/>KidEase<br/><a href="mailto:kyle@kidease.ca" style="color:#1a3790;">kyle@kidease.ca</a></p>
    </td></tr>
  </table>
</body></html>`;
  await deliverEmail(VISITOR_AUTO_REPLY_SUBJECT, text, html, to, ADMIN_EMAIL);
}

async function deliverSms(kind: PlatformKind, title: string, detail?: string) {
  if (!SMS_KINDS.has(kind)) return "skip";
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const snippet = (detail || title).replace(/\s+/g, " ").slice(0, 120);
  const body = `KidEase ${kind === "chat" ? "Live Chat" : title}: ${snippet}`;
  if (!sid || !token || !from) {
    console.info("[kidease-sms]", ADMIN_SMS, body);
    return "logged";
  }
  const auth = btoa(`${sid}:${token}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: ADMIN_SMS, From: from, Body: body.slice(0, 1600) }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  return "sent";
}

async function ensureEventsTable() {
  const sql = await getSql();
  await sql
    .query(
      `
    create table if not exists platform_events (
      id text primary key,
      kind text not null,
      daycare_name text,
      address text,
      city text,
      province text,
      slug text,
      provider_name text,
      provider_email text,
      listing_url text,
      email_to text not null,
      email_status text not null default 'queued',
      email_error text,
      created_at timestamptz not null default now()
    )
  `,
    )
    .catch(() => undefined);
}

export async function notifyPlatform(p: PlatformEvent) {
  const { title, text, html } = emailCopy(p);
  await ensureEventsTable();
  const sql = await getSql();
  const id = nid("ev");
  const { status, error } = await sendMailThenPersist({
    send: () => deliverEmail(title, text, html, ADMIN_EMAIL, p.actorEmail ?? undefined),
    persist: async ({ status, error }) => {
      await sql.query(
        `insert into platform_events (
      id, kind, daycare_name, address, city, province, slug,
      provider_name, provider_email, listing_url, email_to, email_status, email_error
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          p.kind,
          p.daycareName ?? null,
          p.address ?? p.detail ?? null,
          p.city ?? null,
          p.province ?? null,
          p.slug ?? null,
          p.actorName ?? null,
          p.actorEmail ?? null,
          listingUrl(p.slug),
          ADMIN_EMAIL,
          status,
          error,
        ],
      );
    },
    onMailError: (msg) => console.error("[kidease-mail]", msg),
    onPersistError: (e) => console.error("[platform_events]", e),
  });
  try {
    await deliverSms(p.kind, title, p.detail);
  } catch (err) {
    console.error("[kidease-sms]", err instanceof Error ? err.message : err);
  }
  const actorEmail = (p.actorEmail ?? "").trim();
  await afterEnrollmentAdminNotify({
    kind: p.kind,
    adminStatus: status,
    actorEmail,
    sendConfirmation: () => sendActorConfirmation(p.kind, actorEmail),
    onConfirmationError: (err) => {
      console.error("[kidease-confirm] confirmation failed", err);
    },
  });
  return { id, status, error };
}

export async function notifyAccountCreated(p: {
  name?: string | null;
  email?: string | null;
  role?: "parent" | "provider";
}) {
  const role = p.role === "provider" ? "daycare provider" : "parent";
  const result = await notifyPlatform({
    kind: "account",
    title: p.role === "provider" ? "New daycare provider account" : "New parent account",
    actorName: p.name,
    actorEmail: p.email,
    detail: `A ${role} just signed up on KidEase.${p.email ? ` Email: ${p.email}` : ""}`,
  });
  return result;
}

export async function notifyProviderJoined(p: ProviderJoinPayload) {
  return notifyPlatform({
    kind: p.kind,
    daycareName: p.daycareName,
    address: p.address,
    city: p.city,
    province: p.province,
    slug: p.slug,
    actorName: p.providerName,
    actorEmail: p.providerEmail,
  });
}

/** Parent notice when a centre Sends a bill. Uses Resend/SendGrid when wired; otherwise logs. */
export async function notifyParentBill(p: {
  to?: string | null;
  parentName?: string | null;
  daycareName: string;
  amountLabel: string;
  period: string;
  dueAt?: string | null;
  payUrl: string;
}) {
  const to = (p.to || "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.info("[kidease-bill] no parent email — in-app notice only", p.daycareName, p.amountLabel);
    return { status: "skipped" as const };
  }
  const who = (p.parentName || "there").split(" ")[0] || "there";
  const due = p.dueAt ? ` Due ${p.dueAt}.` : "";
  const title = `New bill from ${p.daycareName}`;
  const text = [
    `Hi ${who},`,
    "",
    `${p.daycareName} sent you a bill for ${p.amountLabel} (${p.period}).${due}`,
    "",
    `Pay in KidEase: ${p.payUrl}`,
    "",
    "Talk soon,",
    "Kyle",
    "KidEase",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;">New bill from ${esc(p.daycareName)}</h1>
      <p style="margin:16px 0 0;">Hi ${esc(who)},</p>
      <p style="margin:16px 0 0;">${esc(p.daycareName)} sent you a bill for <strong>${esc(p.amountLabel)}</strong> (${esc(p.period)}).${due ? ` ${esc(due.trim())}` : ""}</p>
      <p style="margin:24px 0 0;">
        <a href="${esc(p.payUrl)}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;">Pay this bill</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  try {
    const status = await deliverEmail(title, text, html, to, ADMIN_EMAIL);
    return { status };
  } catch (err) {
    console.error("[kidease-bill] parent mail failed", err);
    return { status: "failed" as const };
  }
}

export const submitPublicMessage = createServerFn({ method: "POST" })
  .validator((input: {
    kind: "contact" | "support" | "enroll";
    name: string;
    email: string;
    subject?: string;
    body: string;
    centre?: string;
    phone?: string;
    city?: string;
    turnstileToken?: string;
  }) => {
    const name = input.name.trim();
    const email = input.email.trim();
    const body = input.body.trim();
    if (!name || !email || !body) throw new Error("Missing fields");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
    return {
      kind: input.kind,
      name: name.slice(0, 120),
      email: email.slice(0, 200),
      subject: (input.subject || "").trim().slice(0, 160),
      body: body.slice(0, 4000),
      centre: (input.centre || "").trim().slice(0, 160),
      phone: (input.phone || "").trim().slice(0, 40),
      city: (input.city || "").trim().slice(0, 80),
      turnstileToken: String(input.turnstileToken || ""),
    };
  })
  .handler(async ({ data }) => {
    const { assertTurnstileToken } = await import("@/lib/server/turnstile");
    await assertTurnstileToken(data.turnstileToken);
    const title =
      data.kind === "enroll"
        ? `Enroll Now: ${data.centre || data.name}`
        : data.kind === "contact"
          ? `Contact: ${data.subject || "Message"}`
          : "New support message";
    const result = await notifyPlatform({
      kind: data.kind,
      title,
      actorName: data.name,
      actorEmail: data.email,
      daycareName: data.centre || undefined,
      city: data.city || undefined,
      detail: [data.centre && `Centre: ${data.centre}`, data.city && `City: ${data.city}`, data.phone && `Phone: ${data.phone}`, data.subject, data.body]
        .filter(Boolean)
        .join("\n"),
    });
    return afterPublicAdminNotify({
      adminStatus: result.status,
      adminError: result.error,
      sendAutoReply: async () => {
        if (data.kind === "contact" || data.kind === "support") {
          await sendVisitorAutoReply(data.email, data.name);
        }
      },
      onAutoReplyError: (err) =>
        console.error("[kidease-contact] auto-reply failed", err),
    });
  });

export const listPlatformEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/server/roles");
    await requireAdmin(context.userId);
    await ensureEventsTable();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: string;
      daycare_name: string | null;
      address: string | null;
      city: string | null;
      province: string | null;
      slug: string | null;
      provider_name: string | null;
      provider_email: string | null;
      listing_url: string | null;
      email_status: string;
      created_at: string;
    }>`
      select id, kind, daycare_name, address, city, province, slug,
             provider_name, provider_email, listing_url, email_status, created_at
      from platform_events
      order by created_at desc
      limit 100
    `.catch(() => []);
    return rows;
  });
