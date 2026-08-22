import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

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

async function deliverEmail(subject: string, text: string, html: string) {
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [ADMIN_EMAIL],
        reply_to: ADMIN_EMAIL,
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
        personalizations: [{ to: [{ email: ADMIN_EMAIL }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: ADMIN_EMAIL },
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
  console.info("[kidease-mail]", ADMIN_EMAIL, subject, "\n", text);
  return "logged";
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
  let status = "queued";
  let error: string | null = null;
  try {
    status = await deliverEmail(title, text, html);
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "send failed";
    console.error("[kidease-mail]", error);
  }
  await sql
    .query(
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
    )
    .catch((e) => console.error("[platform_events]", e));
  return { id, status };
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
    await notifyPlatform({
      kind: data.kind,
      title: data.kind === "contact" ? `Contact: ${data.subject || "Message"}` : "New support message",
      actorName: data.name,
      actorEmail: data.email,
      detail: [data.subject, data.body].filter(Boolean).join("\n\n"),
    });
    return { ok: true as const };
  });

export const listPlatformEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
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
