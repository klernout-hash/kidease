import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { shouldDeferSpotOffersToInngest } from "@/lib/inngest";
import { runSpotOfferExpiryJob } from "@/lib/server/spot-offers";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "spot_offer_expiry_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  if (shouldDeferSpotOffersToInngest(request)) {
    await logSecurityEvent({ kind: "spot_offer_expiry_run", ip, detail: "deferred-inngest" });
    return Response.json({ ok: true, skipped: true, via: "inngest", reason: "inngest-owns-schedule" });
  }
  const result = await runSpotOfferExpiryJob();
  await logSecurityEvent({
    kind: "spot_offer_expiry_run",
    ip,
    detail: url.searchParams.get("dryRun") === "1" ? "dry-run" : "ok",
  });
  return Response.json(result);
}

export const Route = createFileRoute("/api/spot-offers")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
