/**
 * Google and Facebook OAuth must not load inside the Capacitor webview.
 * Google rejects that user agent. The system sheet (ASWebAuthenticationSession
 * or Chrome Custom Tabs) finishes on ca.kidease.app://auth/finish, and the
 * webview then calls /auth/native-handoff so the session cookie is set here.
 */

export const NATIVE_AUTH_SCHEME = "ca.kidease.app";
export const NATIVE_AUTH_RETURN_PATH = "/auth/app-return";
export const NATIVE_AUTH_HANDOFF_PATH = "/auth/native-handoff";
/** Starts OAuth inside the system auth sheet so the state cookie is set there. */
export const NATIVE_AUTH_START_PATH = "/auth/native-start";

const FINISH_HOSTS = new Set(["auth"]);

export function safeInAppPath(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/login";
  if (value.includes("://") || value.includes("\\")) return "/login";
  if (value.length > 512) return "/login";
  return value;
}

/** callbackURL Better Auth should use so the system browser can hand the app back. */
export function nativeOAuthReturnPath(next: string | null | undefined): string {
  return `${NATIVE_AUTH_RETURN_PATH}?next=${encodeURIComponent(safeInAppPath(next))}`;
}

export function nativeOAuthProvider(
  raw: string | null | undefined,
): "google" | "facebook" | "apple" | "huawei" | "amazon" | null {
  const provider = String(raw || "").trim().toLowerCase();
  if (
    provider === "google" ||
    provider === "facebook" ||
    provider === "apple" ||
    provider === "huawei" ||
    provider === "amazon"
  ) {
    return provider;
  }
  return null;
}

/**
 * Page the system auth sheet should open. The WebView must not call
 * sign-in/social itself: that stores the OAuth state cookie in the WebView,
 * and the callback lands in the sheet.
 */
export function nativeOAuthStartPath(input: {
  provider: string;
  next?: string | null;
  errorNext?: string | null;
  newUserNext?: string | null;
}): string {
  const provider = nativeOAuthProvider(input.provider) ?? "google";
  const params = new URLSearchParams();
  params.set("provider", provider);
  params.set("next", safeInAppPath(input.next));
  params.set("errorNext", safeInAppPath(input.errorNext || input.next));
  if (input.newUserNext) params.set("newUser", safeInAppPath(input.newUserNext));
  return `${NATIVE_AUTH_START_PATH}?${params.toString()}`;
}

/** OAuth `error` codes only. Drops sentences, markup, and unexpected characters. */
export function sanitizeNativeOAuthError(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(value)) return null;
  return value;
}

export function nativeAuthErrorPath(next: string | null | undefined, error: string): string {
  const path = safeInAppPath(next);
  const split = path.indexOf("?");
  const pathname = split === -1 ? path : path.slice(0, split);
  const params = new URLSearchParams(split === -1 ? "" : path.slice(split + 1));
  params.set("error", error);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function nativeAuthFinishUrl(input: {
  code?: string | null;
  next?: string | null;
  error?: string | null;
}): string {
  const params = new URLSearchParams();
  const code = String(input.code || "").trim();
  if (code) params.set("code", code);
  const error = sanitizeNativeOAuthError(input.error);
  if (error) params.set("error", error);
  params.set("next", safeInAppPath(input.next));
  return `${NATIVE_AUTH_SCHEME}://auth/finish?${params.toString()}`;
}

export type NativeAuthFinish = { code: string | null; next: string; error: string | null };

/** ca.kidease.app://auth/finish and KidEase://auth/finish. */
export function parseNativeAuthFinish(raw: string | null | undefined): NativeAuthFinish | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== "ca.kidease.app" && protocol !== "kidease") return null;
  const host = (url.hostname || "").toLowerCase();
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const finish = (host === "auth" && path === "/finish") || path === "/auth/finish";
  if (!finish && !FINISH_HOSTS.has(host)) return null;
  if (host === "auth" && path !== "/finish" && path !== "/") return null;
  if (host !== "auth" && path !== "/auth/finish") return null;
  const code = url.searchParams.get("code")?.trim() || null;
  return {
    code,
    next: safeInAppPath(url.searchParams.get("next")),
    error: sanitizeNativeOAuthError(url.searchParams.get("error")),
  };
}

export function nativeHandoffPath(input: NativeAuthFinish): string {
  if (input.error) return nativeAuthErrorPath(input.next, input.error);
  if (!input.code) return input.next;
  const params = new URLSearchParams();
  params.set("code", input.code);
  params.set("next", input.next);
  return `${NATIVE_AUTH_HANDOFF_PATH}?${params.toString()}`;
}

import { orderSocialSignIn, providersForStore } from "./providers.ts";

export type NativeSocialPlatform = "ios" | "android" | "web";

/**
 * App Store guideline 4.8: a third-party login on iOS needs Sign in with Apple
 * beside it. Until Apple is configured, the iOS app keeps email only.
 * Android and the website are unchanged.
 */
export function providersForNativeShell<T extends { idp: string }>(
  providers: readonly T[],
  input: { native: boolean; platform: NativeSocialPlatform },
): T[] {
  if (!input.native || input.platform !== "ios") return orderSocialSignIn(providers);
  if (providers.some((provider) => provider.idp === "apple")) return orderSocialSignIn(providers);
  return orderSocialSignIn(providers.filter((provider) => provider.idp !== "google" && provider.idp !== "facebook"));
}

/** Store matrix, then the iOS rule that keeps email only until Apple is configured. */
export function signInProvidersForDevice<T extends { idp: string }>(
  providers: readonly T[],
  input: {
    channel: string;
    playServices?: boolean;
    native: boolean;
    platform: NativeSocialPlatform;
  },
): T[] {
  return providersForNativeShell(providersForStore(providers, input.channel, { playServices: input.playServices }), {
    native: input.native,
    platform: input.platform,
  });
}

export function nativeSocialPlatform(input: {
  native: boolean;
  channel?: string | null;
  userAgent?: string | null;
}): NativeSocialPlatform {
  if (!input.native) return "web";
  const channel = String(input.channel || "");
  if (channel === "apple") return "ios";
  if (channel === "google" || channel === "samsung" || channel === "huawei" || channel === "amazon") return "android";
  const ua = String(input.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

export function isNativeOAuthCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  return /cancel/i.test(message);
}
