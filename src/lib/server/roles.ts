import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { lookupUser } from "@/lib/server/notify";
import {
  type AppRole,
  type DeskKey,
  type SessionDesks,
  desksFor,
  landingPath,
  nextStoredRole,
  parseAppRole,
} from "@/lib/desks";
import { stripeChargesLive } from "@/lib/stripe-live";
import { reportError } from "@/lib/observe";
import { canSeeProviderSubscriptions } from "@/lib/features";

export const ADMIN_PROMOTE_SQL =
  "update profiles set role = 'admin' where user_id = '…';";

function bootstrapEmail() {
  return (process.env.ADMIN_EMAIL || "kyle@kidease.ca").trim().toLowerCase();
}

export type { SessionDesks };

async function profileRole(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ role: string }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.role ?? null;
}

async function adminRowCount(sql: Awaited<ReturnType<typeof getSql>>) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from profiles where role = 'admin'
  `.catch(() => [{ n: 0 }]);
  return rows[0]?.n ?? 0;
}

async function ownsCentre(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from provider_daycares where user_id = ${userId}
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

async function unreadInboxCount(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n
    from conversations c
    where (
        c.user_id = ${userId}
        or exists (
          select 1 from provider_daycares p
          where p.user_id = ${userId} and p.daycare_id = c.daycare_id
        )
      )
      and exists (
        select 1 from messages m
        where m.conversation_id = c.id
          and m.sender <> 'system'
          and m.sender <> case when c.user_id = ${userId} then 'parent' else 'provider' end
          and m.created_at = (
            select max(m2.created_at) from messages m2
            where m2.conversation_id = c.id and m2.sender <> 'system'
          )
      )
  `.catch(() => [{ n: 0 }]);
  return rows[0]?.n ?? 0;
}

/**
 * Gate /admin on profiles.role = 'admin'.
 * The owner email (ADMIN_EMAIL / kyle@kidease.ca) is always promoted to admin.
 * Extra staff: update profiles set role = 'admin' where user_id = '…';
 */
export async function resolveAdminAccess(userId: string) {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, role) values (${userId}, 'parent')
    on conflict (user_id) do nothing
  `.catch(() => undefined);

  const role = parseAppRole(await profileRole(sql, userId));
  if (role === "admin") {
    return { ok: true as const, role, bootstrapped: false };
  }

  const actor = await lookupUser(userId);
  const email = (actor.email || "").trim().toLowerCase();
  // Owner email is always staff, even if another admin row already exists
  // or this account first signed in through Daycare / Parent.
  if (email && email === bootstrapEmail()) {
    await sql`update profiles set role = 'admin' where user_id = ${userId}`;
    return { ok: true as const, role: "admin" as const, bootstrapped: true };
  }
  return { ok: false as const, role, bootstrapped: false };
}

export async function requireAdmin(userId: string) {
  const access = await resolveAdminAccess(userId);
  if (!access.ok) throw new Error("Not authorized");
  return lookupUser(userId);
}

export async function resolveSessionDesks(userId: string): Promise<SessionDesks> {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, role) values (${userId}, 'parent')
    on conflict (user_id) do nothing
  `.catch(() => undefined);

  const access = await resolveAdminAccess(userId);
  const stored = access.ok ? "admin" : parseAppRole(await profileRole(sql, userId));
  const owned = await ownsCentre(sql, userId);
  const desks = desksFor({ role: stored, ownsCentre: owned });
  const unread = await unreadInboxCount(sql, userId);
  const stripeLive = stripeChargesLive();
  return {
    role: stored,
    desks,
    home: landingPath(desks),
    unread,
    stripeLive,
    ledgerLabel: stripeLive ? "Stripe live" : "Internal ledger (not charged)",
    providerSubscriptions: canSeeProviderSubscriptions(stored),
  };
}

export async function writeProfileRole(userId: string, requested: "parent" | "provider") {
  const sql = await getSql();
  const prev = await profileRole(sql, userId);
  const next = nextStoredRole(prev, requested);
  if (!prev) {
    await sql`insert into profiles (user_id, role) values (${userId}, ${next})`;
    return { role: next, previous: null as string | null };
  }
  if (parseAppRole(prev) === "admin") {
    return { role: "admin" as const, previous: prev };
  }
  await sql`update profiles set role = ${next} where user_id = ${userId}`;
  return { role: next, previous: prev };
}

export const getMyDesks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      return await resolveSessionDesks(context.userId);
    } catch (err) {
      reportError(err, { route: "getMyDesks" });
      throw err;
    }
  });
