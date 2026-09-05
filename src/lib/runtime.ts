import { isNative, nativePlatform, type NativePlatform } from "@/lib/native";

/** One codebase, two looks. Same listings and accounts. */
export type Runtime = NativePlatform; // "web" | "ios" | "android"
export type Channel = "website" | "app";

/**
 * Storefront (laptop www.kidease.ca) at Tailwind `lg` and up, and only in the
 * browser — never inside the Capacitor native shell.
 *
 * App chrome: phone-width web (below 1024px) OR Capacitor iOS/Android OR ?app=1.
 */
export const STOREFRONT_MIN_PX = 1024;

function forceAppFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("app") === "1" || q.get("channel") === "app") return true;
    if (q.get("app") === "0" || q.get("channel") === "website") return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function resolveChannel(input: { native: boolean; widthPx: number; forceApp?: boolean }): Channel {
  if (input.forceApp || input.native) return "app";
  return input.widthPx >= STOREFRONT_MIN_PX ? "website" : "app";
}

export function runtime(): Runtime {
  return nativePlatform();
}

export function readWidth(): number {
  if (typeof window === "undefined") return STOREFRONT_MIN_PX;
  return window.innerWidth;
}

export function channel(): Channel {
  return resolveChannel({ native: isNative(), widthPx: readWidth(), forceApp: forceAppFromUrl() });
}

export function isApp() {
  return channel() === "app";
}

export function isWebsite() {
  return channel() === "website";
}

/**
 * First-party channel boot lives at `/channel-boot.js` (CSP `'self'`).
 * Keep STOREFRONT_MIN_PX in sync with that file (1024). Do not put the boot
 * IIFE back inline — adding a CSP hash while `'unsafe-inline'` remains would
 * disable `'unsafe-inline'` for every other script (TanStack `<Scripts />`).
 */

export function paintRuntime() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.runtime = runtime();
  root.dataset.channel = channel();
}

export function startChannelListener(): () => void {
  if (typeof window === "undefined") return () => {};
  const sync = () => paintRuntime();
  sync();
  const mq = window.matchMedia(`(min-width: ${STOREFRONT_MIN_PX}px)`);
  mq.addEventListener("change", sync);
  return () => mq.removeEventListener("change", sync);
}
