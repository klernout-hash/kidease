import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runAuditJob } from "@/lib/server/compliance-audit";
async function run(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runAuditJob());
}
export const Route = createFileRoute("/api/compliance/audit")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
