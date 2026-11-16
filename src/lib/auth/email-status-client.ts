import { parseRetryAfterSeconds, rateLimitWaitCopy } from "@/lib/auth-rate-limit";

export type EmailStatus = { exists: boolean; valid: boolean };

/** Email-first sign-in: ask the server whether this email already has an account. */
export async function checkEmailStatus(email: string): Promise<EmailStatus> {
  const res = await fetch("/api/auth/email-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email: email.trim() }),
  });
  if (res.status === 429) throw new Error(rateLimitWaitCopy(parseRetryAfterSeconds(res.headers.get("retry-after"))));
  if (!res.ok) throw new Error("Could not check that email. Try again.");
  const data = (await res.json()) as Partial<EmailStatus>;
  return { exists: data.exists === true, valid: data.valid !== false };
}
