/**
 * Server-side product flags. Default OFF (except provider subscriptions).
 * Env is the safe fallback. Optional PostHog overlay: see src/lib/flags.ts
 * and docs/flags.md. Do not use these for auth, payments, or Turnstile —
 * those stay env-gated helpers (stripeChargesLive, turnstileMode, authConfigured).
 *
 * FEATURE_PUSH and FEATURE_SMS stay off unless env or PostHog explicitly enables them.
 */

import { evaluateFeatureFlag, type EnvMap } from "./flags.ts";

export { envFlagOn, evaluateFeatureFlag, describeFeatureFlag } from "./flags.ts";
export type { EnvMap, FeatureFlagKey, FlagDecision, FlagSource } from "./flags.ts";
export {
  describeChannelReadiness,
  isVercelProduction,
  pushArmed,
  smsArmed,
  smsSendEnabled,
  videoArmed,
  videoSurfaceEnabled,
} from "./channel-readiness.ts";

export function inAppChatEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_INAPP_CHAT", env);
}

export function pushEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PUSH", env);
}

/** Transactional Twilio SMS (vacancy / claim / bill reminder). Default OFF. */
export function smsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_SMS", env);
}

/** Parent ↔ centre Twilio Video tours (Parent Plus). Default OFF. */
export function videoEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_VIDEO", env);
}

/**
 * Daycare SaaS packages on the provider desk. LIVE by default.
 * Set FEATURE_PROVIDER_SUBSCRIPTIONS=0 only to hide the tab from directors
 * (admin can still preview — ghost).
 */
export function providerSubscriptionsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PROVIDER_SUBSCRIPTIONS", env);
}

/** Honest copy when SHOW_PAY_CTAS is off. Stripe / plan code stays compiled. */
export const PLANS_NOT_OFFERED_YET =
  "Plans are not offered on this site yet. Listing and claim stay free.";

/**
 * Parent- and director-facing Upgrade / Subscribe / plan-price chrome.
 * Default OFF. Does not delete Stripe, webhooks, or plan tables.
 * Set SHOW_PAY_CTAS=1 to restore CTAs once SUBSCRIPTIONS_ENABLED is on.
 * Admin Stripe screens stay available.
 *
 * Master switch for paid plans. Default off (free founding period).
 * Env `SUBSCRIPTIONS_ENABLED=1` or the same PostHog flag turns checkout back on.
 * While off, showPayCtas and canUsePayCheckout stay false for every role.
 */
export function subscriptionsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("SUBSCRIPTIONS_ENABLED", env);
}

/** Public Founding member badge. Default on. Does not clear the database marker. */
export function foundingBadgeEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FOUNDING_BADGE_ENABLED", env);
}

export function showPayCtas(env?: EnvMap): boolean {
  if (!subscriptionsEnabled(env)) return false;
  return evaluateFeatureFlag("SHOW_PAY_CTAS", env);
}

/** Email when a saved search matches a newly posted open spot. Default off. */
export function openSpotAlertsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_OPEN_SPOT_ALERTS", env);
}

/** Email a parent when a daycare offers a spot. Default OFF. The offer still shows in the account. */
export function spotOfferMailEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_SPOT_OFFER_MAIL", env);
}

/** Weekly "any open spots?" email. Default OFF. No send while this is off. */
export function openSpotsCheckinMailEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_OPEN_SPOTS_CHECKIN_MAIL", env);
}

/**
 * Weekly open-spots SMS. Default OFF. sendSms still requires FEATURE_SMS,
 * CASL consent, and Twilio. The toll-free sender is approved. This flag stays off.
 */
export function openSpotsCheckinSmsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_OPEN_SPOTS_CHECKIN_SMS", env);
}

/** Public Quebec recognized home daycares. Default OFF. No provider email or SMS. */
export function qcHomeDaycaresEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_QC_HOME_DAYCARES", env);
}

/**
 * Email when an area waitlist matches a posted spot. Default OFF.
 * Kyle approved the wording. Set this to send it. In-app notices still save.
 */
export function areaWaitlistAlertsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_AREA_WAITLIST_ALERTS", env);
}

/** PostHog exception capture. Default off. Live send still needs FEATURE_POSTHOG_ERRORS_LIVE. */
export function posthogErrorsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_POSTHOG_ERRORS", env);
}

/** Ops mail to kyle@kidease.ca. Default off. */
export function opsAlertsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_OPS_ALERTS", env);
}

