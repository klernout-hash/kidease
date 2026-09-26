import { isKidEaseOperatorEmail } from "./admin-email.ts";

export type AppRole = "admin" | "support_lead" | "support" | "provider" | "parent";
export type DeskKey = "admin" | "support" | "provider" | "parent";

export const DESK_PATH: Record<DeskKey, "/admin" | "/support" | "/provider" | "/parent"> = {
  admin: "/admin",
  support: "/support",
  provider: "/provider",
  parent: "/parent",
};

export const DESK_LABEL: Record<DeskKey, string> = {
  admin: "Admin",
  support: "Support",
  provider: "Daycare",
  parent: "Parent",
};

/** Public deep-link aliases for `?desk=`. Provider tabs (listings, money, …) are not desks. */
export const DESK_QUERY_ALIASES: Record<string, DeskKey> = {
  parent: "parent",
  director: "provider",
  centre: "provider",
  center: "provider",
  daycare: "provider",
  provider: "provider",
  admin: "admin",
  support: "support",
};

export const PROVIDER_TAB_KEYS = [
  "today",
  "requests",
  "money",
  "listings",
  "tours",
  "licence",
  "license",
  "contract",
  "promote",
  "employees",
  "screening",
] as const;

export const STICKY_DESK_KEY = "kidease-desk";
/** One-shot: home already sent this tab to a desk. Cleared on sign-out. */
export const DESK_LANDED_KEY = "kidease-desk-landed";
/** One-shot: skip desk bounce / login auto-continue after sign-out. */
export const JUST_SIGNED_OUT_KEY = "kidease-just-signed-out";
export const REMEMBERED_ROLE_KEY = "kidease-role";

const PATH_DESK: Array<[string, DeskKey]> = [
  ["/admin", "admin"],
  ["/support", "support"],
  ["/provider", "provider"],
  ["/parent", "parent"],
];

/** Shared account / inbox / menu — do not rewrite the sticky desk from these. */
export function isDeskNeutralPath(pathname: string): boolean {
  return deskFromPathname(pathname) === null;
}

/** Highlight the last desk on shared pages so Account/Messages keep Daycare context. */
export function highlightDesk(
  pathname: string,
  sticky?: DeskKey | null,
  queryDesk?: DeskKey | null,
): DeskKey | null {
  return deskFromPathname(pathname) ?? queryDesk ?? sticky ?? null;
}

/** sessionStorage first (this tab), then localStorage (other tabs / refresh). */
export function stickyFromStores(sessionValue: string | null, localValue: string | null): DeskKey | null {
  return parseDeskQuery(sessionValue) ?? parseDeskQuery(localValue);
}

/**
 * First `/` visit for a signed-in multi-role user. Sticky desk wins so Kyle
 * on Parent is not dumped back to Admin. Parent stays on Explore (`/` → null).
 */
export function homeLandPath(input: {
  role?: AppRole | null;
  desks?: DeskKey[] | null;
  sticky?: DeskKey | null;
  remembered?: "parent" | "provider" | null;
}): "/admin" | "/support" | "/provider" | null {
  if (input.remembered === "parent") return null;
  if (input.remembered === "provider") {
    return input.sticky === "parent" ? null : "/provider";
  }
  const desks = input.desks?.length ? input.desks : input.role ? desksFor({ role: input.role }) : null;
  const sticky = input.sticky;
  if (sticky && (!desks || desks.includes(sticky))) {
    if (sticky === "admin") return "/admin";
    if (sticky === "support") return "/support";
    if (sticky === "provider") return "/provider";
    return null;
  }
  if (!input.role) return null;
  if (input.role === "admin") return "/admin";
  if (input.role === "provider") return "/provider";
  if (input.role === "support" || input.role === "support_lead") return "/support";
  return null;
}

/** Shared Account settings — keep `?desk=` so the pill stays on the current desk. */
export function accountSearch(desk?: DeskKey | null): {
  tab: "profile";
  desk?: "parent" | "director" | "admin" | "support";
} {
  return desk ? { tab: "profile", desk: deskQueryValue(desk) } : { tab: "profile" };
}

export function parseDeskQuery(raw: string | null | undefined): DeskKey | null {
  const v = (raw || "").trim().toLowerCase();
  return DESK_QUERY_ALIASES[v] ?? null;
}

