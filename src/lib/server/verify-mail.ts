import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { VERIFY_EMAIL_SUBJECT, verifyEmailHtml, verifyEmailText } from "@/lib/signup-user-mail";

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
export async function sendVerifyEmail(input: { to: string; url: string }) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("A registered email is required.");
  if (recentlySentVerifyEmail(to)) return { status: "skipped" as const };
  const result = await sendTransactionalMail({
    purpose: "verify_email",
    to,
    subject: VERIFY_EMAIL_SUBJECT,
    text: verifyEmailText(input.url),
    html: verifyEmailHtml(input.url),
    replyTo: KIDEASE_OPERATOR_EMAIL,
  });
  return result.status;
}
