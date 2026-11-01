import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runComplaintJob } from "@/lib/server/compliance-complaints";
async function run(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runComplaintJob());
}
export const Route = createFileRoute("/api/compliance/complaints")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
