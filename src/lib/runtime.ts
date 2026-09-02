import { isNative, nativePlatform, type NativePlatform } from "@/lib/native";

/** One codebase, three runtimes. */
export type Runtime = NativePlatform; // "web" | "ios" | "android"
export type Channel = "website" | "app";

export function runtime(): Runtime {
  return nativePlatform();
}

export function channel(): Channel {
  return isNative() ? "app" : "website";
}

export function isApp() {
  return channel() === "app";
}

export function isWebsite() {
  return channel() === "website";
}

export function paintRuntime() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.runtime = runtime();
  root.dataset.channel = channel();
}
