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
  if (area === "parent") return role === "parent" || role === "admin";
  if (area === "provider") return role === "provider" || role === "admin";
  return false;
}

/** Server loaders and the login return path both use this. */
export function guardPrivatePath(input: {
  pathname: string;
  signedIn: boolean;
  role?: string | null;
}): GuardDecision {
  const area = privateArea(input.pathname);
  if (area === "public") return { kind: "allow" };
  if (area === "admin") {
    if (!input.signedIn || chromeRole(input.role) !== "admin") return { kind: "not_found" };
    return { kind: "allow" };
  }
  const next = input.pathname.startsWith("/") ? input.pathname : homeForRole(input.role);
  if (!input.signedIn) return { kind: "signin", next };
  if (allowsArea(area, chromeRole(input.role))) return { kind: "allow" };
  return { kind: "home", to: homeForRole(input.role) };
}

/**
 * After sign-in, honour a public return path. A private URL is kept only when
 * this role may open it. Otherwise send them to their own home.
 */
export function destinationAfterSignIn(input: {
  role?: string | null;
  next?: string | null;
}): string {
  const role = chromeRole(input.role);
  const home = role === "guest" ? "/parent" : homeForRole(role);
  const next = String(input.next || "").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return home;
  const decision = guardPrivatePath({ pathname: next, signedIn: true, role: input.role });
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
}): "daycare" | "parent" | "admin" | "guest" {
  if (input.pathname.startsWith("/provider")) return "daycare";
  if (input.pathname.startsWith("/parent")) return "parent";
  if (input.pending || input.role === "guest") return "guest";
  if (input.role === "provider") return "daycare";
  if (input.role === "admin") return "admin";
  return "parent";
}

export function roleNavItems(input: { role: ChromeRole; paid?: boolean }): RoleNavItem[] {
  const paid = Boolean(input.paid);
  const planLabel = upgradeNavLabel(paid);
  if (input.role === "parent") {
    return [
      { id: "home", label: "Home", to: "/parent", icon: "parent" },
      { id: "search", label: "Search", to: "/search", icon: "explore" },
      { id: "saved", label: "Saved", to: "/parent", search: { tab: "saved" }, icon: "saved" },
      { id: "requests", label: "Requests & tours", to: "/parent", search: { tab: "requests" }, icon: "tourChecklist" },
      { id: "messages", label: "Messages", to: "/inbox", search: { view: "family" }, icon: "messages" },
      { id: "upgrade", label: planLabel, to: "/parent", search: { tab: "payments" }, icon: "benefits" },
      { id: "account", label: "Account", to: "/account", search: { tab: "profile" }, icon: "account" },
    ];
  }
  if (input.role === "provider") {
    return [
      { id: "desk", label: "Desk", to: "/provider", icon: "daycare" },
      { id: "listing", label: "My listing", to: "/provider", search: { desk: "listings" }, icon: "claim" },
      { id: "enquiries", label: "Enquiries & tours", to: "/provider", search: { desk: "requests" }, icon: "tourChecklist" },
      { id: "messages", label: "Messages", to: "/inbox", search: { view: "centre" }, icon: "messages" },
      { id: "jobs", label: "Jobs", to: "/jobs/post", icon: "jobs" },
      { id: "upgrade", label: planLabel, to: "/provider/subscription", icon: "benefits" },
      { id: "account", label: "Account", to: "/account", search: { tab: "profile" }, icon: "account" },
    ];
  }
  if (input.role === "admin") {
    return [
      { id: "queue", label: "Approvals", to: "/admin", icon: "verify" },
      { id: "search", label: "Search", to: "/search", icon: "explore" },
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
  return [
    { id: "search", label: "Search", to: "/search", icon: "explore" },
    { id: "map", label: "Map", to: "/search", search: { view: "map" }, icon: "explore" },
    {
      id: "parent-signup",
      label: "I'm a parent",
      to: "/login",
      search: { role: "parent", desk: "parent", intent: "up", next: "/parent" },
      icon: "parent",
    },
    {
      id: "daycare-signup",
      label: "I'm a daycare",
      to: "/login",
      search: { role: "provider", desk: "director", intent: "up", next: "/provider" },
      icon: "daycare",
    },
    { id: "signin", label: "Sign in", to: "/login", icon: "login" },
  ];
}

export type ListingActionMode = "parent" | "edit" | "none" | "all";

/** Guest and parent get parent actions. A daycare does not, except Edit on its own listing. */
export function listingActionMode(input: { role: ChromeRole; ownsListing: boolean }): ListingActionMode {
  if (input.role === "admin") return "all";
  if (input.role === "provider") return input.ownsListing ? "edit" : "none";
  if (input.role === "parent" || input.role === "guest") return "parent";
  return "none";
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
