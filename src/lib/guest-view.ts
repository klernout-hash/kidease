import { canUseOperatorTools } from "./operator-tools.ts";

/** Short-lived cookie. Only kyle@kidease.ca is rendered as a signed-out visitor. */
export const GUEST_VIEW_COOKIE = "ke_guest_view";

export function guestViewCookieOn(cookieHeader: string | null | undefined): boolean {
  return String(cookieHeader || "")
    .split(";")
    .some((part) => part.trim() === `${GUEST_VIEW_COOKIE}=1`);
}

export function requestPathname(url: string | null | undefined): string {
  if (!url) return "/";
  try {
    return new URL(url).pathname || "/";
  } catch {
    const path = url.split("?")[0] || "/";
    return path.startsWith("/") ? path : "/";
  }
}

function barePath(pathname: string): string {
  const path = pathname || "/";
  if (path === "/fr") return "/";
  if (path.startsWith("/fr/")) return path.slice(3) || "/";
  return path;
}

/**
 * Public pages only. Private desks and login stay on the real session so a
 * signed-out paint cannot bounce /parent → /login → /admin in a loop.
 * Admin still opens while the cookie is set.
 */
export function guestViewApplies(input: {
  cookie: string | null | undefined;
  email: string | null | undefined;
  pathname: string;
}): boolean {
  if (!guestViewCookieOn(input.cookie)) return false;
  if (!canUseOperatorTools(input.email)) return false;
  const path = barePath(input.pathname);
  if (path.startsWith("/api/")) return false;
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-")) return false;
  if (path === "/support" || path.startsWith("/support/")) return false;
  if (path === "/login" || path.startsWith("/login/")) return false;
  if (path === "/parent" || path.startsWith("/parent/")) return false;
  if (path === "/provider" || path.startsWith("/provider/")) return false;
  if (path === "/account" || path.startsWith("/account/")) return false;
  if (path === "/inbox" || path.startsWith("/inbox/")) return false;
  if (path === "/notifications" || path.startsWith("/notifications/")) return false;
  if (path === "/menu" || path.startsWith("/menu/")) return false;
  if (path === "/verify-2fa" || path.startsWith("/verify-2fa")) return false;
  return true;
}

export function startGuestViewCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${GUEST_VIEW_COOKIE}=1; Path=/; Max-Age=3600; SameSite=Lax`;
}

export function clearGuestViewCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${GUEST_VIEW_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
