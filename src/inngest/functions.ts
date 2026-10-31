import { SEARCH_ALERTS_CRON, SEARCH_ALERTS_EVENT, TOUR_HOLDS_CRON, TOUR_HOLDS_EVENT, WAITLIST_PULSE_EVENT, RANKING_MARKET_CRON, RANKING_MARKET_EVENT, PROVINCIAL_VACANCY_CRON, PROVINCIAL_VACANCY_EVENT, TRUTH_CHECK_CRON, TRUTH_CHECK_EVENT, SPOT_OFFERS_CRON, SPOT_OFFERS_EVENT, OPEN_SPOTS_CHECKIN_CRON, OPEN_SPOTS_CHECKIN_EVENT, OPS_ALERTS_CRON, OPS_ALERTS_EVENT, INVOICE_REMINDERS_CRON, INVOICE_REMINDERS_EVENT, LISTING_REMINDERS_CRON, LISTING_REMINDERS_EVENT, STALE_OPEN_SPOTS_CRON, STALE_OPEN_SPOTS_EVENT, TOUR_FOLLOWUPS_CRON, TOUR_FOLLOWUPS_EVENT, NEON_BACKUP_CRON, NEON_BACKUP_EVENT } from "@/lib/inngest";
import { runSearchAlertJob } from "@/lib/server/search-alerts";
import { runExpireTourHoldsJob } from "@/lib/server/tour-holds";
import { runWaitlistPulseJob } from "@/lib/server/waitlist-pulse";
import { runRankingMarketJob } from "@/lib/server/ranking-market";
import { runProvincialVacancyJob } from "@/lib/server/provincial-vacancy";
import { runTruthCheckerJob } from "@/lib/server/admin-tools";
import { runSpotOfferExpiryJob } from "@/lib/server/spot-offers";
import { runOpenSpotsCheckinJob } from "@/lib/server/open-spots-checkin";
import {
  runInvoiceRemindersJob,
  runListingRemindersJob,
  runStaleOpenSpotsJob,
  runTourFollowupsJob,
} from "@/lib/server/automation-jobs";
import { runNeonBackupJob } from "@/lib/server/automation-backup";
import { runOpsAlertsJob } from "@/lib/server/automation-ops";
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

export const expireTourHoldsHourly = inngest.createFunction(
  {
    id: "tour-holds-hourly",
    name: "Expire tour soft-holds (hourly)",
    triggers: [{ cron: TOUR_HOLDS_CRON }, { event: TOUR_HOLDS_EVENT }],
  },
  async ({ event, step }) => {
    const data = event && typeof event === "object" && "data" in event ? event.data : undefined;
    const dryRun = Boolean(data && typeof data === "object" && "dryRun" in data && data.dryRun);
    return step.run("expire-tour-holds", () => runExpireTourHoldsJob({ dryRun }));
  },
);

export const rankingMarketNightly = inngest.createFunction(
  {
    id: "ranking-market-nightly",
    name: "Demand vs supply (nightly)",
    triggers: [{ cron: RANKING_MARKET_CRON }, { event: RANKING_MARKET_EVENT }],
  },
  async ({ event, step }) => {
    const data = event && typeof event === "object" && "data" in event ? event.data : undefined;
    const dryRun = Boolean(data && typeof data === "object" && "dryRun" in data && data.dryRun);
    return step.run("build-ranking-market", () => runRankingMarketJob({ dryRun }));
  },
);

export const provincialVacancyNightly = inngest.createFunction(
  {
    id: "provincial-vacancy-nightly",
    name: "Provincial openings (nightly)",
    triggers: [{ cron: PROVINCIAL_VACANCY_CRON }, { event: PROVINCIAL_VACANCY_EVENT }],
  },
  async ({ event, step }) => {
    const data = event && typeof event === "object" && "data" in event ? event.data : undefined;
    const dryRun = Boolean(data && typeof data === "object" && "dryRun" in data && data.dryRun);
    return step.run("import-provincial-openings", () => runProvincialVacancyJob({ dryRun }));
  },
);

export const truthCheckerNightly = inngest.createFunction(
  {
    id: "truth-checker-nightly",
    name: "Listing website check (nightly)",
    triggers: [{ cron: TRUTH_CHECK_CRON }, { event: TRUTH_CHECK_EVENT }],
  },
  async ({ step }) => step.run("queue-website-diffs", () => runTruthCheckerJob()),
);

