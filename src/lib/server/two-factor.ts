import { createHash, randomInt } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { ADMIN_EMAIL, lookupUser } from "@/lib/server/notify";
import {
  TWO_FACTOR_MAX_ATTEMPTS,
  decideTwoFactorStart,
  friendlyTwoFactorMailError,
  twoFactorWaitSeconds,
} from "@/lib/two-factor-start";
import { TWO_FACTOR_DEVICE_TTL_MS } from "@/lib/two-factor-cookie";
import { sendTransactionalMail } from "@/lib/transactional-mail";

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = TWO_FACTOR_MAX_ATTEMPTS;

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function hashCode(code: string) {
  return createHash("sha256").update(`${secret()}:${code}`).digest("hex");
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
  const result = await sendTransactionalMail({
    purpose: "2fa",
    to,
    subject,
    text,
    html,
    replyTo: ADMIN_EMAIL,
  });
  if (result.via === "resend") console.info("[kidease-2fa] resend", result.via);
  if (result.status === "logged") console.info("[kidease-2fa]", to, code);
  return result.status;
}

export const getTwoFactorStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { isCurrentUserTwoFactorVerified } = await import("./two-factor.server");
    return { verified: isCurrentUserTwoFactorVerified(context.userId) };
  });

export const startTwoFactor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { force?: boolean } = {}) => ({
    force: Boolean(input?.force),
  }))
  .handler(async ({ context, data }) => {
    const actor = await lookupUser(context.userId);
    const email = (actor.email || "").trim().toLowerCase();
    const emailed = email.replace(/(^.).*(@.*$)/, "$1•••$2");
    if (!email) throw new Error("This account has no email for a verification code.");
    await ensureTable();
    const sql = await getSql();
    const recent = await sql<{ created_at: string; expires_at: string; attempts: number }>`
      select created_at, expires_at, attempts from login_challenges
      where user_id = ${context.userId}
      order by created_at desc limit 1
    `.catch(() => []);
    const last = recent[0];
    const lastSnapshot = last
      ? {
          createdAtMs: new Date(last.created_at).getTime(),
          expiresAtMs: new Date(last.expires_at).getTime(),
          attempts: last.attempts,
        }
      : null;
    const decision = decideTwoFactorStart({
      force: data.force,
      last: lastSnapshot,
    });
    // Auto-start remounts wait/reuse. Explicit resend waits only for the short
    // cooldown — never because a previous unused code is still valid.
    if (decision === "wait") {
      return {
        ok: true as const,
        emailed,
        wait: true as const,
        sent: false as const,
        waitSeconds: twoFactorWaitSeconds({ force: data.force, last: lastSnapshot }),
      };
    }
    if (decision === "reuse") {
      return { ok: true as const, emailed, wait: true as const, reused: true as const, sent: false as const };
    }
    const code = String(randomInt(100000, 999999));
    const id = nid("2fa");
    let status: "sent" | "logged";
    try {
      status = await sendCodeEmail(email, code);
    } catch (err) {
      throw new Error(friendlyTwoFactorMailError(err));
    }
    // Persist after a successful send. A mint replaces every unused code for this user.
    await sql`delete from login_challenges where user_id = ${context.userId}`;
    await sql.query(
      `insert into login_challenges (id, user_id, email, code_hash, expires_at) values ($1,$2,$3,$4,$5)`,
      [id, context.userId, email, hashCode(code), new Date(Date.now() + TTL_MS).toISOString()],
    );
    return {
      ok: true as const,
      emailed,
      status,
      sent: true as const,
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
    const { writeTwoFactorDeviceCookie, writeTwoFactorSessionCookie } = await import("./two-factor.server");
    writeTwoFactorSessionCookie(context.userId);
    if (data.remember) writeTwoFactorDeviceCookie(context.userId, TWO_FACTOR_DEVICE_TTL_MS);
    return { ok: true as const };
  });