export function isProviderTabKey(raw: string | null | undefined): boolean {
  const v = (raw || "").trim().toLowerCase();
  return (PROVIDER_TAB_KEYS as readonly string[]).includes(v);
}

/** Canonical `?desk=` value for a role desk (director, not provider). */
export function deskQueryValue(desk: DeskKey): "parent" | "director" | "admin" | "support" {
  if (desk === "provider") return "director";
  return desk;
}

export function loginRoleFromDesk(desk: DeskKey): "parent" | "provider" | "admin" {
  if (desk === "admin") return "admin";
  if (desk === "provider") return "provider";
  return "parent";
}

/** Admin / support desks fail closed when 2FA status cannot be read. */
export function staffTwoFactorRequired(next: string): boolean {
  const path = (next.split("?")[0] || next).trim();
  return (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/admin-") ||
    path === "/support" ||
    path.startsWith("/support/")
  );
}

export type TwoFactorGateState = "ok" | "need";

/**
 * Desk 2FA: staff fail closed. Parent / provider 2FA is optional — treating
 * `verified: false` as `need` sends them to /verify-2fa, which fail-opens
 * back to the desk without a cookie and flash-loops.
 */
export function twoFactorGateState(verified: boolean, next: string): TwoFactorGateState {
  return !verified && staffTwoFactorRequired(next) ? "need" : "ok";
}

/** Login funnel: only staff desks open /verify-2fa. Public/home and parent/provider do not. */
export function shouldOpenTwoFactorForDest(dest: string, verified: boolean): boolean {
  const kind = postLoginDestKind(dest);
  if (kind === "public" || kind === "home") return false;
  return twoFactorGateState(verified, dest) === "need";
}

/**
 * One hop of the desk ↔ /verify-2fa machine. Parent/provider skip or
 * start/status failure must land on the desk and stay there while unverified.
 */
export function nextTwoFactorNav(input: {
  at: string;
  dest: string;
  verified: boolean;
  /** Status/start failed or skip — leave() without writing the device cookie. */
  leftWithoutCookie?: boolean;
}): string {
  const dest = sanitizePostLoginNext(input.dest) ?? DESK_PATH.parent;
  const at = pathnameOfDest(input.at) || input.at;
  if (at === "/verify-2fa") {
    if (input.verified) return dest;
    if (input.leftWithoutCookie) return staffTwoFactorRequired(dest) ? "/verify-2fa" : dest;
    return "/verify-2fa";
  }
  if (twoFactorGateState(input.verified, at) === "need") return twoFactorPageUrl(dest);
  return at;
}

export function deskFromPathname(pathname: string): DeskKey | null {
  for (const [prefix, desk] of PATH_DESK) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return desk;
  }
  return null;
}

export function pickLandingDesk(desks: DeskKey[], preferred?: DeskKey | null): DeskKey {
  if (preferred && desks.includes(preferred)) return preferred;
  return primaryDesk(desks);
}

/** Auth pages that must never be a post-login `next` (they loop the funnel). */
export const AUTH_LOOP_PATHS = ["/login", "/verify-2fa", "/forgot-password", "/reset-password"] as const;

export function pathnameOfDest(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed.split("?")[0] || "";
}

/**
 * Paths Cloudflare Access may wall (staff only). Parent / Daycare / login
 * must never be treated as Access destinations. See docs/cloudflare.md.
 */
export function isCloudflareAccessPath(raw: string): boolean {
  const path = pathnameOfDest(raw);
  if (!path) return false;
  return (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/admin-") ||
    path === "/support" ||
    path.startsWith("/support/")
  );
}

function familyLoginDesk(input: {
  desk?: DeskKey | null;
  role?: "parent" | "provider" | "admin" | null;
}): "parent" | "provider" | null {
  if (input.role === "parent" || input.desk === "parent") return "parent";
  if (input.role === "provider" || input.desk === "provider") return "provider";
  return null;
}

