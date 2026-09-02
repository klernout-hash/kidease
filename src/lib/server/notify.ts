import { nid } from "@/lib/utils";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  afterPublicAdminNotify,
  resolveMailReplyTo,
  sendMailThenPersist,
  VISITOR_AUTO_REPLY_SUBJECT,
  VISITOR_AUTO_REPLY_TEXT,
} from "./notify-mail";

/** Load SQL only when we persist or query — never before sending contact mail. */
async function loadSql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "kyle@kidease.ca").trim();
const MAIL_FROM = (process.env.MAIL_FROM || "KidEase <kyle@kidease.ca>").trim();

export type PlatformKind =
  | "account"
  | "claim"
  | "signup"
  | "listing"
  | "spot_request"
  | "payment"
  | "promo"
  | "contact"
  | "support";

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
  const sql = await loadSql();
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
      return "New KidEase account";
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
  const sql = await loadSql();
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
  const sql = await loadSql();
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

async function deliverEmail(
  subject: string,
  text: string,
  html: string,
  opts?: { to?: string | null; replyTo?: string | null },
) {
  const to = (opts?.to ?? "").trim() || ADMIN_EMAIL;
  const reply = resolveMailReplyTo(opts?.replyTo, ADMIN_EMAIL);
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
  console.info("[kidease-mail]", to, subject, "reply_to=", reply, "\n", text);
  return "logged";
}

function visitorAutoReplyCopy() {
  const paragraphs = VISITOR_AUTO_REPLY_TEXT.split("\n\n")
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
  return { title: VISITOR_AUTO_REPLY_SUBJECT, text: VISITOR_AUTO_REPLY_TEXT, html };
}

/** Immediate second provider send in this request. Not scheduled. */
async function sendVisitorAutoReply(to: string) {
  const { title, text, html } = visitorAutoReplyCopy();
  await deliverEmail(title, text, html, { to, replyTo: ADMIN_EMAIL });
}

async function ensureEventsTable() {
  const sql = await loadSql();
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

async function persistPlatformEvent(
  id: string,
  p: PlatformEvent,
  status: string,
  error: string | null,
) {
  await ensureEventsTable();
  const sql = await loadSql();
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
}

export async function notifyPlatform(p: PlatformEvent) {
  const { title, text, html } = emailCopy(p);
  const id = nid("ev");
  const result = await sendMailThenPersist({
    send: () => deliverEmail(title, text, html, { replyTo: p.actorEmail }),
    persist: ({ status, error }) => persistPlatformEvent(id, p, status, error),
    onMailError: (message, err) => {
      console.error("[kidease-mail]", message, err);
    },
    onPersistError: (err) => {
      console.error("[platform_events] persist failed (mail outcome unchanged)", err);
    },
  });
  return { id, ...result };
}

export async function notifyAccountCreated(p: { name?: string | null; email?: string | null }) {
  return notifyPlatform({
    kind: "account",
    actorName: p.name,
    actorEmail: p.email,
    detail: "A parent or provider just created an account.",
  });
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

export const submitPublicMessage = createServerFn({ method: "POST" })
  .validator((input: { kind: "contact" | "support"; name: string; email: string; subject?: string; body: string }) => {
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
    };
  })
  .handler(async ({ data }) => {
    try {
      const result = await notifyPlatform({
        kind: data.kind,
        title: data.kind === "contact" ? `Contact: ${data.subject || "Message"}` : "New support message",
        actorName: data.name,
        actorEmail: data.email,
        detail: [data.subject, data.body].filter(Boolean).join("\n\n"),
      });
      return afterPublicAdminNotify({
        adminStatus: result.status,
        adminError: result.error,
        sendAutoReply: () => sendVisitorAutoReply(data.email),
        onAutoReplyError: (err) => {
          console.error("[kidease-contact] auto-reply failed", err);
        },
      });
    } catch (err) {
      console.error("[kidease-contact]", err);
      throw err;
    }
  });

export const listPlatformEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    await ensureEventsTable();
    const sql = await loadSql();
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
