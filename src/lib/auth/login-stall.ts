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