export function isAuthLoopPath(raw: string): boolean {
  const path = pathnameOfDest(raw);
  if (!path) return false;
  return AUTH_LOOP_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Unwrap `?next=` on auth pages, drop protocol-relative / oversized / loop
 * targets, and treat `/` as "no next" so desk resolution can run.
 */
export function sanitizePostLoginNext(raw?: string | null, depth = 0): string | null {
  if (depth > 4) return null;
  const trimmed = (raw || "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.length > 512) return null;
  const path = pathnameOfDest(trimmed);
  if (!path || path === "/") return null;
  if (isAuthLoopPath(path)) {
    const q = trimmed.indexOf("?");
    if (q === -1) return null;
    const nested = new URLSearchParams(trimmed.slice(q + 1)).get("next");
    return nested ? sanitizePostLoginNext(nested, depth + 1) : null;
  }
  return trimmed;
}

export type PostLoginDestKind = "desk" | "public" | "home" | "auth";

export function postLoginDestKind(raw: string): PostLoginDestKind {
  const path = pathnameOfDest(raw) || "/";
  if (isAuthLoopPath(path)) return "auth";
  if (path === "/") return "home";
  if (deskFromPathname(path)) return "desk";
  return "public";
}

/** Safe path label for analytics — never a raw query string or listing slug. */
export function funnelDestPath(raw: string): string {
  const path = pathnameOfDest(raw) || "/";
  const desk = deskFromPathname(path);
  if (desk) return DESK_PATH[desk];
  if (
    path === "/" ||
    path === "/search" ||
    path === "/account" ||
    path === "/inbox" ||
    path === "/delete-account" ||
    path === "/unsubscribe"
  ) {
    return path;
  }
  if (path.startsWith("/daycare/")) return "/daycare";
  if (path === "/invite" || path.startsWith("/invite/")) return "/invite";
  if (isAuthLoopPath(path)) return path;
  return "/other";
}

/**
 * Where login should send the browser after a successful password/social
 * sign-in. An explicit `next` (Parent pill, /parent gate, deep link) always
 * wins — including for admin — so Kyle can open Parent desk on the same
 * session. `?desk=` / `?role=parent` also prefer that desk over primaryDesk
 * (admin), which would otherwise dump them on /admin or /provider.
 * Parent / Daycare login never lands on a Cloudflare Access path, even if
 * sticky desk or leftover `next` is /admin or /support.
 * Auth-loop `next` values and `/` fall through to desk resolution so a
 * successful sign-in is not scored as a home bounce.
 */
export function resolvePostLoginPath(input: {
  next?: string | null;
  desk?: DeskKey | null;
  role?: "parent" | "provider" | "admin" | null;
  desks?: DeskKey[] | null;
  sticky?: DeskKey | null;
}): string {
  const familyDesk = familyLoginDesk(input);
  const next = sanitizePostLoginNext(input.next);
  if (next) {
    if (familyDesk && isCloudflareAccessPath(next)) return DESK_PATH[familyDesk];
    return next;
  }
  const fromRole: DeskKey | null =
    input.role === "parent" ? "parent" : input.role === "provider" ? "provider" : input.role === "admin" ? "admin" : null;
  let preferred = input.desk ?? fromRole ?? input.sticky ?? null;
  if (familyDesk && (preferred === "admin" || preferred === "support")) {
    preferred = familyDesk;
  }
  if (input.desks?.length) return DESK_PATH[pickLandingDesk(input.desks, preferred)];
  if (preferred) return DESK_PATH[preferred];
  return DESK_PATH.parent;
}

export function twoFactorPageUrl(dest: string): string {
  const next = sanitizePostLoginNext(dest) ?? DESK_PATH.parent;
  return `/verify-2fa?next=${encodeURIComponent(next)}`;
}

export function loginErrorCallbackUrl(search: {
  next?: string;
  role?: string;
  desk?: string;
  intent?: string;
}): string {
  const params = new URLSearchParams();
  if (search.intent === "in" || search.intent === "up" || search.intent === "admin") {
    params.set("intent", search.intent);
  }
  if (search.role === "parent" || search.role === "provider" || search.role === "admin") {
    params.set("role", search.role);
  }
  if (search.desk) params.set("desk", search.desk);
  const next = sanitizePostLoginNext(search.next);
  if (next) params.set("next", next);
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}

/**
 * Admin / operator login: email + password first (Titan mailbox), not Google.
 * Matches role=admin, desk=admin, intent=admin, and next=/admin*.
 * Parent / Daycare desks stay on the social-first login.
 */
export function isAdminLoginIntent(search: {
  role?: string | null;
  desk?: string | null;
  intent?: string | null;
  next?: string | null;
}): boolean {
  const role = (search.role || "").trim().toLowerCase();
  if (role === "parent" || role === "provider") return false;
  const desk = parseDeskQuery(search.desk);
  if (desk === "parent" || desk === "provider") return false;
  if (role === "admin") return true;
  if ((search.intent || "").trim().toLowerCase() === "admin") return true;
  if (desk === "admin") return true;
  const next = sanitizePostLoginNext(search.next);
  if (!next) return false;
  const path = pathnameOfDest(next);
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-");
}

export function readStickyDesk(): DeskKey | null {
  if (typeof window === "undefined") return null;
  try {
    return stickyFromStores(
      window.sessionStorage.getItem(STICKY_DESK_KEY),
      window.localStorage.getItem(STICKY_DESK_KEY),
    );
  } catch {
    return null;
  }
}

export function writeStickyDesk(desk: DeskKey): void {
  if (typeof window === "undefined") return;
  const value = deskQueryValue(desk);
  try {
    window.sessionStorage.setItem(STICKY_DESK_KEY, value);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem(STICKY_DESK_KEY, value);
  } catch {
    /* ignore */
  }
}

/**
 * Full document navigation to the Admin desk. SPA Link hops skip Cloudflare
 * Access on `/admin` and can bounce via beforeLoad without painting the desk.
 */
export function openAdminDesk(): void {
  writeStickyDesk("admin");
  if (typeof window === "undefined") return;
  window.location.assign(DESK_PATH.admin);
}

export function clearStickyDesk(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STICKY_DESK_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(STICKY_DESK_KEY);
  } catch {
    /* ignore */
  }
}

export function clearDeskLanded(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DESK_LANDED_KEY);
  } catch {
    /* ignore */
  }
}

