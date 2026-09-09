import { SEARCH_ALERTS_CRON, SEARCH_ALERTS_EVENT, WAITLIST_PULSE_EVENT } from "@/lib/inngest";
import { runSearchAlertJob } from "@/lib/server/search-alerts";
import { runWaitlistPulseJob } from "@/lib/server/waitlist-pulse";
import { inngest } from "./client";

/**
 * First Inngest job: wrap the existing saved-search alert cron.
 *
 * Same work as GET|POST /api/search-alerts. sendPush / sendSms are wired
 * and no-op while FEATURE_PUSH / FEATURE_SMS stay off. Email respects CASL.
 *
 * Triggers:
 *   - hourly cron (America/Winnipeg :20) once Inngest Cloud is registered
 *   - event `kidease/search-alerts.run` for a dashboard / HTTP invoke
 *
 * Vercel cron stays as fallback when INNGEST_* keys are unset.
 */
export const searchAlertsHourly = inngest.createFunction(
  {
    id: "search-alerts-hourly",
    name: "Search alerts (hourly)",
    triggers: [{ cron: SEARCH_ALERTS_CRON }, { event: SEARCH_ALERTS_EVENT }],
  },
  async ({ event, step }) => {
    const data = event && typeof event === "object" && "data" in event ? event.data : undefined;
    const dryRun = Boolean(data && typeof data === "object" && "dryRun" in data && data.dryRun);
    return step.run("run-search-alert-job", () => runSearchAlertJob({ dryRun }));
  },
);

/**
 * Waitlist pulse: one durable fan-out per spot-open event.
 * Idempotent on pulseId. FEATURE_PUSH stays off (job never calls FCM / APNs).
 * SMS still requires FEATURE_SMS + stored CASL consent inside the job.
 */
export const waitlistPulse = inngest.createFunction(
  {
    id: "waitlist-pulse",
    name: "Waitlist pulse",
    triggers: [{ event: WAITLIST_PULSE_EVENT }],
    idempotency: "event.data.pulseId",
  },
  async ({ event, step }) => {
    const data = event && typeof event === "object" && "data" in event ? event.data : undefined;
    const pulseId =
      data && typeof data === "object" && "pulseId" in data ? String(data.pulseId || "").trim() : "";
    const dryRun = Boolean(data && typeof data === "object" && "dryRun" in data && data.dryRun);
    if (!pulseId) return { ok: false as const, error: "missing pulseId" };
    return step.run("fan-out-waitlist-pulse", () => runWaitlistPulseJob({ pulseId, dryRun }));
  },
);

export const functions = [searchAlertsHourly, waitlistPulse];
