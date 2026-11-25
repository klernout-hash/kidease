import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { pingCronHeartbeat } from "@/lib/server/cron-heartbeat";
import { runGhlLeadReconcile } from "@/lib/server/ghl-lead-push";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "ghl_lead_reconcile_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runGhlLeadReconcile({ retry: true });
  await logSecurityEvent({ kind: "ghl_lead_reconcile_run", ip, detail: result.skipped ? "flag-off" : "ok" });
  await pingCronHeartbeat("ghl-lead-reconcile");
  return Response.json(result);
}

export const Route = createFileRoute("/api/ghl-lead-reconcile")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
