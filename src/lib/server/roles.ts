import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { lookupUser } from "@/lib/server/notify";
import {
  type SessionDesks,
  desksFor,
  isStaffRole,
  landingPath,
  nextStoredRole,
  parseAppRole,
} from "@/lib/desks";
import { roleFlipAllowed } from "@/lib/role-access";
import { canAccessSupport } from "@/lib/support";
import { stripeChargesLive } from "@/lib/stripe-live";
import { paymentSourceLabel } from "@/lib/payment-source";
import { reportError } from "@/lib/observe";
import { canSeeProviderSubscriptions, showPayCtas } from "@/lib/features";
import {
  bootstrapAdminEmail,
  canBootstrapAdmin,
  effectiveAdminRole,
  isKidEaseOperatorEmail,
} from "@/lib/admin-email";
import { isActiveCentreMember, listOwnedDaycareIds } from "@/lib/server/centre-access";
import { EMPTY_ATTENTION, type AttentionCounts } from "@/lib/attention";
import { restoreDeadline, withinRestoreWindow } from "@/lib/account-delete";

export const ADMIN_PROMOTE_SQL =
  "update profiles set role = 'admin' where user_id = '…';";

export const SUPPORT_PROMOTE_SQL =
  "update profiles set role = 'support' where user_id = '…';";

export const SUPPORT_LEAD_PROMOTE_SQL =
  "update profiles set role = 'support_lead' where user_id = '…';";

function bootstrapEmail() {
  return bootstrapAdminEmail(process.env.ADMIN_EMAIL);
}

export type { SessionDesks };

async function claimProviderCrmIntake(userId: string) {
  try {
    const { ensureCrmIntake } = await import("@/lib/server/family");
    await ensureCrmIntake(userId, "provider");
  } catch (err) {
    console.error("[kidease-ghl] ensure intake failed", err);
  }
}

async function profileRole(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ role: string }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.role ?? null;
}

