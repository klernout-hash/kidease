import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { shouldDeferRankingMarketToInngest } from "@/lib/inngest";
import { runRankingMarketJob } from "@/lib/server/ranking-market";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "ranking_market_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  if (shouldDeferRankingMarketToInngest(request)) {
    await logSecurityEvent({ kind: "ranking_market_run", ip, detail: "deferred-inngest" });
    return Response.json({ ok: true, skipped: true, via: "inngest", reason: "inngest-owns-schedule" });
  }
  const result = await runRankingMarketJob({ dryRun });
  await logSecurityEvent({ kind: "ranking_market_run", ip, detail: dryRun ? "dry-run" : "ok" });
  return Response.json(result);
}

export const Route = createFileRoute("/api/ranking-market")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
