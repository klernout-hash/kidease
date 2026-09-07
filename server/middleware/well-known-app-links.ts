/**
 * Serve Apple AASA + Android Digital Asset Links as application/json,
 * and the Apple Pay domain-association file when the env body is set.
 *
 * Must short-circuit before TanStack Start's document handler so these
 * paths are not the SPA HTML shell (live probes were 404 / catch-all).
 * Auto-registered because vite.config.ts sets `serverDir: "./server"`.
 */
import {
  wellKnownAppLinksHeaders,
  wellKnownStaticPayload,
} from "../../scripts/well-known-app-links.mjs";

interface WellKnownEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function wellKnownAppLinksMiddleware(
  event: WellKnownEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();

  const payload = wellKnownStaticPayload(event.url.pathname);
  if (!payload) return next();

  return new Response(method === "HEAD" ? null : payload.body, {
    status: 200,
    headers: wellKnownAppLinksHeaders(payload.contentType),
  });
}
