import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ADMIN_PEOPLE_DAYS, adminPersonEligible, type AccountNotifyRole } from "@/lib/account-notify";

export type AdminPersonRow = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  role: AccountNotifyRole | string;
  createdAt: string;
  daycareName: string | null;
};

type PersonSqlRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  role: string;
  created_at: string;
  daycare_name?: string | null;
};

function mapPerson(row: PersonSqlRow): AdminPersonRow {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    role: row.role,
    createdAt: String(row.created_at),
    daycareName: row.daycare_name?.trim() || null,
  };
}

function likeTerm(raw: string): string {
  return `%${raw.toLowerCase().replace(/[%_\\]/g, "")}%`;
}

async function selectPeople(sql: Awaited<ReturnType<typeof getSql>>, text: string, params: unknown[]): Promise<PersonSqlRow[] | null> {
  try {
    return await sql.query<PersonSqlRow>(text, params);
  } catch (err) {
    console.error("[kidease-admin-users] lookup skipped", err instanceof Error ? err.message : "failed");
    return null;
  }
}

const PEOPLE_SELECT = `
  select
    u.id as user_id,
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.name), '')) as name,
    u.email,
    p.phone,
    p.city,
    p.role,
    u."createdAt" as created_at,
    coalesce(
      (select d.name from provider_daycares pd join daycares d on d.id = pd.daycare_id where pd.user_id = u.id limit 1),
      (select d.name from listing_claims c join daycares d on d.id = c.daycare_id where c.user_id = u.id and c.verified_at is not null order by c.verified_at desc limit 1)
    ) as daycare_name
  from profiles p
  join "user" u on u.id = p.user_id
`;

export const listAdminPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminPersonRow[]> => {
    const { requireAdmin } = await import("@/lib/server/roles");
    await requireAdmin(context.userId);
    const sql = await getSql();
    const since = new Date(Date.now() - ADMIN_PEOPLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await selectPeople(
      sql,
      `${PEOPLE_SELECT}
       where p.role in ('parent', 'provider')
         and u."createdAt" >= $1
       order by u."createdAt" desc
       limit 200`,
      [since],
    );
    const plain = rows ?? await sql.query<PersonSqlRow>(
      `select
         u.id as user_id,
         coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.name), '')) as name,
         u.email, p.phone, p.city, p.role, u."createdAt" as created_at
       from profiles p
       join "user" u on u.id = p.user_id
       where p.role in ('parent', 'provider')
         and u."createdAt" >= $1
       order by u."createdAt" desc
       limit 200`,
      [since],
    ).catch(() => [] as PersonSqlRow[]);
    return plain.filter((r) => adminPersonEligible(r)).map(mapPerson);
  });

export const searchAdminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { q?: string } | undefined) => ({ q: String(input?.q || "").trim().slice(0, 80) }))
  .handler(async ({ context, data }): Promise<AdminPersonRow[]> => {
    const { requireAdmin } = await import("@/lib/server/roles");
    await requireAdmin(context.userId);
    const q = data.q;
    if (q.length < 2) return [];
    const sql = await getSql();
    const rows = await selectPeople(
      sql,
      `${PEOPLE_SELECT}
       where (
         lower(coalesce(u.email, '')) like $1
         or lower(coalesce(p.display_name, u.name, '')) like $1
       )
       order by u."createdAt" desc
       limit 50`,
      [likeTerm(q)],
    );
    return (rows ?? [])
      .filter((row) => Boolean((row.email || "").trim() || (row.name || "").trim()))
      .map(mapPerson);
  });
