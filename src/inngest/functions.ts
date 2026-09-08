import { SEARCH_ALERTS_CRON, SEARCH_ALERTS_EVENT } from "@/lib/inngest";
import { runSearchAlertJob } from "@/lib/server/search-alerts";
import { inngest } from "./client";

/**
 * First Inngest job: wrap the existing saved-search alert cron.
 *
 * Same work as GET|POST /api/search-alerts. FEATURE_PUSH stays off
 * (runSearchAlertJob never calls FCM / APNs). Email still respects CASL.
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

export const functions = [searchAlertsHourly];
