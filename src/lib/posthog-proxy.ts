/** First-party ingest path on kidease.ca. Avoid /analytics /tracking /posthog. */
export const POSTHOG_PROXY_PATH = "/ingest";
/** Toolbar / links stay on the PostHog US app, not the proxy. */
export const POSTHOG_UI_HOST = "https://us.posthog.com";

export function isPosthogProxyPath(pathname: string): boolean {
  const path = String(pathname ?? "").split("?")[0] || "";
  return path === POSTHOG_PROXY_PATH || path.startsWith(`${POSTHOG_PROXY_PATH}/`);
}

/**
 * Map `/ingest/static|array/…` to US assets and every other `/ingest/…`
 * path to US ingest. Query string is preserved.
 */
export function posthogUpstreamUrl(pathname: string, search = ""): string {
  const path = String(pathname ?? "").split("?")[0] || "/";
  const rest =
    path === POSTHOG_PROXY_PATH || path === `${POSTHOG_PROXY_PATH}/`
      ? "/"
      : path.slice(POSTHOG_PROXY_PATH.length) || "/";
  const normalized = rest.startsWith("/") ? rest : `/${rest}`;
  const asset = normalized.startsWith("/static/") || normalized.startsWith("/array/");
  const host = asset ? "https://us-assets.i.posthog.com" : "https://us.i.posthog.com";
  const raw = String(search ?? "");
  const query = !raw || raw === "?" ? "" : raw.startsWith("?") ? raw : `?${raw}`;
  return `${host}${normalized}${query}`;
}
