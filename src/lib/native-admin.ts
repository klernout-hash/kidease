/**
 * Admin stays on the website. The iOS and Android shells load
 * https://www.kidease.ca inside a WebView. A document GET to /admin* is
 * behind Cloudflare Access, which sends the shell out to Safari.
 *
 * Detection matches the shell the binary already sends:
 * - Capacitor.isNativePlatform()
 * - the KidEaseNative user-agent token (capacitor.config.ts appendUserAgent,
 *   Android MainActivity, and the iOS bridge)
 * - the ke_shell=native cookie channel-boot sets once that signal is seen,
 *   so the next server render omits Admin links before paint
 *
 * A phone browser, a home-screen install, and the Microsoft Store package
 * are not this shell. /support is not on the Access path list yet
 * (docs/cloudflare.md), so it stays available.
 */

import { isNativeUserAgent } from "./native-entitlements.ts";

export const NATIVE_SHELL_COOKIE = "ke_shell";
export const NATIVE_SHELL_COOKIE_VALUE = "native";
/** Outside /admin so Cloudflare Access cannot intercept it. */
export const NATIVE_ADMIN_NOTE_PATH = "/app-admin-unavailable";
/** Older iOS/Android binaries still open this path. Keep it. */
export const NATIVE_ADMIN_NOTE_LEGACY_PATH = "/use-the-website";

const NOTE_COPY = {
  en: {
    title: "Admin is on the website",
    lead: "Admin is available on kidease.ca in a browser",
    body: "This app is for finding daycare and for daycare owners. The admin desk stays on the website, so the app does not open a second login.",
    home: "Go home",
  },
  fr: {
    title: "L’admin est sur le site web",
    lead: "L’admin est offert sur kidease.ca dans un navigateur.",
    body: "Cette appli sert à trouver une garderie et aux propriétaires de garderie. Le bureau admin reste sur le site web, pour que l’appli n’ouvre pas une deuxième connexion.",
    home: "Aller à l’accueil",
  },
} as const;

export function nativeAdminNoteCopy(locale: string | null | undefined) {
  return locale === "fr" ? NOTE_COPY.fr : NOTE_COPY.en;
}

export function cookieMarksNativeShell(cookie: string | null | undefined): boolean {
  return new RegExp(`(?:^|;\\s*)${NATIVE_SHELL_COOKIE}=${NATIVE_SHELL_COOKIE_VALUE}(?:;|$)`).test(
    String(cookie || ""),
  );
}

type CapWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

export function capacitorIsNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as CapWindow).Capacitor?.isNativePlatform?.());
}

/**
 * True only inside the Capacitor iOS / Android shells.
 * Website, mobile Safari, and the Microsoft Store package stay false.
 */
export function nativeShellHidesAdmin(input: {
  userAgent?: string | null;
  cookie?: string | null;
  nativePlatform?: boolean;
}): boolean {
  if (input.nativePlatform) return true;
  if (isNativeUserAgent(input.userAgent)) return true;
  if (cookieMarksNativeShell(input.cookie)) return true;
  return false;
}

export function nativeShellHidesAdminNow(): boolean {
  if (typeof window === "undefined") return false;
  return nativeShellHidesAdmin({
    userAgent: window.navigator.userAgent,
    cookie: document.cookie,
    nativePlatform: capacitorIsNativePlatform(),
  });
}

/** Path only, French prefix removed, no query. */
export function accessPathname(raw: string | null | undefined): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  let path = trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      path = new URL(trimmed).pathname || "/";
    } catch {
      return "";
    }
  }
  path = path.split("#")[0]?.split("?")[0] || "";
  if (!path.startsWith("/")) return "";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/fr") return "/";
  if (path.startsWith("/fr/")) path = path.slice(3) || "/";
  return path || "/";
}

/**
 * Paths the Cloudflare Access app guards (docs/cloudflare.md).
 * /admin* and /api/admin/*. Not /support, /help, /parent, /provider, or /login.
 */
export function isAccessProtectedPath(raw: string | null | undefined): boolean {
  const path = accessPathname(raw);
  if (!path || path === "/") return false;
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-")) return true;
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return true;
  return false;
}

export function isCloudflareAccessHost(host: string | null | undefined): boolean {
  const value = String(host || "").trim().toLowerCase();
  if (!value) return false;
  return value === "cloudflareaccess.com" || value.endsWith(".cloudflareaccess.com");
}

/** Where an explicit Admin tap goes inside the shell. Same host, not Safari. */
export function nativeAdminNoteHref(): string {
  return NATIVE_ADMIN_NOTE_PATH;
}

/** True for the current note page and the path older app binaries still open. */
export function isNativeAdminNotePath(raw: string | null | undefined): boolean {
  const path = accessPathname(raw);
  return path === NATIVE_ADMIN_NOTE_PATH || path === NATIVE_ADMIN_NOTE_LEGACY_PATH;
}

/**
 * Where a native document request for an Access path should go.
 * Null on the website, and null when the path is already the note page.
 * Middleware and Vercel can only do this when the request reaches the app.
 * If Cloudflare Access sits on the DNS edge, it answers first.
 */
export function nativeAdminRedirectTarget(input: {
  pathname?: string | null;
  userAgent?: string | null;
  cookie?: string | null;
  nativePlatform?: boolean;
}): string | null {
  if (!isAccessProtectedPath(input.pathname)) return null;
  if (isNativeAdminNotePath(input.pathname)) return null;
  if (!nativeShellHidesAdmin(input)) return null;
  return NATIVE_ADMIN_NOTE_PATH;
}

/**
 * After sign-in, an admin account in the app opens a normal desk.
 * The note page is only for an explicit Admin tap.
 */
export function nativeAccountDest(input: {
  hideAdmin: boolean;
  dest: string;
  role?: string | null;
  desk?: string | null;
  remembered?: "parent" | "provider" | null;
}): string {
  if (!input.hideAdmin || !isAccessProtectedPath(input.dest)) return input.dest;
  const role = String(input.role || "").trim().toLowerCase();
  const desk = String(input.desk || "").trim().toLowerCase();
  if (role === "provider" || desk === "provider" || desk === "director" || input.remembered === "provider") {
    return "/provider";
  }
  return "/parent";
}

export function notificationHrefForShell(href: string, hideAdmin: boolean): string {
  if (hideAdmin && isAccessProtectedPath(href)) return NATIVE_ADMIN_NOTE_PATH;
  return href;
}

export function chromeRoleInNativeShell<T extends string>(role: T, hideAdmin: boolean): T | "parent" {
  if (hideAdmin && role === "admin") return "parent";
  return role;
}

export function bottomBarKindInShell<T extends string>(kind: T, hideAdmin: boolean): T | "parent" {
  if (hideAdmin && kind === "admin") return "parent";
  return kind;
}

export function desksVisibleInShell<T extends string>(desks: readonly T[], hideAdmin: boolean): T[] {
  if (!hideAdmin) return [...desks];
  return desks.filter((desk) => desk !== "admin");
}
