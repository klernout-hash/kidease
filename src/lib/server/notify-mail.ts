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
