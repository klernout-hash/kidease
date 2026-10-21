/**
 * Apple auth failures. Status and Apple's error code only.
 * Never include an authorization code, access token, refresh token, or client secret.
 */

export function logAppleAuthFailure(
  stage: "exchange" | "revoke",
  detail: { status: number; error?: string | null; clientId?: string | null },
): void {
  const error = String(detail.error || "unknown")
    .replace(/[^\w.-]/g, "")
    .slice(0, 64);
  const clientId = String(detail.clientId || "unset")
    .replace(/[^\w.-]/g, "")
    .slice(0, 80);
  console.error(`[apple-auth] ${stage} failed status=${detail.status} error=${error || "unknown"} client=${clientId || "unset"}`);
}