export const expireSpotOffersHourly = inngest.createFunction(
  {
    id: "spot-offers-hourly",
    name: "Expire spot offers (hourly)",
    triggers: [{ cron: SPOT_OFFERS_CRON }, { event: SPOT_OFFERS_EVENT }],
  },
  async ({ step }) => step.run("expire-spot-offers", () => runSpotOfferExpiryJob()),
);

export const openSpotsCheckinWeekly = inngest.createFunction(
  {
    id: "open-spots-checkin-weekly",
    name: "Open spots check-in (weekly)",
    triggers: [{ cron: OPEN_SPOTS_CHECKIN_CRON }, { event: OPEN_SPOTS_CHECKIN_EVENT }],
  },
  async ({ step }) => step.run("ask-open-spots", () => runOpenSpotsCheckinJob()),
);

function dryRunFromEvent(event: { data?: unknown } | undefined): boolean {
  const data = event && typeof event === "object" && "data" in event ? event.data : undefined;
  return Boolean(data && typeof data === "object" && "dryRun" in data && data.dryRun);
}

export const opsAlertsHourly = inngest.createFunction(
  {
    id: "ops-alerts-hourly",
    name: "Ops alerts (hourly)",
    triggers: [{ cron: OPS_ALERTS_CRON }, { event: OPS_ALERTS_EVENT }],
  },
  async ({ step }) => step.run("ops-alerts", () => runOpsAlertsJob()),
);

export const invoiceRemindersDaily = inngest.createFunction(
  {
    id: "invoice-reminders-daily",
    name: "Invoice reminders (daily)",
    triggers: [{ cron: INVOICE_REMINDERS_CRON }, { event: INVOICE_REMINDERS_EVENT }],
  },
  async ({ event, step }) =>
    step.run("invoice-reminders", () => runInvoiceRemindersJob({ dryRun: dryRunFromEvent(event) })),
);

export const listingRemindersDaily = inngest.createFunction(
  {
    id: "listing-reminders-daily",
    name: "Listing reminders (daily)",
    triggers: [{ cron: LISTING_REMINDERS_CRON }, { event: LISTING_REMINDERS_EVENT }],
  },
  async ({ event, step }) =>
    step.run("listing-reminders", () => runListingRemindersJob({ dryRun: dryRunFromEvent(event) })),
);

export const staleOpenSpotsDaily = inngest.createFunction(
  {
    id: "stale-open-spots-daily",
    name: "Hide stale open spots (daily)",
    triggers: [{ cron: STALE_OPEN_SPOTS_CRON }, { event: STALE_OPEN_SPOTS_EVENT }],
  },
  async ({ event, step }) =>
    step.run("stale-open-spots", () => runStaleOpenSpotsJob({ dryRun: dryRunFromEvent(event) })),
);

export const tourFollowupsHourly = inngest.createFunction(
  {
    id: "tour-followups-hourly",
    name: "Tour follow-up and review (hourly)",
    triggers: [{ cron: TOUR_FOLLOWUPS_CRON }, { event: TOUR_FOLLOWUPS_EVENT }],
  },
  async ({ event, step }) =>
    step.run("tour-followups", () => runTourFollowupsJob({ dryRun: dryRunFromEvent(event) })),
);

export const neonBackupWeekly = inngest.createFunction(
  {
    id: "neon-backup-weekly",
    name: "Neon backup (weekly)",
    triggers: [{ cron: NEON_BACKUP_CRON }, { event: NEON_BACKUP_EVENT }],
  },
  async ({ event, step }) =>
    step.run("neon-backup", () => runNeonBackupJob({ dryRun: dryRunFromEvent(event) })),
);

export const functions = [
  searchAlertsHourly,
  waitlistPulse,
  expireTourHoldsHourly,
  rankingMarketNightly,
  provincialVacancyNightly,
  truthCheckerNightly,
  expireSpotOffersHourly,
  openSpotsCheckinWeekly,
  opsAlertsHourly,
  invoiceRemindersDaily,
  listingRemindersDaily,
  staleOpenSpotsDaily,
  tourFollowupsHourly,
  neonBackupWeekly,
];
