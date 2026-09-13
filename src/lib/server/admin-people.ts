import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ADMIN_PEOPLE_DAYS, type AccountNotifyRole } from "@/lib/account-notify";

export type AdminPersonRow = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  role: AccountNotifyRole;
  createdAt: string;
};

export const listAdminPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminPersonRow[]> => {
    const { requireAdmin } = await import("@/lib/server/roles");
    await requireAdmin(context.userId);
    const sql = await getSql();
    const since = new Date(Date.now() - ADMIN_PEOPLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await sql<{
      user_id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      city: string | null;
      role: string;
      created_at: string;
    }>`
      select
        u.id as user_id,
        coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.name), '')) as name,
        u.email,
        p.phone,
        p.city,
        p.role,
        u."createdAt" as created_at
      from profiles p
      join "user" u on u.id = p.user_id
      where p.role in ('parent', 'provider')
        and u."createdAt" >= ${since}
      order by u."createdAt" desc
      limit 200
    `.catch(() => []);
    return rows
      .filter((r) => r.role === "parent" || r.role === "provider")
      .map((r) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        city: r.city,
        role: r.role as AccountNotifyRole,
        createdAt: String(r.created_at),
      }));
  });
