/**
 * Prefer the verified session over a client-supplied id.
 * A guest id is never treated as a signed-in parent.
 */
export async function resolveActorUserId(claimed?: string | null): Promise<string | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const session = await getSessionUser();
    if (session?.id) return session.id;
  } catch {
    /* Signed out, or the session store is down. Fall through. */
  }
  const id = String(claimed || "").trim();
  if (!id || id.startsWith("guest:")) return null;
  return id;
}
