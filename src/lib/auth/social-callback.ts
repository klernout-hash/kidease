/**
 * Google and Apple return to a URL we choose. A daycare or parent sign-up
 * must land on /login?intent=up first so setRole runs before /provider
 * (or /parent) beforeLoad. A plain sign-in keeps the original destination.
 */
export function socialSignupCallbackPath(input: {
  intent?: string | null;
  role?: string | null;
  desk?: string | null;
  next?: string | null;
  loginPath?: "/login" | "/fr/login";
}): string | null {
  if (input.intent !== "up") return null;
  if (input.role !== "parent" && input.role !== "provider") return null;
  const params = new URLSearchParams();
  params.set("intent", "up");
  params.set("role", input.role);
  if (input.desk) params.set("desk", String(input.desk));
  if (input.next) params.set("next", String(input.next));
  const base = input.loginPath === "/fr/login" ? "/fr/login" : "/login";
  return `${base}?${params.toString()}`;
}

export const FACEBOOK_ROLE_PENDING_KEY = "ke-facebook-need-role";

/** Parent or centre staff only. Never a child account. */
export function facebookSignupRole(role: string | null | undefined): "parent" | "provider" | null {
  if (role === "parent" || role === "provider") return role;
  return null;
}

/**
 * New Facebook accounts land here. A chosen role is saved on return.
 * Without one, the login page asks parent or centre staff before the desk opens.
 */
export function facebookNewUserCallbackPath(input: {
  role?: string | null;
  desk?: string | null;
  next?: string | null;
  locale?: string | null;
}): string {
  const base = input.locale === "fr" ? "/fr/login" : "/login";
  const params = new URLSearchParams();
  params.set("intent", "up");
  const role = facebookSignupRole(input.role);
  if (role) params.set("role", role);
  else params.set("step", "role");
  if (input.desk) params.set("desk", String(input.desk));
  if (input.next) params.set("next", String(input.next));
  return `${base}?${params.toString()}`;
}
