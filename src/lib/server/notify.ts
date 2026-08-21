import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const ADMIN_EMAIL = "klernout@hotmail.com";

export type ProviderJoinKind = "claim" | "signup" | "listing";

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
  return process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.app";
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
  return `${origin}/provider`;
}

function dashboardUrl() {
  return `${appOrigin()}/provider`;
}

function emailCopy(p: ProviderJoinPayload) {
  const when = new Date().toLocaleString("en-CA", { timeZone: "America/Winnipeg", dateStyle: "full", timeStyle: "short" });
  const title =
    p.kind === "claim"
      ? "New daycare listing claimed"
      : p.kind === "listing"
        ? "New daycare listing created"
        : "New daycare provider account";
  const location = [p.address, p.city, p.province].filter(Boolean).join(", ") || "Not provided";
  const link = listingUrl(p.slug);
  const dash = dashboardUrl();
  const text = [
    title,
    "",
    `Daycare: ${p.daycareName || "—"}`,
    `Address: ${location}`,
    `Provider: ${p.providerName || "—"}`,
    `Email: ${p.providerEmail || "—"}`,
    `When: ${when} (Winnipeg)`,
    `Listing: ${link}`,
    `Provider dashboard: ${dash}`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:Figtree,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:26px;line-height:1.2;">${title}</h1>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;">
      <p style="margin:16px 0 0;"><strong>Daycare</strong><br/>${esc(p.daycareName || "—")}</p>
      <p style="margin:16px 0 0;"><strong>Address</strong><br/>${esc(location)}</p>
      <p style="margin:16px 0 0;"><strong>Provider</strong><br/>${esc(p.providerName || "—")}<br/>${esc(p.providerEmail || "—")}</p>
      <p style="margin:16px 0 0;"><strong>Date & time</strong><br/>${esc(when)} (Winnipeg)</p>
      <p style="margin:24px 0 0;">
        <a href="${link}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;">View listing</a>
        <a href="${dash}" style="display:inline-block;margin-left:8px;color:#1a3790;padding:12px 8px;">Provider dashboard</a>
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
        from: "KidEase <beth.t@example.com>",
        to: [ADMIN_EMAIL],
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
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: ADMIN_EMAIL }] }],
        from: { email: "beth.t@example.com", name: "KidEase" },
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
  console.info("[kidease-mail]", subject, "\n", text);
  return "logged";
}

async function ensureEventsTable() {
  const sql = await getSql();
  await sql.query(`
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
  `).catch(() => undefined);
}

export async function notifyProviderJoined(p: ProviderJoinPayload) {
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
  await sql.query(
    `insert into platform_events (
      id, kind, daycare_name, address, city, province, slug,
      provider_name, provider_email, listing_url, email_to, email_status, email_error
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      p.kind,
      p.daycareName ?? null,
      p.address ?? null,
      p.city ?? null,
      p.province ?? null,
      p.slug ?? null,
      p.providerName ?? null,
      p.providerEmail ?? null,
      listingUrl(p.slug),
      ADMIN_EMAIL,
      status,
      error,
    ],
  ).catch((e) => console.error("[platform_events]", e));
  return { id, status };
}

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
