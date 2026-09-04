import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { ADMIN_EMAIL, lookupUser } from "@/lib/server/notify";

export const TWO_FACTOR_COOKIE = "__Host-kidease.2fa";
const TTL_MS = 10 * 60 * 1000;
const DEVICE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function hashCode(code: string) {
  return createHash("sha256").update(`${secret()}:${code}`).digest("hex");
}

function signDevice(userId: string, exp: number) {
  const body = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

function readDevice(raw: string | null): { userId: string; exp: number } | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, exp };
}

async function ensureTable() {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists login_challenges (
        id text primary key,
        user_id text not null,
        email text not null,
        code_hash text not null,
        attempts int not null default 0,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      )`,
    )
    .catch(() => undefined);
}

async function sendCodeEmail(to: string, code: string) {
  const subject = "Your KidEase sign-in code";
  const text = `Your KidEase verification code is ${code}.\n\nIt expires in 10 minutes. If you did not try to sign in, you can ignore this email.`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:28px;letter-spacing:.12em;">${code}</h1>
      <p style="margin:16px 0 0;color:#5c6578;">This code expires in 10 minutes. Use it to finish signing in.</p>
    </td></tr>
  </table>
</body></html>`;
  const from = (process.env.MAIL_FROM || "KidEase <kyle@kidease.ca>").trim();
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: ADMIN_EMAIL, subject, text, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return "sent" as const;
  }
  const sendgrid = process.env.SENDGRID_API_KEY?.trim();
  if (sendgrid) {
    const fromMatch = from.match(/^(.*)<([^>]+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromMatch?.[2]?.trim() || ADMIN_EMAIL, name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
        reply_to: { email: ADMIN_EMAIL },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return "sent" as const;
  }
  console.info("[kidease-2fa]", to, code);
  return process.env.VERCEL_ENV === "production" ? Promise.reject(new Error("Email is not configured")) : Promise.resolve("logged" as const);
}

export const getTwoFactorStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const device = readDevice(getCookie(TWO_FACTOR_COOKIE) ?? null);
    return { verified: device?.userId === context.userId };
  });

export const startTwoFactor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await lookupUser(context.userId);
    const email = (actor.email || "").trim().toLowerCase();
    if (!email) throw new Error("This account has no email for a verification code.");
    await ensureTable();
    const sql = await getSql();
    const recent = await sql<{ created_at: string }>`
      select created_at from login_challenges
      where user_id = ${context.userId}
      order by created_at desc limit 1
    `.catch(() => []);
    if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 45_000) {
      return { ok: true as const, emailed: email.replace(/(^.).*(@.*$)/, "$1•••$2"), wait: true as const };
    }
    const code = String(randomInt(100000, 999999));
    const id = nid("2fa");
    await sql.query(
      `insert into login_challenges (id, user_id, email, code_hash, expires_at) values ($1,$2,$3,$4,$5)`,
      [id, context.userId, email, hashCode(code), new Date(Date.now() + TTL_MS).toISOString()],
    );
    const status = await sendCodeEmail(email, code);
    return {
      ok: true as const,
      emailed: email.replace(/(^.).*(@.*$)/, "$1•••$2"),
      status,
    };
  });

export const verifyTwoFactor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string; remember?: boolean; turnstileToken?: string }) => ({
    code: String(input.code || "").replace(/\D/g, "").slice(0, 6),
    remember: Boolean(input.remember),
    turnstileToken: String(input.turnstileToken || ""),
  }))
  .handler(async ({ context, data }) => {
    const { assertTurnstileToken } = await import("@/lib/server/turnstile");
    await assertTurnstileToken(data.turnstileToken);
    if (data.code.length !== 6) throw new Error("Enter the 6-digit code from your email.");
    await ensureTable();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      code_hash: string;
      attempts: number;
      expires_at: string;
    }>`
      select id, code_hash, attempts, expires_at
      from login_challenges
      where user_id = ${context.userId}
      order by created_at desc limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Request a new code first.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("That code expired. Request a new one.");
    if (row.attempts >= MAX_ATTEMPTS) throw new Error("Too many tries. Request a new code.");
    if (row.code_hash !== hashCode(data.code)) {
      await sql`update login_challenges set attempts = attempts + 1 where id = ${row.id}`;
      throw new Error("That code is not correct.");
    }
    await sql`delete from login_challenges where user_id = ${context.userId}`;
    const exp = Date.now() + DEVICE_MS;
    setCookie(TWO_FACTOR_COOKIE, signDevice(context.userId, exp), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(exp),
    });
    return { ok: true as const };
  });
