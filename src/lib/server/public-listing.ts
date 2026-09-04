import { getSessionUser } from "@/lib/auth/verify.server";
import { resolveAdminAccess } from "@/lib/server/roles";

export async function callerIsAdmin(bearerToken?: string) {
  try {
    const user = await getSessionUser(bearerToken);
    if (!user) return false;
    return (await resolveAdminAccess(user.id)).ok;
  } catch {
    return false;
  }
}
