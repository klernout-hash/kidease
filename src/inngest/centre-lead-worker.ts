import { centreLeadTrackerEnabled } from "@/lib/features";
import { runCentreLeadJobs } from "@/lib/server/centre-leads";
import { inngest } from "./client";

/** Proposed cadence only. Registration requires the separate schedule opt-in. */
export const CENTRE_LEAD_WORKER_CRON = "TZ=America/Winnipeg 10 * * * *";

/**
 * The default app registers no tracker schedule. The feature flag remains an
 * execution guard so a cold PostHog overlay cannot decide registry membership.
 */
export function createCentreLeadWorkerFunctions(env: NodeJS.ProcessEnv = process.env) {
  if (env.CENTRE_LEAD_WORKER_SCHEDULE !== "1") return [];

  return [
    inngest.createFunction(
      {
        id: "centre-lead-worker-hourly",
        name: "Centre lead worker (hourly)",
        triggers: [{ cron: CENTRE_LEAD_WORKER_CRON }],
        concurrency: 1,
        idempotency: "event.id",
        // A later scheduled tick handles the next bounded batch.
        retries: 0,
      },
      async ({ event, step }) => {
        if (env.CENTRE_LEAD_WORKER_SCHEDULE !== "1") {
          return { ok: true as const, skipped: true as const, reason: "schedule" };
        }
        if (!centreLeadTrackerEnabled()) {
          return { ok: true as const, skipped: true as const, reason: "flag" };
        }
        if (typeof event?.id !== "string" || !event.id.trim()) {
          throw new Error("Missing centre lead worker event id");
        }
        return step.run("run-centre-lead-worker", async () => {
          const result = await runCentreLeadJobs();
          if (!result.ok) throw new Error("Centre lead worker failed");
          return result;
        });
      },
    ),
  ];
}
