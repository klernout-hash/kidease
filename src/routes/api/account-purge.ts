import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runAccountPurgeJob } from "@/lib/server/account-purge-job";

async function run(request: Request) {
  if (!cronAuthorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await runAccountPurgeJob();
  console.info(result.log);
  return Response.json({ ok: true, purged: result.purged });
}

export const Route = createFileRoute("/api/account-purge")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
