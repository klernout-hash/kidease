import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { shouldDeferOpenSpotsCheckinToInngest } from "@/lib/inngest";
import { runOpenSpotsCheckinJob } from "@/lib/server/open-spots-checkin";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "open_spots_checkin_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  if (shouldDeferOpenSpotsCheckinToInngest(request)) {
    await logSecurityEvent({ kind: "open_spots_checkin_run", ip, detail: "deferred-inngest" });
    return Response.json({ ok: true, skipped: true, via: "inngest", reason: "inngest-owns-schedule" });
  }
  const result = await runOpenSpotsCheckinJob({ dryRun });
  await logSecurityEvent({
    kind: "open_spots_checkin_run",
    ip,
    detail: result.skipped ? String(result.reason || "skipped") : dryRun ? "dry-run" : "ok",
  });
  return Response.json(result);
}

export const Route = createFileRoute("/api/open-spots-checkin")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
