import { isNative, nativePlatform, type NativePlatform } from "@/lib/native";

/** One codebase, two looks. Same listings and accounts. */
export type Runtime = NativePlatform; // "web" | "ios" | "android"
export type Channel = "website" | "app";

/**
 * Storefront (laptop www.kidease.ca) at Tailwind `lg` and up, and only in the
 * browser — never inside the Capacitor native shell.
 *
 * App chrome: phone-width web (below 1024px) OR Capacitor iOS/Android.
 */
export const STOREFRONT_MIN_PX = 1024;

export function resolveChannel(input: { native: boolean; widthPx: number }): Channel {
  if (input.native) return "app";
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
  return resolveChannel({ native: isNative(), widthPx: readWidth() });
}

export function isApp() {
  return channel() === "app";
}

export function isWebsite() {
  return channel() === "website";
}

/** Runs in the document head before paint so phone-width does not flash the storefront. */
export const CHANNEL_BOOT_SCRIPT = `(function(){try{var c=window.Capacitor;var n=!!(c&&c.isNativePlatform&&c.isNativePlatform());var w=window.innerWidth||0;var r=document.documentElement;r.dataset.channel=(n||w<${STOREFRONT_MIN_PX})?"app":"website";r.dataset.runtime=n&&c.getPlatform?c.getPlatform():"web";}catch(e){document.documentElement.dataset.channel="website";}})();`;

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
