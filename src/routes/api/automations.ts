import { createFileRoute } from "@tanstack/react-router";
import { isAutomationCronJob } from "@/lib/automations";
import { cronAuthorized } from "@/lib/cron-auth";
import { shouldDeferCronToInngest } from "@/lib/inngest";
import { runNeonBackupJob } from "@/lib/server/automation-backup";
import {
  runInvoiceRemindersJob,
  runListingRemindersJob,
  runStaleOpenSpotsJob,
  runTourFollowupsJob,
} from "@/lib/server/automation-jobs";
import { recordClientError, runOpsAlertsJob } from "@/lib/server/automation-ops";
import { isBotUserAgent } from "@/lib/posthog-errors";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

const JOBS = {
  "ops-alerts": runOpsAlertsJob,
  "invoice-reminders": runInvoiceRemindersJob,
  "listing-reminders": runListingRemindersJob,
  "stale-open-spots": runStaleOpenSpotsJob,
  "tour-followups": runTourFollowupsJob,
  "neon-backup": runNeonBackupJob,
} as const;

async function clientError(request: Request) {
  const ua = request.headers.get("user-agent");
  if (isBotUserAgent(ua)) return new Response(null, { status: 204 });
  const webdriver = /webdriver|headless/i.test(ua || "");
  const result = await recordClientError({ userAgent: ua, webdriver });
  return Response.json(result);
}

async function run(request: Request) {
  const url = new URL(request.url);
  const job = String(url.searchParams.get("job") || "").trim();
  if (job === "client-error") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    return clientError(request);
  }
  const ip = requestIp(request);
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "automation_denied", ip, detail: job || "missing-job" });
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isAutomationCronJob(job)) {
    return Response.json({ ok: false, error: "unknown job" }, { status: 400 });
  }
  if (shouldDeferCronToInngest(request)) {
    await logSecurityEvent({ kind: "automation_run", ip, detail: `${job}:deferred-inngest` });
    return Response.json({ ok: true, skipped: true, via: "inngest", job });
  }
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const result = await JOBS[job]({ dryRun, force });
  await logSecurityEvent({
    kind: "automation_run",
    ip,
    detail: `${job}:${result.ok === false ? "failed" : dryRun ? "dry-run" : "ok"}`.slice(0, 180),
  });
  const status = result.ok === false ? 500 : 200;
  return Response.json({ job, ...result }, { status });
}

export const Route = createFileRoute("/api/automations")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
