/**
 * Loopback role cookie. Production builds ignore it even when
 * E2E_ROLE_FIXTURE=1 is set. Admin is never accepted, so the cookie cannot
 * pass the admin desk gate.
 */

export type E2eCookieChrome = {
  signedIn: true;
  role: "parent" | "provider";
  paid: boolean;
  planLabel: string | null;
  renewsOn: string | null;
  ownedSlugs: string[];
  e2e: true;
  degraded: false;
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

export function loopbackHost(host: string): boolean {
  const first = host.split(",")[0]?.trim().toLowerCase() ?? "";
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(first);
}

export function e2eChromeFromRequest(input: {
  fixtureEnabled: boolean;
  host: string;
  cookie: string;
  productionBuild: boolean;
}): E2eCookieChrome | null {
  if (input.productionBuild) return null;
  if (!input.fixtureEnabled || !loopbackHost(input.host)) return null;
  const role = cookieValue(input.cookie, "kidease_e2e_role");
  if (role === "admin") return null;
  if (role !== "parent" && role !== "provider") return null;
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
    degraded: false,
  };
}
