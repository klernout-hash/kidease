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
}): string | null {
  if (input.intent !== "up") return null;
  if (input.role !== "parent" && input.role !== "provider") return null;
  const params = new URLSearchParams();
  params.set("intent", "up");
  params.set("role", input.role);
  if (input.desk) params.set("desk", String(input.desk));
  if (input.next) params.set("next", String(input.next));
  return `/login?${params.toString()}`;
}
