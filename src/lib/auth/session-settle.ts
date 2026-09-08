/**
 * Cookie/session can lag the Better Auth response by a tick (apex↔www,
 * bearer fallback). Retry instead of treating a successful sign-in as a
 * dead end.
 */
export const SESSION_SETTLE_RETRIES = [0, 200, 500, 1000] as const;

export async function waitForSignedInSession<T extends { data?: { user?: unknown } | null }>(
  getSession: () => Promise<T>,
): Promise<T | null> {
  for (const delay of SESSION_SETTLE_RETRIES) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const session = await getSession().catch(() => null);
    if (session?.data?.user) return session;
  }
  return null;
}
