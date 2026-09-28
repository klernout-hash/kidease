import { createServerFn } from "@tanstack/react-start";
import { notFound, redirect } from "@tanstack/react-router";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";
import { e2eChromeFromRequest } from "@/lib/e2e-role-cookie";
import { guardPrivatePath, navRoleForSession, type ChromeRole } from "@/lib/role-access";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

/**
 * One role + plan lookup per request.
 *
 * Before this PR, a signed-in page ran resolveSessionDesks once (~12 SQL:
 * profile insert, role, admin lookup, centre ownership, three inbox counts,
 * notification count, user lookup). This PR briefly repeated that lookup
 * from every chrome component (6–7 times per page).
 *
 * Now the root guard loads this payload once and shares it. The query is
 * session + one profiles statement (role, plan, centre link, slugs). It does
 * not insert a profile and does not count unread messages. Desk pages still
 * call getMyDesks, with the three inbox counts collapsed into one query.
 * A public signed-in page is about 2 database calls. A desk page is about 9,
 * down from about 12 before this PR and far below the 6–7 full copies.
 */

export type RoleChromePayload = {
  signedIn: boolean;
  role: "parent" | "provider" | "admin" | "support" | null;
  paid: boolean;
  planLabel: string | null;
  renewsOn: string | null;
  ownedSlugs: string[];
  /** Loopback dev cookie only. Production builds never set this. */
  e2e: boolean;
  /** Auth or the role query failed. Do not redirect this visitor to /login. */
  degraded: boolean;
};

const EMPTY: RoleChromePayload = {
  signedIn: false,
  role: null,
  paid: false,
  planLabel: null,
  renewsOn: null,
  ownedSlugs: [],
  e2e: false,
  degraded: false,
};

const DEGRADED: RoleChromePayload = {
  signedIn: true,
  role: null,
  paid: false,
  planLabel: null,
  renewsOn: null,
  ownedSlugs: [],
  e2e: false,
  degraded: true,
};

const chromeByRequest = new WeakMap<Request, Promise<RoleChromePayload>>();

function bearerFrom(req: Request | null, explicit?: string): string | undefined {
  const direct = String(explicit || "").trim();
  if (direct) return direct;
  const header = req?.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1];
}

function flag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function slugList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).filter(Boolean);
  if (typeof value !== "string") return nullList(value);
  const trimmed = value.trim().replace(/^\{|\}$/g, "");
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function nullList(value: unknown): string[] {
  return value == null ? [] : [];
}

function storedNavRole(role: string | null, ownsCentre: boolean, activeMember: boolean): ChromeRole {
  return navRoleForSession({ role, ownsCentre, activeMember });
}

async function queryRoleRow(userId: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    role: string | null;
    plus_status: string | null;
    plus_plan: string | null;
    plus_current_period_end: string | Date | null;
    stripe_subscription_status: string | null;
    selected_plan: string | null;
    stripe_current_period_end: string | Date | null;
    owns_centre: boolean | null;
    active_member: boolean | null;
    slugs: unknown;
  }>`
    select
      p.role,
      p.plus_status,
      p.plus_plan,
      p.plus_current_period_end,
      p.stripe_subscription_status,
      p.selected_plan,
      p.stripe_current_period_end,
      exists (select 1 from provider_daycares pd where pd.user_id = p.user_id) as owns_centre,
      exists (
        select 1 from centre_members m
        where m.user_id = p.user_id and m.status = 'active'
      ) as active_member,
      (
        select coalesce(array_agg(d.slug), '{}')
        from daycares d
        where exists (
          select 1 from provider_daycares pd
          where pd.user_id = p.user_id and pd.daycare_id = d.id
        )
        or exists (
          select 1 from centre_members m
          where m.user_id = p.user_id and m.daycare_id = d.id and m.status = 'active'
        )
      ) as slugs
    from profiles p
    where p.user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function computeRoleChrome(bearer: string | undefined, req: Request | null): Promise<RoleChromePayload> {
  const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host") || "";
  const cookie = req?.headers.get("cookie") || "";
  const fixture = e2eChromeFromRequest({
    fixtureEnabled: process.env.E2E_ROLE_FIXTURE === "1",
    host,
    cookie,
    productionBuild: import.meta.env.PROD,
  });
  if (fixture) return fixture;

  const { getSessionUser } = await import("@/lib/auth/verify.server");
  let user: { id: string } | null = null;
  try {
    user = await withTimeout(getSessionUser(bearerFrom(req, bearer)), SQL_SETTLE_MS, "role-chrome-auth");
  } catch {
    return DEGRADED;
  }
  if (!user) return EMPTY;

  try {
    const row = await withTimeout(queryRoleRow(user.id), SQL_SETTLE_MS, "role-chrome-sql");
    const { subscriptionAccessOpen } = await import("@/lib/subscription-lifecycle");
    const ownsCentre = flag(row?.owns_centre);
    const activeMember = flag(row?.active_member);
    const nav = storedNavRole(row?.role ?? "parent", ownsCentre, activeMember);
    const role =
      nav === "admin" || nav === "support" || nav === "provider" || nav === "parent" ? nav : "parent";
    const iso = (value: string | Date | null | undefined) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
    let paid = false;
    let planLabel: string | null = null;
    let renewsOn: string | null = null;
    if ((role === "parent" || role === "admin") && subscriptionAccessOpen(row?.plus_status)) {
      const plan = String(row?.plus_plan || "");
      if (plan && plan !== "free") {
        paid = true;
        planLabel = plan === "alerts" ? "Parent Alerts" : "Parent Plus";
        renewsOn = iso(row?.plus_current_period_end);
      }
    }
    if ((role === "provider" || role === "admin") && subscriptionAccessOpen(row?.stripe_subscription_status)) {
      paid = true;
      planLabel = row?.selected_plan === "network" ? "Network" : "Pro";
      renewsOn = iso(row?.stripe_current_period_end);
    }
    const ownedSlugs = role === "provider" || role === "admin" ? slugList(row?.slugs) : [];
    return {
      signedIn: true,
      role,
      paid,
      planLabel,
      renewsOn,
      ownedSlugs,
      e2e: false,
      degraded: false,
    };
  } catch {
    return DEGRADED;
  }
}

async function loadRoleChrome(bearer?: string): Promise<RoleChromePayload> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest() ?? null;
  if (!req) return computeRoleChrome(bearer, null);
  const hit = chromeByRequest.get(req);
  if (hit) return hit;
  const pending = computeRoleChrome(bearer, req);
  chromeByRequest.set(req, pending);
  return pending;
}

export const getRoleChrome = createServerFn({ method: "GET" })
  .middleware([sessionBearerMiddleware])
  .handler(async ({ context }) => loadRoleChrome(context.bearerToken));

export async function beforeLoadPrivate(pathname: string, chrome?: RoleChromePayload | null) {
  const row = chrome ?? (await getRoleChrome());
  const decision = guardPrivatePath({
    pathname,
    signedIn: row.signedIn,
    role: row.role,
    degraded: row.degraded,
  });
  if (decision.kind === "signin") {
    throw redirect({
      to: "/login",
      search: { intent: "in" as const, next: decision.next },
    });
  }
  if (decision.kind === "home") {
    throw redirect({ href: decision.to });
  }
  if (decision.kind === "not_found") throw notFound();
}
