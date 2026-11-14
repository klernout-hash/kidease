import { getSql } from "@/lib/db";
import { privateHttpZoneForPath, roleMayEnterZone } from "@/lib/gov/access";
import { privateHttpUnavailableResponse } from "@/lib/gov/http-isolation";

export class GovernmentIsolatedError extends Error {
  readonly status = 403;
  constructor() {
    super("Not authorized");
    this.name = "GovernmentIsolatedError";
  }
}

export async function profileRoleForUser(userId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `;
  return rows[0]?.role ?? null;
}

/** Private server functions. A government session stops here. */
export async function rejectGovernmentOnPrivateApi(userId: string): Promise<void> {
  const role = await profileRoleForUser(userId);
  if (String(role || "").trim().toLowerCase() === "government") {
    throw new GovernmentIsolatedError();
  }
}

/**
 * HTTP APIs that are not server functions. A confirmed guest continues to the
 * endpoint's own authentication. An unverifiable private role fails closed.
 */
export async function blockGovernmentOnPrivateHttp(request: Request): Promise<Response | null> {
  try {
    const zone = privateHttpZoneForPath(new URL(request.url).pathname);
    if (!zone) return null;
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user) return null;
    const role = await profileRoleForUser(user.id);
    if (!roleMayEnterZone(role, zone)) {
      return new Response("Not authorized", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
      });
    }
    return null;
  } catch {
    return privateHttpUnavailableResponse();
  }
}
