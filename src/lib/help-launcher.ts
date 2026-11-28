import { isGovPortalPath } from "./gov/access.ts";
import { stripLocalePrefix } from "./locale-path.ts";

export type HelpLauncherRole = "guest" | "parent" | "provider" | "admin";
export type HelpLauncherChannel = "web" | "native";

/**
 * One floating KidEase Help launcher for every role, on the website and in
 * the native shell. Live video and phone screens are the exception: the
 * button would sit on hang-up and mute. The check-in kiosk has its own Help
 * button, and a floating bubble there covers the roster (P3-1, P3-6).
 */
export function helpLauncherVisible(pathname: string | null | undefined): boolean {
  const bare = stripLocalePrefix(pathname);
  if (bare === "/video" || bare.startsWith("/video/")) return false;
  if (bare === "/call" || bare.startsWith("/call/")) return false;
  if (bare === "/kiosk" || bare.startsWith("/kiosk/")) return false;
  if (isGovPortalPath(bare)) return false;
  return true;
}

/** Role and channel do not hide the launcher. Routes above are the only exception. */
export function helpLauncherFor(input: {
  pathname: string;
  role: HelpLauncherRole;
  channel: HelpLauncherChannel;
}): boolean {
  return helpLauncherVisible(input.pathname);
}
