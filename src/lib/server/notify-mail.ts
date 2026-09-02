/** Mail + event-log helpers used by notify.ts. Kept free of DB / Start so tests can import them. */

export function resolveMailReplyTo(visitorEmail: string | null | undefined, fallback: string): string {
  const email = (visitorEmail ?? "").trim();
  return email || fallback;
}

/** Contact/support succeed when a provider accepted the message or local preview logged it. */
export function publicNotifyOk(status: string): boolean {
  return status === "sent" || status === "logged";
}

/** `{ ok: true }` after a successful send — persist failures must not reach the client. */
export function publicSubmitResult(status: string, error?: string | null): { ok: true } {
  if (!publicNotifyOk(status)) {
    throw new Error(error || "Could not send email");
  }
  return { ok: true };
}

export const VISITOR_AUTO_REPLY_SUBJECT = "We got your message — KidEase";

export const VISITOR_AUTO_REPLY_TEXT =
  "Thanks for sending your request to KidEase. One of our KidEase representatives will get back to you within 24 hours.\n\nThank you";

/** Auto-reply only after Resend/SendGrid accepted the admin notify — never after a failed admin send. */
export function shouldSendVisitorAutoReply(adminStatus: string): boolean {
  return adminStatus === "sent";
}

/**
 * Confirm the admin notify, then optionally auto-reply. Auto-reply failures are logged
 * and must not fail the public submit — the parent already reached KidEase.
 */
export async function afterPublicAdminNotify(args: {
  adminStatus: string;
  adminError?: string | null;
  sendAutoReply: () => Promise<unknown>;
  onAutoReplyError?: (err: unknown) => void;
}): Promise<{ ok: true }> {
  const result = publicSubmitResult(args.adminStatus, args.adminError);
  if (shouldSendVisitorAutoReply(args.adminStatus)) {
    try {
      await args.sendAutoReply();
    } catch (err) {
      args.onAutoReplyError?.(err);
    }
  }
  return result;
}

/**
 * Send first, then persist. SQL / persist failures never hide a successful send
 * and never prevent the caller from seeing the mail outcome.
 */
export async function sendMailThenPersist(args: {
  send: () => Promise<string>;
  persist: (result: { status: string; error: string | null }) => Promise<void>;
  onMailError?: (error: string, err: unknown) => void;
  onPersistError?: (err: unknown) => void;
}): Promise<{ status: string; error: string | null }> {
  let status = "queued";
  let error: string | null = null;
  try {
    status = await args.send();
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "send failed";
    args.onMailError?.(error, err);
  }
  try {
    await args.persist({ status, error });
  } catch (err) {
    args.onPersistError?.(err);
  }
  return { status, error };
}