async function profileRoleRow(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ role: string; created_at: string | Date | null }>`
    select role, created_at from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0] ?? null;
}

async function ownsCentre(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const owned = await listOwnedDaycareIds(sql, userId);
  return owned.length > 0;
}

async function unreadInboxCounts(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ n_all: number; n_family: number; n_centre: number }>`
    select
      count(*)::int as n_all,
      count(*) filter (where c.user_id = ${userId})::int as n_family,
      count(*) filter (where c.user_id <> ${userId})::int as n_centre
    from conversations c
    where (
        c.user_id = ${userId}
         or exists (
          select 1 from provider_daycares p
          where p.user_id = ${userId} and p.daycare_id = c.daycare_id
        )
         or exists (
          select 1 from centre_members m
          where m.user_id = ${userId} and m.daycare_id = c.daycare_id and m.status = 'active'
        )
      )
      and exists (
        select 1 from messages m
        where m.conversation_id = c.id
          and m.sender <> 'system'
          and m.sender <> case when c.user_id = ${userId} then 'parent' else 'provider' end
          and m.created_at > coalesce(
            (select r.last_read_at from conversation_reads r
             where r.conversation_id = c.id and r.user_id = ${userId}),
            '1970-01-01'::timestamptz
          )
      )
  `.catch(() => [{ n_all: 0, n_family: 0, n_centre: 0 }]);
  return {
    all: rows[0]?.n_all ?? 0,
    family: rows[0]?.n_family ?? 0,
    centre: rows[0]?.n_centre ?? 0,
  };
}

async function countOrZero(run: () => Promise<Array<{ n: number }>>) {
  const rows = await run().catch(() => [{ n: 0 }]);
  const value = Number(rows[0]?.n ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** One query batch. Callers must not fetch these numbers again for badges. */
async function loadAttention(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  stored: string,
  unread: { all: number; family: number; centre: number },
  notificationUnread: number,
): Promise<AttentionCounts> {
  const mine = await countOrZero(() => sql<{ n: number }>`
    select count(*)::int as n from lead_requests
    where user_id = ${userId} and status in ('requested', 'received')
  `);
  const centre = await countOrZero(() => sql<{ n: number }>`
    select count(*)::int as n from lead_requests lr
    where lr.status in ('requested', 'received')
      and (
        exists (
          select 1 from provider_daycares p
          where p.user_id = ${userId} and p.daycare_id = lr.daycare_id
        )
        or exists (
          select 1 from centre_members m
          where m.user_id = ${userId} and m.daycare_id = lr.daycare_id and m.status = 'active'
        )
      )
  `);
  const isAdmin = stored === "admin";
  const signups = isAdmin
    ? await countOrZero(() => sql<{ n: number }>`
        select count(*)::int as n from listing_claims where status = 'pending'
      `)
    : 0;
  const claims = isAdmin
    ? await countOrZero(() => sql<{ n: number }>`
        select count(*)::int as n from listing_claims where status = 'waiting'
      `)
    : 0;
  const reviews = isAdmin
    ? await countOrZero(() => sql<{ n: number }>`
        select count(*)::int as n from reviews where status = 'pending'
      `)
    : 0;
  const messages = stored === "provider" ? unread.centre : stored === "admin" ? unread.all : unread.family;
  return {
    ...EMPTY_ATTENTION,
    messages,
    notifications: notificationUnread,
    requests: stored === "provider" || stored === "admin" ? centre : mine,
    signups,
    reviews,
    claims,
  };
}

/**
 * Gate /admin on kyle@kidease.ca only (isKidEaseOperatorEmail).
 * SQL-promoted non-kyle and ADMIN_EMAIL bootstrap of any other mailbox
 * fail closed. Owner is promoted only when Better Auth marks that
 * mailbox verified. Does not rewrite Production profiles.role.
 */
export async function resolveAdminAccess(userId: string) {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, role) values (${userId}, 'parent')
    on conflict (user_id) do nothing
  `.catch(() => undefined);

  const stored = parseAppRole(await profileRole(sql, userId));
  const actor = await lookupUser(userId);
  const email = actor.email;

  if (!isKidEaseOperatorEmail(email)) {
    const role = stored === "admin" ? ("parent" as const) : stored;
    return { ok: false as const, role, bootstrapped: false };
  }

  if (effectiveAdminRole({ storedRole: stored, email }) === "admin") {
    return { ok: true as const, role: "admin" as const, bootstrapped: false };
  }

  // Owner email is staff only after the mailbox is verified. An unverified
  // signup that spoofs ADMIN_EMAIL must not inherit the admin desk.
  if (canBootstrapAdmin(email, bootstrapEmail()) && actor.emailVerified) {
    await sql`update profiles set role = 'admin' where user_id = ${userId}`;
    return { ok: true as const, role: "admin" as const, bootstrapped: true };
  }
  return { ok: false as const, role: stored, bootstrapped: false };
}

export async function requireAdmin(userId: string) {
  const access = await resolveAdminAccess(userId);
  if (!access.ok) throw new Error("Not authorized");
  const { assertAdminIdleFresh, assertTrustedDeviceActive, assertTwoFactorVerified } =
    await import("@/lib/server/two-factor.server");
  assertTwoFactorVerified(userId);
  await assertTrustedDeviceActive(userId);
  await assertAdminIdleFresh(userId);
  return lookupUser(userId);
}

/**
 * Gate /support on admin OR profiles.role in (support, support_lead).
 * Does not grant /admin. Extra staff:
 *   update profiles set role = 'support' where user_id = '…';
 *   update profiles set role = 'support_lead' where user_id = '…';
 */
export async function resolveSupportAccess(userId: string) {
  const admin = await resolveAdminAccess(userId);
  if (admin.ok) {
    return { ok: true as const, role: "admin" as const };
  }
  const sql = await getSql();
  const role = parseAppRole(await profileRole(sql, userId));
  if (canAccessSupport(role)) {
    return { ok: true as const, role };
  }
  return { ok: false as const, role };
}

export async function requireSupport(userId: string) {
  const access = await resolveSupportAccess(userId);
  if (!access.ok) throw new Error("Not authorized");
  const { assertTwoFactorVerified } = await import("@/lib/server/two-factor.server");
  assertTwoFactorVerified(userId);
  return lookupUser(userId);
}

