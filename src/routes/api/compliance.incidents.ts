import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runIncidentJob } from "@/lib/server/compliance-incidents";

async function run(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await runIncidentJob();
  return Response.json(result);
}

export const Route = createFileRoute("/api/compliance/incidents")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
