import { isGovPortalPath } from "./gov/access.ts";
import { stripLocalePrefix } from "./locale-path.ts";

export type HelpLauncherRole = "guest" | "parent" | "provider" | "admin";
export type HelpLauncherChannel = "web" | "native";

/**
 * One floating KidEase Help launcher for every role, on the website and in
 * the native shell. Live video and phone screens are the exception: the
 * button would sit on hang-up and mute.
 */
export function helpLauncherVisible(pathname: string | null | undefined): boolean {
  const bare = stripLocalePrefix(pathname);
  if (bare === "/video" || bare.startsWith("/video/")) return false;
  if (bare === "/call" || bare.startsWith("/call/")) return false;
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
