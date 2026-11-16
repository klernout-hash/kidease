import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { centreLeadTrackerEnabled } from "@/lib/features";
import { runCentreLeadJobs } from "@/lib/server/centre-leads";

async function run(request: Request) {
  if (!centreLeadTrackerEnabled()) return Response.json({ ok: true, skipped: true, reason: "flag" });
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await runCentreLeadJobs();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}

export const Route = createFileRoute("/api/centre-lead-alerts")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
