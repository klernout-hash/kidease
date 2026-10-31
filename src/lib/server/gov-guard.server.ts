import { getSql } from "@/lib/db";
import { apiZoneForPath, roleMayEnterZone, type GovApiZone } from "@/lib/gov/access";

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
 * HTTP APIs that are not server functions. Confirmed government role only.
 * A database error does not turn into a pass for a government user: the
 * caller still has to be identified first.
 */
export async function blockGovernmentOnPrivateHttp(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const zone: GovApiZone = apiZoneForPath(path);
  if (zone !== "parent" && zone !== "provider" && zone !== "admin") return null;
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
}
