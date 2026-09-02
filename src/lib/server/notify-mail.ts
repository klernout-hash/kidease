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

export const ACTOR_CONFIRM_SUBJECT = "We got your request — KidEase";

/** Parent signup, provider signup, Enroll Now, new listing, claim, spot request. */
export const ACTOR_CONFIRM_KINDS = ["account", "signup", "enroll", "listing", "claim", "spot_request"] as const;

export type ActorConfirmKind = (typeof ACTOR_CONFIRM_KINDS)[number];

const ACTOR_CONFIRM_KIND_SET = new Set<string>(ACTOR_CONFIRM_KINDS);

const ACTOR_CONFIRM_FIRST_LINE: Record<ActorConfirmKind, string> = {
  account: "Thanks for signing up with KidEase.",
  signup: "Thanks for signing up as a provider with KidEase.",
  enroll: "Thanks for sending your enrolment to KidEase.",
  listing: "Thanks for sending your daycare listing to KidEase.",
  claim: "Thanks for sending your listing claim to KidEase.",
  spot_request: "Thanks for sending your spot request to KidEase.",
};

/**
 * Short thanks only. "within 24 hours" is body copy — not a wait, cron, queue, or delayed job.
 * Do not mention open spots or fees.
 */
export function actorConfirmationText(kind: string): string {
  const first =
    ACTOR_CONFIRM_FIRST_LINE[kind as ActorConfirmKind] ??
    "Thanks for sending your request to KidEase.";
  return `${first} One of our KidEase representatives will get back to you within 24 hours.\n\nThank you`;
}

export function isActorConfirmKind(kind: string): boolean {
  return ACTOR_CONFIRM_KIND_SET.has(kind);
}

/**
 * Confirmation replies go to Kyle (ADMIN_EMAIL), not the parent/provider.
 * Opposite of the admin notify's visitor reply_to on contact/support.
 */
export function actorConfirmationReplyTo(adminEmail: string): string {
  return adminEmail.trim();
}

/**
 * Auto-reply only after Resend/SendGrid accepted the admin notify — never after a failed admin send.
 * "within 24 hours" is email copy only. This is not a wait, cron, queue, or delayed job.
 */
export function shouldSendVisitorAutoReply(adminStatus: string): boolean {
  return adminStatus === "sent";
}

/** Same gate as the visitor auto-reply: only after a real provider send, and only with an actor email. */
export function shouldSendActorConfirmation(
  kind: string,
  adminStatus: string,
  actorEmail?: string | null,
): boolean {
  return shouldSendVisitorAutoReply(adminStatus) && isActorConfirmKind(kind) && Boolean((actorEmail ?? "").trim());
}

/**
 * Same request as the admin notify: if that send succeeded, immediately email the visitor.
 * Auto-reply failures are logged and must not fail the public submit — the parent already reached KidEase.
 * Do not schedule this for later.
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
 * Same request as the admin notify: if that send succeeded, immediately email the parent/provider.
 * Confirmation failures are logged and must not fail signup, enroll, claim, or spot request.
 * Do not schedule this for later. Skip when admin send failed or there is no actor email.
 */
export async function afterEnrollmentAdminNotify(args: {
  kind: string;
  adminStatus: string;
  actorEmail?: string | null;
  sendConfirmation: () => Promise<unknown>;
  onConfirmationError?: (err: unknown) => void;
}): Promise<void> {
  if (!shouldSendActorConfirmation(args.kind, args.adminStatus, args.actorEmail)) return;
  try {
    await args.sendConfirmation();
  } catch (err) {
    args.onConfirmationError?.(err);
  }
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
