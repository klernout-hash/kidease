import { privateArea } from "../role-access.ts";

/**
 * Back from sign-in / sign-up must never return to the protected `next`
 * (it would just redirect to /login again — the guest Back loop, KE-04).
 * `next` is only used for the redirect after a successful sign-in.
 */
const AUTH_PAGE_PATHS = new Set([
  "/login",
  "/fr/login",
  "/signup",
  "/fr/signup",
  "/parent/signup",
  "/fr/parent/signup",
  "/verify-2fa",
  "/forgot-password",
  "/reset-password",
]);

/** Client-gated screens that bounce a guest to /login (not covered by privateArea). */
const GUEST_GATED_PREFIXES = ["/pay", "/dashboard", "/saved", "/children", "/notifications", "/inbox", "/account"];

function barePathOf(raw: string): string {
  const path = (raw.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  return path;
}

export function isAuthPagePath(raw: string): boolean {
  return AUTH_PAGE_PATHS.has(barePathOf(raw));
}

/** A same-site path a signed-out guest can land on without bouncing to sign-in. */
export function isPublicBackTarget(raw: string | null | undefined): boolean {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return false;
  const path = barePathOf(raw);
  if (isAuthPagePath(path)) return false;
  const unprefixed = path === "/fr" ? "/" : path.startsWith("/fr/") ? path.slice(3) : path;
  if (GUEST_GATED_PREFIXES.some((p) => unprefixed === p || unprefixed.startsWith(`${p}/`))) return false;
  return privateArea(unprefixed) === "public";
}

/**
 * Where Back goes when there is no in-app history entry to pop:
 * the public page the guest came from (same-origin referrer), then a public
 * `next` (e.g. a daycare page), else home.
 */
export function authBackFallback(input: {
  next?: string | null;
  referrer?: string | null;
  origin?: string | null;
  locale?: "en" | "fr";
}): string {
  const home = input.locale === "fr" ? "/fr" : "/";
  if (input.referrer && input.origin) {
    try {
      const ref = new URL(input.referrer);
      if (ref.origin === input.origin) {
        const p = `${ref.pathname}${ref.search}`;
        if (isPublicBackTarget(p)) return p;
      }
    } catch {
      /* ignore malformed referrer */
    }
  }
  if (isPublicBackTarget(input.next)) return input.next as string;
  return home;
}

/** Browser-side fallback using the live document. */
export function currentAuthBackFallback(next?: string | null, locale?: "en" | "fr"): string {
  if (typeof window === "undefined") return authBackFallback({ next, locale });
  return authBackFallback({
    next,
    locale,
    referrer: document.referrer,
    origin: window.location.origin,
  });
}
