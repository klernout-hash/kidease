/**
 * Public pages skip the session lookup when the request has no sign-in
 * cookie and no bearer token. Signed-in chrome still loads as before.
 */

export const SESSION_COOKIE_MARKERS = [
  "__Host-grok-auth.session_token=",
  "__Secure-kidease.session_token=",
  "kidease.e2e_session=",
] as const;

export function requestHasSessionMaterial(
  cookie?: string | null,
  authorization?: string | null,
): boolean {
  if (String(authorization || "").trim()) return true;
  const raw = String(cookie || "");
  return SESSION_COOKIE_MARKERS.some((marker) => raw.includes(marker));
}
