/**
 * The signed-in person, or null for a guest with no session cookie.
 * A client-supplied id is never accepted. A cookie that no longer
 * matches a session is Unauthorized, not a guest.
 */
export async function resolveActorUserId(_claimed?: string | null): Promise<string | null> {
  const { UnauthorizedError, getSessionUser } = await import("@/lib/auth/verify.server");
  const { requestHasSessionMaterial } = await import("@/lib/anonymous-request");
  let cookie = "";
  let authorization = "";
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    cookie = req?.headers.get("cookie") || "";
    authorization = req?.headers.get("authorization") || "";
  } catch {
    cookie = "";
  }
  let session: { id: string } | null = null;
  try {
    session = await getSessionUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError();
  }
  if (session?.id) return session.id;
  if (requestHasSessionMaterial(cookie, authorization)) throw new UnauthorizedError();
  return null;
}
