/**
 * Login must not spin on “Opening your desk…”.
 *
 * Soft-continuing an admin session that fails the idle check used to set
 * `continued` back to false and `busy` to false. The effect depends on
 * `busy`, so it immediately started again, cleared the error, and disabled
 * the button. Turnstile could show Success the whole time.
 */

/** Bound each auth hop. A Cloudflare challenge on XHR does not resolve. */
export const LOGIN_POST_MS = 15_000;
export const LOGIN_CONTINUE_MS = 12_000;
export const ADMIN_IDLE_CHECK_MS = 6_000;

export const ADMIN_SESSION_TIMEOUT_MESSAGE =
  "Admin session timed out. Enter your password to continue.";

/** Shown when a public session must type a password. Never names the admin desk. */
export const PASSWORD_CONTINUE_MESSAGE = "Enter your password to continue.";

export const LOGIN_TAKING_TOO_LONG_MESSAGE =
  "Sign-in is taking too long. Retry, or open your desk. If this keeps happening, Cloudflare is still checking the sign-in request.";

export const LOGIN_OPEN_FAILED_MESSAGE =
  "Could not open your desk. Use Retry, or open https://www.kidease.ca/login.";

export type StuckLoginKind = "admin-password" | "stall" | "open-failed";

export function releaseStuckLogin(kind: StuckLoginKind): {
  keepContinued: true;
  busy: false;
  error: string;
} {
  const error =
    kind === "admin-password"
      ? ADMIN_SESSION_TIMEOUT_MESSAGE
      : kind === "stall"
        ? LOGIN_TAKING_TOO_LONG_MESSAGE
        : LOGIN_OPEN_FAILED_MESSAGE;
  return { keepContinued: true, busy: false, error };
}

export type AdminContinueDecision = "block" | "check-idle" | "allow";

/**
 * Signed-in visitors must not skip the password (and the 2FA that follows it).
 * An admin URL — including idle-timeout "Sign in again" — never auto-continues.
 * The owner mailbox checks the idle cookie first. Everyone else may continue.
 */
export function adminAutoContinueDecision(input: {
  adminIntent: boolean;
  sessionEmail?: string | null;
  ownerEmail: string;
}): AdminContinueDecision {
  if (input.adminIntent) return "block";
  const email = String(input.sessionEmail || "").trim().toLowerCase();
  const owner = String(input.ownerEmail || "").trim().toLowerCase();
  if (email && owner && email === owner) return "check-idle";
  return "allow";
}

/** Remember one auto-continue so a server bounce cannot spin “Opening your desk…”. */
export const LOGIN_BOUNCE_KEY = "kidease-login-bounce";
export const LOGIN_BOUNCE_MS = 20_000;

export function loginBounceRecord(next: string, now = Date.now()): string {
  return JSON.stringify({ next, at: now });
}

/** True when this login load is the same `next` we just tried to open. */
export function loginBounceBlocks(raw: string | null, next: string, now = Date.now()): boolean {
  const dest = String(next || "").trim();
  if (!raw || !dest) return false;
  try {
    const parsed = JSON.parse(raw) as { next?: unknown; at?: unknown };
    if (parsed.next !== dest) return false;
    const at = Number(parsed.at);
    if (!Number.isFinite(at)) return false;
    return now - at >= 0 && now - at < LOGIN_BOUNCE_MS;
  } catch {
    return false;
  }
}

/** Auto-continue runs once. A released attempt must not start another. */
export function shouldAutoContinue(input: {
  continued: boolean;
  busy: boolean;
  hasUser: boolean;
  sessionPending: boolean;
}): boolean {
  if (input.sessionPending || !input.hasUser || input.busy || input.continued) return false;
  return true;
}
