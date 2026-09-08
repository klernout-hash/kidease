import { createFileRoute } from "@tanstack/react-router";
import { healthHeaders, healthHttpStatus } from "@/lib/uptime";

/**
 * Public liveness/readiness for Better Stack (and Cloudflare). No auth.
 * Boots without BETTERSTACK_* keys. Does not leak DB host or secrets.
 */
async function run() {
  const { collectHealth } = await import("@/lib/server/uptime");
  const payload = await collectHealth();
  return Response.json(payload, {
    status: healthHttpStatus(payload.checks),
    headers: healthHeaders(),
  });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => run(),
      HEAD: async () => {
        const res = await run();
        return new Response(null, { status: res.status, headers: res.headers });
      },
    },
  },
});