export function markJustSignedOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JUST_SIGNED_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True once after sign-out so home/login do not bounce back into a desk. */
export function consumeJustSignedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flagged = window.sessionStorage.getItem(JUST_SIGNED_OUT_KEY) === "1";
    if (flagged) window.sessionStorage.removeItem(JUST_SIGNED_OUT_KEY);
    return flagged;
  } catch {
    return false;
  }
}

export function rememberRoleChoice(role: "parent" | "provider"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMEMBERED_ROLE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function forgetRememberedRole(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REMEMBERED_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export function readRememberedRole(): "parent" | "provider" | null {
  if (typeof window === "undefined") return null;
  try {
    const role = window.localStorage.getItem(REMEMBERED_ROLE_KEY);
    return role === "parent" || role === "provider" ? role : null;
  } catch {
    return null;
  }
}

export const ROLE_RANK: Record<AppRole, number> = {
  parent: 0,
  provider: 1,
  support: 2,
  support_lead: 3,
  admin: 4,
};

export function parseAppRole(raw: string | null | undefined): AppRole {
  const v = (raw || "").trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "support_lead") return "support_lead";
  if (v === "support") return "support";
  if (v === "provider") return "provider";
  return "parent";
}

export function isStaffRole(role: AppRole | string | null | undefined): boolean {
  const r = parseAppRole(role);
  return r === "admin" || r === "support" || r === "support_lead";
}

export function primaryDesk(desks: DeskKey[]): DeskKey {
  if (desks.includes("admin")) return "admin";
  if (desks.includes("support")) return "support";
  if (desks.includes("provider")) return "provider";
  return "parent";
}

export function landingPath(desks: DeskKey[]): "/admin" | "/support" | "/provider" | "/parent" {
  return DESK_PATH[primaryDesk(desks)];
}

/**
 * Desks the signed-in user may open.
 * Dual parent + daycare on one Better Auth session is allowed (same email,
 * same cookie). `profiles.role` is a single stored primary — never put role
 * on the Better Auth session/JWT. DeskSwitcher is navigation-only.
 * A provider also keeps Parent so they can use a parent profile on the same email.
 */
export function desksFor(input: {
  role: AppRole;
  ownsCentre?: boolean;
}): DeskKey[] {
  const desks = new Set<DeskKey>(["parent"]);
  if (input.role === "admin") {
    desks.add("admin");
    desks.add("support");
    desks.add("provider");
  }
  if (input.role === "support" || input.role === "support_lead") {
    desks.add("support");
  }
  if (input.role === "provider" || input.ownsCentre) {
    desks.add("provider");
  }
  return (["admin", "support", "provider", "parent"] as const).filter((d) => desks.has(d));
}

/**
 * Admin pill + /admin — profiles.role = admin AND (when email is known)
 * the session mailbox is kyle@kidease.ca. Role-only callers (unit tests)
 * still pass without an email; chrome must pass session email.
 */
export function canSeeAdminDesk(
  role: AppRole | string | null | undefined,
  email?: string | null,
) {
  if (parseAppRole(role) !== "admin") return false;
  if (email === undefined) return true;
  return isKidEaseOperatorEmail(email);
}

/**
 * Fail closed: Admin requires profiles.role = admin and kyle@ when email
 * is known. A missing role or a stale desk list must never unlock /admin.
 */
export function canVisitDesk(
  desks: DeskKey[],
  desk: DeskKey,
  role?: AppRole | null,
  email?: string | null,
) {
  if (desk === "admin") return desks.includes("admin") && canSeeAdminDesk(role, email);
  return desks.includes(desk);
}

/** Drop a persisted desk the current session is not allowed to open. */
export function sanitizeStickyDesk(
  sticky: DeskKey | null | undefined,
  desks: DeskKey[],
  role?: AppRole | null,
  email?: string | null,
): DeskKey | null {
  if (!sticky) return null;
  return canVisitDesk(desks, sticky, role, email) ? sticky : null;
}

/**
 * Header pills — only desks this session is allowed to open.
 * Admin: kyle@kidease.ca + profiles.role = admin. Parent/Daycare-only never
 * see Admin, even if a stale desk list included it.
 * Parent: stored parent/admin/support only. Daycare-only (provider role) does
 * not get a Parent pill just because desksFor also keeps /parent reachable.
 * Admin (kyle) still sees Admin + Parent + Daycare. Support stays in the menu.
 */
export function headerDesks(
  desks: DeskKey[],
  role?: AppRole | null,
  email?: string | null,
): DeskKey[] {
  const visible = desks.filter((desk) => canVisitDesk(desks, desk, role, email));
  const gated = visible.filter((desk) => {
    if (desk === "admin") return canSeeAdminDesk(role, email);
    if (desk === "parent" && role != null) {
      const stored = parseAppRole(role);
      return stored === "parent" || stored === "admin" || stored === "support" || stored === "support_lead";
    }
    return true;
  });
  if (gated.includes("admin")) {
    return (["admin", "parent", "provider"] as const).filter((d) => gated.includes(d));
  }
  return gated;
}

/** Header / menu switcher — only when this session actually has two visible desks. */
export function showDeskSwitcher(
  desks: DeskKey[] | undefined | null,
  role?: AppRole | null,
  email?: string | null,
) {
  return Boolean(desks && headerDesks(desks, role, email).length >= 2);
}

export type SessionDesks = {
  role: AppRole;
  desks: DeskKey[];
  /** Session mailbox — required to show Admin chrome (kyle@kidease.ca only). */
  email?: string | null;
  home: "/admin" | "/support" | "/provider" | "/parent";
  unread: number;
  /** Parent / family inbox unread (conversation.user_id = session). */
  unreadFamily?: number;
  /** Centre inbox unread (director / staff threads). */
  unreadCentre?: number;
  /** In-app notification unread. Fail closed: 0 when the query errors. */
  notificationUnread: number;
  stripeLive: boolean;
  ledgerLabel: string;
  /** Subscription tab on the centre desk (live for directors; admin always). */
  providerSubscriptions: boolean;
  /** Parent/director Upgrade · Subscribe chrome. Default off. */
  showPayCtas: boolean;
  /** Owner chrome (Money / claim / invite). False only for staff-only employees. */
  centreOwner?: boolean;
  /** This user owns a centre (provider_daycares). Not the same as centreOwner. */
  ownsCentre?: boolean;
  /** Owns a centre or is an active centre member. */
  centreLinked?: boolean;
};

/**
 * Never demote staff when a page or claim writes provider/parent.
 * Never elevate parent/provider to admin or support via setRole — only
 * resolveAdminAccess (kyle@kidease.ca only) grants Admin.
 */
export function nextStoredRole(current: AppRole | string | null | undefined, requested: AppRole): AppRole {
  const cur = parseAppRole(current);
  if (cur === "admin") return "admin";
  if (cur === "support_lead") return "support_lead";
  if (cur === "support") return "support";
  if (requested === "admin" || requested === "support" || requested === "support_lead") return cur;
  return requested;
}
