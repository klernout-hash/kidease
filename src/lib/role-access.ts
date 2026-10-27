/**
 * One account, one role. Public pages stay open. Private pages are decided
 * here so menus and server route guards cannot drift apart.
 * Canada only — provinces, never US states.
 */

import type { MenuIconId } from "@/lib/menu-icons";

export type ChromeRole = "guest" | "parent" | "provider" | "admin" | "support";

export type PrivateArea = "public" | "parent" | "provider" | "admin" | "shared";

export type GuardDecision =
  | { kind: "allow" }
  | { kind: "signin"; next: string }
  | { kind: "home"; to: string }
  | { kind: "not_found" };

export type RoleNavItem = {
  id: string;
  label: string;
  to: string;
  search?: Record<string, string>;
  icon: MenuIconId;
};

/** First explicit parent/provider choice can land during sign-up. Later flips stay put. */
export const ROLE_FLIP_WINDOW_MS = 30 * 60 * 1000;

export function chromeRole(role: string | null | undefined): ChromeRole {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (value === "admin") return "admin";
  if (value === "support" || value === "support_lead") return "support";
  if (value === "provider" || value === "daycare" || value === "director") return "provider";
  if (value === "parent") return "parent";
  return "guest";
}

export function barePath(raw: string | null | undefined): string {
  const trimmed = String(raw || "").trim();
  const path = (trimmed.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/fr") return "/";
  if (path.startsWith("/fr/")) return path.slice(3) || "/";
  return path;
}

export function homeForRole(role: string | null | undefined): string {
  switch (chromeRole(role)) {
    case "admin":
      return "/admin";
    case "support":
      return "/support";
    case "provider":
      return "/provider";
    case "parent":
      return "/parent";
    default:
      return "/";
  }
}

export function privateArea(pathname: string): PrivateArea {
  const path = barePath(pathname);
  if (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/admin-")
  ) {
    return "admin";
  }
  if (path === "/parent" || path.startsWith("/parent/")) return "parent";
  if (path === "/provider" || path.startsWith("/provider/")) return "provider";
  if (
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/inbox" ||
    path.startsWith("/inbox/") ||
    path === "/notifications" ||
    path.startsWith("/notifications/") ||
    path === "/delete-account"
  ) {
    return "shared";
  }
  return "public";
}

function allowsArea(area: PrivateArea, role: ChromeRole): boolean {
  if (area === "public") return true;
  if (role === "guest") return false;
  if (area === "shared") return true;
  if (area === "admin") return role === "admin";
  if (area === "parent") return role === "parent" || role === "provider" || role === "admin";
  if (area === "provider") return role === "provider" || role === "admin";
  return false;
}

/**
 * Full return path for a private page, including ?tab= and other search.
 * TanStack `href` is pathname + search. A bare pathname drops the query.
 */
export function privateReturnPath(location: { pathname: string; href?: string; searchStr?: string }): string {
  const href = String(location.href || "");
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  const raw = String(location.searchStr || "");
  const search = raw && raw !== "?" ? (raw.startsWith("?") ? raw : `?${raw}`) : "";
  return `${location.pathname || "/"}${search}`;
}

/**
 * Nav role. A stored parent who owns a centre or is an active centre member
 * is a provider for menus and page guards. Checkout still reads the stored role.
 */
export function navRoleForSession(input: {
  role?: string | null;
  ownsCentre?: boolean;
  activeMember?: boolean;
}): ChromeRole {
  const role = chromeRole(input.role);
  if (role === "parent" && (input.ownsCentre || input.activeMember)) return "provider";
  if (role === "guest") return "parent";
  return role;
}

/** Server loaders and the login return path both use this. */
export function guardPrivatePath(input: {
  pathname: string;
  signedIn: boolean;
  role?: string | null;
  /** Auth or the role query timed out. Do not send a maybe-signed-in visitor to /login. */
  degraded?: boolean;
}): GuardDecision {
  const area = privateArea(input.pathname);
  if (area === "public") return { kind: "allow" };
  if (area === "admin") {
    if (chromeRole(input.role) !== "admin") return { kind: "not_found" };
    return { kind: "allow" };
  }
  const next = input.pathname.startsWith("/") ? input.pathname : homeForRole(input.role);
  if (!input.signedIn) {
    if (input.degraded) return { kind: "allow" };
    return { kind: "signin", next };
  }
  const role = chromeRole(input.role);
  if (input.degraded && role === "guest") return { kind: "allow" };
  if (role === "guest") return { kind: "allow" };
  if (allowsArea(area, role)) return { kind: "allow" };
  return { kind: "home", to: homeForRole(input.role) };
}

function parentDeskNext(next: string): boolean {
  const path = barePath(next);
  return path === "/parent" || path.startsWith("/parent/");
}

/**
 * After sign-in, honour a public return path. A private URL is kept only when
 * this role may open it. Otherwise send them to their own home.
 * A daycare account (provider role, or a parent profile that owns or works at
 * a centre) opens /provider. A leftover /parent next does not send them to
 * the parent desk. Admin still keeps an explicit Parent next.
 */
export function destinationAfterSignIn(input: {
  role?: string | null;
  next?: string | null;
  /** Centre owner or active centre staff. Ignored for admin and support. */
  ownsCentre?: boolean;
}): string {
  const role = chromeRole(input.role);
  const daycare =
    role === "provider" ||
    (input.ownsCentre === true && role !== "admin" && role !== "support");
  const home = daycare ? "/provider" : role === "guest" ? "/parent" : homeForRole(role);
  const next = String(input.next || "").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return home;
  if (daycare && parentDeskNext(next)) return "/provider";
  const decision = guardPrivatePath({
    pathname: next,
    signedIn: true,
    role: daycare ? "provider" : input.role,
  });
  if (decision.kind === "allow") return next;
  if (decision.kind === "home") return decision.to;
  return home;
}

export function upgradeNavLabel(paid: boolean): "Upgrade" | "My plan" {
  return paid ? "My plan" : "Upgrade";
}

/** Phone bottom bar. Daycare desk paths stay daycare even for an admin tester. */
export function bottomBarKind(input: {
  role: ChromeRole;
  pathname: string;
  pending: boolean;
  /**
   * Desk already resolved from the path, `?desk=`, and the sticky desk.
   * Family desk (`parent`) keeps parent tabs for a dual-role daycare account.
   */
  highlightedDesk?: "parent" | "provider" | "admin" | "support" | null;
}): "daycare" | "parent" | "admin" | "guest" {
  const path = barePath(input.pathname);
  if (path.startsWith("/provider")) return "daycare";
  if (path.startsWith("/parent")) return "parent";
  if (input.highlightedDesk === "parent") return "parent";
  if (input.highlightedDesk === "provider") return "daycare";
  if (input.highlightedDesk === "admin") return "admin";
  if (input.pending || input.role === "guest") return "guest";
  if (input.role === "provider") return "daycare";
  if (input.role === "admin") return "admin";
  return "parent";
}

export function roleNavItems(input: { role: ChromeRole; paid?: boolean; subscriptionsOn?: boolean }): RoleNavItem[] {
  const paid = Boolean(input.paid);
  const planLabel = upgradeNavLabel(paid);
  if (input.role === "parent") {
    const items: RoleNavItem[] = [
      { id: "home", label: "Home", to: "/parent", icon: "parent" },
      { id: "search", label: "Search", to: "/search", icon: "explore" },
      { id: "saved", label: "Saved", to: "/parent", search: { tab: "saved" }, icon: "saved" },
      { id: "requests", label: "Requests", to: "/parent", search: { tab: "requests" }, icon: "tourChecklist" },
      { id: "messages", label: "Messages", to: "/inbox", search: { view: "family" }, icon: "messages" },
    ];
    if (input.subscriptionsOn === true) {
      items.push({ id: "upgrade", label: planLabel, to: "/parent", search: { tab: "subscription" }, icon: "benefits" });
    }
    items.push({ id: "account", label: "Account", to: "/account", search: { tab: "profile" }, icon: "account" });
    return items;
  }
  if (input.role === "provider") {
    const items: RoleNavItem[] = [
      { id: "desk", label: "Today", to: "/provider", search: { desk: "today" }, icon: "daycare" },
      { id: "requests", label: "Requests", to: "/provider", search: { desk: "requests" }, icon: "tourChecklist" },
      { id: "listing", label: "Listings", to: "/provider", search: { desk: "listings" }, icon: "claim" },
      { id: "messages", label: "Messages", to: "/inbox", search: { view: "centre" }, icon: "messages" },
      { id: "account", label: "Account", to: "/account", search: { tab: "profile" }, icon: "account" },
    ];
    if (input.subscriptionsOn === true) {
      items.splice(4, 0, { id: "upgrade", label: planLabel, to: "/provider/subscription", icon: "benefits" });
    }
    return items;
  }
  if (input.role === "admin") {
    return [
      { id: "queue", label: "Home", to: "/admin", search: { tab: "queue" }, icon: "verify" },
      { id: "review", label: "Review", to: "/admin", search: { tab: "verify" }, icon: "verify" },
      { id: "messages", label: "Messages", to: "/admin", search: { tab: "mail" }, icon: "messages" },
      { id: "support", label: "Support", to: "/support", icon: "support" },
      { id: "account", label: "Account", to: "/account", search: { tab: "profile" }, icon: "account" },
    ];
  }
  if (input.role === "support") {
    return [
      { id: "support", label: "Support", to: "/support", icon: "support" },
      { id: "search", label: "Search", to: "/search", icon: "explore" },
      { id: "account", label: "Account", to: "/account", search: { tab: "profile" }, icon: "account" },
    ];
  }
  const guest: RoleNavItem[] = [
    { id: "signin", label: "Sign in", to: "/login", icon: "login" },
    { id: "create", label: "Create an account", to: "/login", search: { intent: "up" }, icon: "parent" },
    { id: "list", label: "List your daycare", to: "/claim", icon: "claim" },
  ];
  if (input.subscriptionsOn === true) {
    guest.push({ id: "plans", label: "Plans", to: "/plans", icon: "benefits" });
  }
  guest.push(
    { id: "search", label: "Search", to: "/search", icon: "explore" },
    { id: "help", label: "Help centre", to: "/help", icon: "help" },
  );
  return guest;
}

export type ListingActionMode = "parent" | "edit" | "none" | "all";

/** Parents and guests get parent actions. A daycare account never does. Edit stays on the owner's own listing. */
export function listingActionMode(input: { role: ChromeRole; ownsListing: boolean }): ListingActionMode {
  if (input.role === "admin") return "all";
  if (input.role === "provider" && input.ownsListing) return "edit";
  if (input.role === "provider") return "none";
  if (input.role === "parent" || input.role === "guest") return "parent";
  return "none";
}

/** Search cards and other centres. A daycare account does not get waitlist, info, or save. */
export function showsParentBrowseActions(role: ChromeRole | null | undefined): boolean {
  const chrome = role === "admin" || role === "provider" || role === "parent" || role === "support" || role === "guest" ? role : "guest";
  return showsParentListingActions(listingActionMode({ role: chrome, ownsListing: false }));
}

export function showsParentListingActions(mode: ListingActionMode): boolean {
  return mode === "parent" || mode === "all";
}

export function showsOwnListingEdit(mode: ListingActionMode, ownsListing: boolean): boolean {
  return ownsListing && (mode === "edit" || mode === "all");
}

/**
 * A stored parent or daycare role stays put after the sign-up window.
 * Staff roles are never overwritten. A brand-new profile may take the
 * requested role once.
 */
export function roleFlipAllowed(
  current: string | null | undefined,
  requested: "parent" | "provider",
  ageMs: number | null,
): boolean {
  if (!current) return true;
  const cur = chromeRole(current);
  if (cur === "admin" || cur === "support") return false;
  if (cur === "guest") return true;
  const stored = cur === "provider" ? "provider" : "parent";
  if (stored === requested) return true;
  if (ageMs == null) return false;
  return ageMs >= 0 && ageMs <= ROLE_FLIP_WINDOW_MS;
}
