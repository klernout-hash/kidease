/**
 * Better Auth 1.7 handles generic OAuth at `/api/auth/callback/:id`.
 * Grok broker clients are still registered for `/api/auth/oauth2/callback/*`.
 * Rewrite the inbound path so the core callback handler can finish the login.
 */
export function requestWithLegacyOAuthCallback(request: Request): Request {
  const url = new URL(request.url);
  const rewritten = url.pathname.replace(
    /\/oauth2\/callback\/([^/]+)\/?$/,
    "/callback/$1",
  );
  if (rewritten === url.pathname) return request;
  url.pathname = rewritten;
  return new Request(url, request);
}
