/**
 * `login_funnel` outcomes for a submit that leaves /login without a
 * `succeeded` or `failed` (C7):
 *   - `redirected_2fa`: sign-in worked and we sent the person to the code page.
 *   - `bounced`: /login opened again soon after a submit, with no desk landing
 *     in between (the A2 government loop looked like this).
 * Stored in sessionStorage as a timestamp only. No email, no next path.
 */
export const LOGIN_SUBMIT_MARK_KEY = "ke.loginSubmittedAt";
/** A second /login view within this window after a submit counts as a bounce. */
export const LOGIN_BOUNCE_WINDOW_MS = 2 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function isLoginBounce(submittedAt: number | null, now: number): boolean {
  if (submittedAt == null || !Number.isFinite(submittedAt)) return false;
  const age = now - submittedAt;
  return age >= 0 && age <= LOGIN_BOUNCE_WINDOW_MS;
}

export function markLoginSubmitted(now = Date.now(), storage: StorageLike | null = store()): void {
  try {
    storage?.setItem(LOGIN_SUBMIT_MARK_KEY, String(now));
  } catch {
    /* storage blocked */
  }
}

export function clearLoginSubmitted(storage: StorageLike | null = store()): void {
  try {
    storage?.removeItem(LOGIN_SUBMIT_MARK_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Read and clear the mark. True when this /login view is a bounce. */
export function takeLoginBounce(now = Date.now(), storage: StorageLike | null = store()): boolean {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(LOGIN_SUBMIT_MARK_KEY) ?? null;
  } catch {
    return false;
  }
  clearLoginSubmitted(storage);
  return isLoginBounce(raw ? Number(raw) : null, now);
}