/** Better Stack heartbeat after a successful cron. Default off. */
export function cronHeartbeatsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CRON_HEARTBEATS", env);
}

/** Bill due reminders. Default off. */
export function invoiceRemindersEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_INVOICE_REMINDERS", env);
}

/** Failed-payment follow-ups. Default off. */
export function paymentDunningEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PAYMENT_DUNNING", env);
}

/** Weekly missing-info mail. Default off. */
export function missingInfoRemindersEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_MISSING_INFO_REMINDERS", env);
}

/** Daycare claim onboarding series. Default off. */
export function daycareOnboardingEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_DAYCARE_ONBOARDING", env);
}

/** Unclaimed-listing claim reminders. Default off. */
export function claimListingRemindersEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CLAIM_LISTING_REMINDERS", env);
}

/** Hide stale open spots. Default off. */
export function staleOpenSpotsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_STALE_OPEN_SPOTS", env);
}

/** Post-tour email. Default off. */
export function postTourFollowupEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_POST_TOUR_FOLLOWUP", env);
}

/** Enrolment review invite. Default off. */
export function enrolmentReviewEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_ENROLMENT_REVIEW", env);
}

/** Weekly database backup. Default off. */
export function neonBackupEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_NEON_BACKUP", env);
}

/** Cached ON, BC, and AB inspection rows on a listing. Default off. */
export function inspectionHistoryEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_INSPECTION_HISTORY", env);
}

/** Per-province vacancy pages and confirm history. Default OFF. The national index stays. */
export function provincialVacancyIndexEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PROVINCIAL_VACANCY_INDEX", env);
}

/** Review reports and one-review rating summaries. Default OFF. Three-review gate stays. */
export function reviewReportsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_REVIEW_REPORTS", env);
}

/** No-show, reminder moves, and calendar text in the tour email. Default OFF. */
export function tourPipelineEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_TOUR_PIPELINE", env);
}

/** Availability-then-distance on Need care fast. Default OFF. No Google Maps. */
export function needCareFastEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_NEED_CARE_FAST", env);
}

/** Diet and extra-support profile fields. Default OFF. Search chips stay. */
export function inclusiveFiltersEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_INCLUSIVE_FILTERS", env);
}

/** ECE post, apply, and applicants. Default OFF. No charge. */
export function eceJobsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_ECE_JOBS", env);
}

/** Door check-in without a camera. Default OFF. The camera preview stays until this is on. */
export function digitalAttendanceEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_DIGITAL_ATTENDANCE", env);
}

/** Shifts, ECE expiry mail, and room ratios. Default off. Not payroll. */
export function staffSchedulingEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_STAFF_SCHEDULING", env);
}

/** Private learning stories. Default off. No public photos. */
export function learningPortfoliosEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_LEARNING_PORTFOLIOS", env);
}

/** Multi-site occupancy. Default off. Does not invent a count. */
export function orgDashboardEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_ORG_DASHBOARD", env);
}

/** Private classroom photos. Default OFF. Public listings do not show them. */
export function privatePhotoFeedEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PRIVATE_PHOTO_FEED", env);
}

/** Small footer link. Default off. Does not gate /gov sign-in. */
export function govPortalFooterEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_GOV_PORTAL", env);
}

/** Named PostHog product events. Default off. Does not add personal details. */
export function productEventsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PRODUCT_EVENTS", env);
}

/** Street-level Need care fast via OpenStreetMap. Default off. No Google. */
export function ncfStreetEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_NCF_STREET", env);
}

/** Live checkout for KidEase plans. Refuses everyone while subscriptions are off. */
export function canUsePayCheckout(role?: string | null, env?: EnvMap): boolean {
  if (!subscriptionsEnabled(env)) return false;
  if (showPayCtas(env)) return true;
  const r = String(role || "")
    .trim()
    .toLowerCase();
  return r === "admin";
}

export function assertPayCheckoutAllowed(role?: string | null, env?: EnvMap): void {
  if (!canUsePayCheckout(role, env)) {
    throw new Error(PLANS_NOT_OFFERED_YET);
  }
}

/**
 * Who may see the provider Subscription tab and page.
 * Directors (and anyone who owns a centre) when the feature is live.
 * Admin always, including kill-switch preview.
 */
export function canSeeProviderSubscriptions(
  role: string | null | undefined,
  env?: EnvMap,
  ownsCentre = false,
): boolean {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (r === "admin") return true;
  if (r === "provider" || ownsCentre) return providerSubscriptionsEnabled(env);
  return false;
}
