import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { pingCronHeartbeat } from "@/lib/server/cron-heartbeat";
import { shouldDeferTourHoldsToInngest } from "@/lib/inngest";
import { runExpireTourHoldsJob, TourHoldExpiryError } from "@/lib/server/tour-holds";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({
      kind: "tour_holds_denied",
      ip,
      detail: "missing or invalid cron secret",
    });
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  if (shouldDeferTourHoldsToInngest(request)) {
    await logSecurityEvent({ kind: "tour_holds_run", ip, detail: "deferred-inngest" });
    return Response.json({
      ok: true,
      skipped: true,
      via: "inngest",
      reason: "inngest-configured-registration-unverified",
    });
  }
  try {
    const result = await runExpireTourHoldsJob({ dryRun });
    await logSecurityEvent({
      kind: "tour_holds_run",
      ip,
      detail: !result.ok ? "failed" : dryRun ? "dry-run" : "ok",
    });
    if (result.ok && !dryRun) await pingCronHeartbeat("tour-holds");
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    await logSecurityEvent({ kind: "tour_holds_run", ip, detail: "failed" });
    // Driver errors may include connection details. Return only our fixed phase result.
    const result =
      error instanceof TourHoldExpiryError
        ? error.result
        : { ok: false, error: "tour-holds-failed", dryRun };
    return Response.json(result, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export const Route = createFileRoute("/api/tour-holds")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
