import { createFileRoute } from "@tanstack/react-router";
import { applyUnsubscribeToken } from "@/lib/server/casl-consent";
import { requestIp } from "@/lib/server/security-events";

/**
 * One-click List-Unsubscribe (RFC 8058). GET or POST with ?token=.
 * Always 204 when the token is valid so mail clients treat it as success.
 */
async function run(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  if (!token && request.method === "POST") {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    token = params.get("token") || url.searchParams.get("token") || "";
  }
  const ip = requestIp(request);
  if (!token.trim()) {
    return new Response("Missing token", { status: 400 });
  }
  const result = await applyUnsubscribeToken(token, {
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  if (!result.ok) {
    return new Response("Invalid token", { status: 400 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute("/api/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
