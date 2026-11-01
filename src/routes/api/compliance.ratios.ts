import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runRatioJob } from "@/lib/server/compliance-ratios";
async function run(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runRatioJob());
}
export const Route = createFileRoute("/api/compliance/ratios")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
