import { createServerFn } from "@tanstack/react-start";
import { notFound, redirect } from "@tanstack/react-router";
import { guardPrivatePath } from "@/lib/role-access";

export type RoleChromePayload = {
  signedIn: boolean;
  role: "parent" | "provider" | "admin" | "support" | null;
  paid: boolean;
  planLabel: string | null;
  renewsOn: string | null;
  ownedSlugs: string[];
  /** Loopback preview only. Never set in production. */
  e2e: boolean;
};

const EMPTY: RoleChromePayload = {
  signedIn: false,
  role: null,
  paid: false,
  planLabel: null,
  renewsOn: null,
  ownedSlugs: [],
  e2e: false,
};

function cookieValue(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function loopbackHost(host: string): boolean {
  const first = host.split(",")[0]?.trim().toLowerCase() ?? "";
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(first);
}

/**
 * E2E role cookie. Honoured only when the preview process sets
 * E2E_ROLE_FIXTURE=1 and the request host is loopback. Production never
 * sets that variable, so the cookie is ignored on KidEase.
 */
export function e2eChromeFromRequest(input: {
  fixtureEnabled: boolean;
  host: string;
  cookie: string;
}): RoleChromePayload | null {
  if (!input.fixtureEnabled || !loopbackHost(input.host)) return null;
  const role = cookieValue(input.cookie, "kidease_e2e_role");
  if (role !== "parent" && role !== "provider" && role !== "admin") return null;
  const paid = cookieValue(input.cookie, "kidease_e2e_plan") === "paid";
  const own = cookieValue(input.cookie, "kidease_e2e_own");
  const planLabel = !paid ? null : role === "parent" ? "Parent Plus" : "Pro";
  return {
    signedIn: true,
    role,
    paid,
    planLabel,
    renewsOn: paid ? "2026-10-01T00:00:00.000Z" : null,
    ownedSlugs: own ? [own] : [],
    e2e: true,
  };
}

async function loadRoleChrome(): Promise<RoleChromePayload> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host") || "";
  const cookie = req?.headers.get("cookie") || "";
  const fixture = e2eChromeFromRequest({
    fixtureEnabled: process.env.E2E_ROLE_FIXTURE === "1",
    host,
    cookie,
  });
  if (fixture) return fixture;

  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser().catch(() => null);
  if (!user) return EMPTY;

  const { resolveSessionDesks } = await import("@/lib/server/roles");
  const desks = await resolveSessionDesks(user.id).catch(() => null);
  if (!desks) return { ...EMPTY, signedIn: true, role: "parent" };

  const role =
    desks.role === "admin"
      ? "admin"
      : desks.role === "support" || desks.role === "support_lead"
        ? "support"
        : desks.role === "provider"
          ? "provider"
          : "parent";

  let paid = false;
  let planLabel: string | null = null;
  let renewsOn: string | null = null;
  let ownedSlugs: string[] = [];
  try {
    const { getSql } = await import("@/lib/db");
    const { subscriptionAccessOpen } = await import("@/lib/subscription-lifecycle");
    const sql = await getSql();
    const rows = await sql<{
      plus_status: string | null;
      plus_plan: string | null;
      plus_current_period_end: string | Date | null;
      stripe_subscription_status: string | null;
      selected_plan: string | null;
      stripe_current_period_end: string | Date | null;
    }>`
      select plus_status, plus_plan, plus_current_period_end,
             stripe_subscription_status, selected_plan, stripe_current_period_end
      from profiles where user_id = ${user.id} limit 1
    `;
    const row = rows[0];
    const iso = (value: string | Date | null | undefined) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
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
    if (role === "provider" || role === "admin") {
      const slugs = await sql<{ slug: string }>`
        select d.slug
        from daycares d
        where exists (
          select 1 from provider_daycares p
          where p.user_id = ${user.id} and p.daycare_id = d.id
        )
        or exists (
          select 1 from centre_members m
          where m.user_id = ${user.id} and m.daycare_id = d.id and m.status = 'active'
        )
      `;
      ownedSlugs = slugs.map((item) => item.slug).filter(Boolean);
    }
  } catch {
    paid = false;
  }

  return {
    signedIn: true,
    role,
    paid,
    planLabel,
    renewsOn,
    ownedSlugs,
    e2e: false,
  };
}

export const getRoleChrome = createServerFn({ method: "GET" }).handler(async () => loadRoleChrome());

export async function beforeLoadPrivate(pathname: string) {
  const chrome = await getRoleChrome();
  const decision = guardPrivatePath({
    pathname,
    signedIn: chrome.signedIn,
    role: chrome.role,
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
