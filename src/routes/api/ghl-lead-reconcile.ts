import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { pingCronHeartbeat } from "@/lib/server/cron-heartbeat";
import { runGhlLeadReconcile } from "@/lib/server/ghl-lead-push";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

/**
 * Vercel Cron (vercel.json, 12:10 UTC daily) sends GET with
 * `Authorization: Bearer $CRON_SECRET`. A 401 here is logged as
 * ghl_lead_reconcile_denied in security_events. Every authorized run writes
 * one ghl_lead_reconcile row, including flag-off and failed runs.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "ghl_lead_reconcile_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runGhlLeadReconcile({ retry: true });
    const detail = result.skipped ? "flag-off" : result.ok ? "ok" : "failed";
    await logSecurityEvent({ kind: "ghl_lead_reconcile_run", ip, detail });
    if (result.ok) await pingCronHeartbeat("ghl-lead-reconcile");
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "failed";
    console.error("[kidease-ghl] reconcile route failed", message);
    await logSecurityEvent({ kind: "ghl_lead_reconcile_run", ip, detail: `error: ${message}` });
    return Response.json({ ok: false, error: "reconcile-failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export const Route = createFileRoute("/api/ghl-lead-reconcile")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
