import { createFileRoute } from "@tanstack/react-router";
import { runSearchAlertJob } from "@/lib/server/search-alerts";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

function authorized(request: Request) {
  const secret = (process.env.CRON_SECRET || process.env.DIGEST_SECRET || "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function run(request: Request) {
  const ip = requestIp(request);
  if (!authorized(request)) {
    await logSecurityEvent({ kind: "search_alerts_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const result = await runSearchAlertJob({ dryRun });
  await logSecurityEvent({ kind: "search_alerts_run", ip, detail: dryRun ? "dry-run" : "ok" });
  return Response.json(result);
}

export const Route = createFileRoute("/api/search-alerts")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
