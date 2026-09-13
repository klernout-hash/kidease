import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { VERIFY_EMAIL_SUBJECT, verifyEmailHtml, verifyEmailText } from "@/lib/signup-user-mail";

async function lookupVerifyAudience(email: string): Promise<"parent" | "provider" | undefined> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ role: string | null }>`
      select p.role
      from profiles p
      join "user" u on u.id = p.user_id
      where lower(u.email) = ${email}
      limit 1
    `.catch(() => []);
    if (rows[0]?.role === "provider") return "provider";
    if (rows[0]?.role === "parent") return "parent";
  } catch {
    return undefined;
  }
  return undefined;
}

const globalRef = globalThis as typeof globalThis & {
  __kideaseVerifyEmailAt__?: Map<string, number>;
};

/** Same-process debounce so sendOnSignUp + ping backup do not stack two links. */
export function recentlySentVerifyEmail(email: string, windowMs = 90_000, now = Date.now()): boolean {
  globalRef.__kideaseVerifyEmailAt__ ??= new Map();
  const key = email.trim().toLowerCase();
  if (!key) return false;
  const prev = globalRef.__kideaseVerifyEmailAt__.get(key) || 0;
  if (now - prev < windowMs) return true;
  globalRef.__kideaseVerifyEmailAt__.set(key, now);
  return false;
}

/** Send a Better Auth verify link. Never log the URL or token. */
export async function sendVerifyEmail(input: {
  to: string;
  url: string;
  name?: string | null;
  audience?: "parent" | "provider" | null;
}) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("A registered email is required.");
  if (recentlySentVerifyEmail(to)) return { status: "skipped" as const };
  const audience = input.audience ?? (await lookupVerifyAudience(to));
  const result = await sendTransactionalMail({
    purpose: "verify_email",
    to,
    subject: VERIFY_EMAIL_SUBJECT,
    text: verifyEmailText(input.url, input.name, audience),
    html: verifyEmailHtml(input.url, input.name, audience),
    replyTo: KIDEASE_OPERATOR_EMAIL,
  });
  return result.status;
}
