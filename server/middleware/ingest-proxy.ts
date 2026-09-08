/**
 * First-party PostHog reverse proxy for Vite preview / Nitro when the
 * Vercel `/ingest` rewrite is not in front of the request.
 */
import { isPosthogProxyPath } from "../../src/lib/posthog-proxy";
import { proxyPosthogRequest } from "../../src/lib/server/posthog-proxy";

interface IngestEvent {
  url: URL;
  req: { method?: string; headers: Headers; body?: BodyInit | null };
  request?: Request;
}

export default async function ingestProxyMiddleware(
  event: IngestEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if (!isPosthogProxyPath(event.url.pathname)) return next();
  const request =
    event.request ??
    new Request(event.url, {
      method: event.req.method ?? "GET",
      headers: event.req.headers,
      body: event.req.body ?? undefined,
      duplex: "half",
    } as RequestInit);
  return proxyPosthogRequest(request);
}
