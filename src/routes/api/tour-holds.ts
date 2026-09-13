import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { shouldDeferTourHoldsToInngest } from "@/lib/inngest";
import { runExpireTourHoldsJob } from "@/lib/server/tour-holds";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "tour_holds_denied", ip, detail: "missing or invalid cron secret" });
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
      reason: "inngest-owns-schedule",
    });
  }
  const result = await runExpireTourHoldsJob({ dryRun });
  await logSecurityEvent({ kind: "tour_holds_run", ip, detail: dryRun ? "dry-run" : "ok" });
  return Response.json(result);
}

export const Route = createFileRoute("/api/tour-holds")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