export async function resolveSessionDesks(userId: string): Promise<SessionDesks> {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, role) values (${userId}, 'parent')
    on conflict (user_id) do nothing
  `.catch(() => undefined);

  const access = await resolveAdminAccess(userId);
  const stored = access.ok ? "admin" : access.role;
  const owned = await ownsCentre(sql, userId);
  // Do not claim Parent Onboard here. A new profile defaults to parent, and
  // this loader runs for every signed-in page — including a daycare signup
  // before setRole("provider") lands. That filed providers on Parent Onboard.
  // Parent intake stays on an explicit parent choice. Provider intake still
  // runs once the stored role or an owned centre says this is a daycare.
  if (stored === "provider" || owned) await claimProviderCrmIntake(userId);
  const member = owned ? false : await isActiveCentreMember(sql, userId);
  const desks = desksFor({ role: stored, ownsCentre: owned || member });
  const { purgeAccountIfExpired, readDeletedAt } = await import("@/lib/server/family");
  const deletedAt = await readDeletedAt(userId);
  if (deletedAt && !withinRestoreWindow(deletedAt)) {
    await purgeAccountIfExpired(userId);
    throw new Error("Account closed");
  }
  const restoreUntil = deletedAt && withinRestoreWindow(deletedAt) ? restoreDeadline(deletedAt).toISOString() : null;
  const { all: unread, family: unreadFamily, centre: unreadCentre } = await unreadInboxCounts(sql, userId);
  const { countUnreadNotifications } = await import("@/lib/server/notifications");
  const notificationUnread = await countUnreadNotifications(userId).catch(() => 0);
  const attention = await loadAttention(
    sql,
    userId,
    stored,
    { all: unread, family: unreadFamily, centre: unreadCentre },
    notificationUnread,
  ).catch(() => ({ ...EMPTY_ATTENTION, notifications: notificationUnread }));
  const stripeLive = stripeChargesLive();
  const actor = await lookupUser(userId);
  return {
    role: stored,
    desks,
    email: actor.email ?? null,
    home: landingPath(desks),
    unread,
    unreadFamily,
    unreadCentre,
    notificationUnread,
    stripeLive,
    ledgerLabel: paymentSourceLabel(stripeLive),
    providerSubscriptions: canSeeProviderSubscriptions(stored, process.env, owned || member),
    showPayCtas: showPayCtas(),
    centreOwner: owned || stored === "admin" || !member,
    ownsCentre: owned,
    centreLinked: owned || member,
    attention,
    restoreUntil,
  };
}

export async function writeProfileRole(userId: string, requested: "parent" | "provider") {
  const sql = await getSql();
  const row = await profileRoleRow(sql, userId);
  const prev = row?.role ?? null;
  const created = row?.created_at ? new Date(row.created_at).getTime() : null;
  const ageMs = created != null && !Number.isNaN(created) ? Date.now() - created : null;
  const next = nextStoredRole(prev, requested);
  if (!prev) {
    await sql`insert into profiles (user_id, role) values (${userId}, ${next})`;
    return { role: next, previous: null as string | null };
  }
  const stored = parseAppRole(prev);
  if (isStaffRole(stored) || !roleFlipAllowed(prev, requested, ageMs)) {
    return { role: stored, previous: prev };
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

/**
 * Document GET /admin* — session + profiles.role = admin. Not a desk hint.
 * 2FA stays on TwoFactorGate / requireAdmin (API + mutations). Requiring
 * the device cookie here dumped Kyle's Admin click to `/`.
 */
export const assertAdminDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await resolveAdminAccess(context.userId);
    if (!access.ok) throw new Error("Not authorized");
    // Slide / mint idle when possible so /admin navigation keeps the desk
    // alive. Do not throw — data loaders still surface a real idle timeout.
    const { bootstrapAdminIdleFromSession } = await import("./reauth.server");
    await bootstrapAdminIdleFromSession(context.userId).catch(() => false);
    return { ok: true as const };
  });
