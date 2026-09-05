/**
 * Nitro request middleware: hide admin desks on `*.vercel.app` (Cloudflare
 * Access only sits on www.kidease.ca) and serve `/.well-known/change-password`.
 *
 * Uses the `Host` header, not `X-Forwarded-Host`, so a spoofed forwarded host
 * cannot un-gate a vercel.app request. `www.kidease.ca` keeps serving /admin
 * after Access. `/` on kidease-git.vercel.app is left alone for the
 * Cloudflare Health Check.
 */
import { decideRequest } from "../../scripts/request-guard.mjs";

interface RequestGuardEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function requestGuardMiddleware(
  event: RequestGuardEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const decision = decideRequest({
    host: event.req.headers.get("host") ?? event.url.host,
    pathname: event.url.pathname,
    search: event.url.search,
  });

  if (decision.action === "redirect") {
    return new Response(null, {
      status: decision.status,
      headers: { location: decision.location },
    });
  }

  return next();
}
