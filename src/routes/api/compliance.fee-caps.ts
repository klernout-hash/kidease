import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runFeeJob } from "@/lib/server/compliance-fees";
async function run(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runFeeJob());
}
export const Route = createFileRoute("/api/compliance/fee-caps")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
