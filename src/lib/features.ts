/**
 * Server-side product flags. Default OFF, including provider subscriptions.
 * Env is the safe fallback. Optional PostHog overlay: see src/lib/flags.ts
 * and docs/flags.md. Do not use these for auth, payments, or Turnstile —
 * those stay env-gated helpers (stripeChargesLive, turnstileMode, authConfigured).
 *
 * FEATURE_PUSH and FEATURE_SMS stay off unless env or PostHog explicitly enables them.
 */

import { envFlagOn, evaluateFeatureFlag, type EnvMap } from "./flags.ts";
import { enabledToolIds, type CentreToolId } from "./centre-tools.ts";

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
 * Daycare SaaS packages on the provider desk. Off when unset.
 * Set FEATURE_PROVIDER_SUBSCRIPTIONS=1 to show Subscription and Promote.
 * Admin can still preview when the flag is off.
 */
export function providerSubscriptionsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PROVIDER_SUBSCRIPTIONS", env);
}

/** Daycare Insights tab. Off until Kyle turns it on. Numbers stay on the server. */
export function providerInsightsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PROVIDER_INSIGHTS", env);
}

/** Search ranking v2. Off. Best match is unchanged until this is on. */
export function rankingV2Enabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_RANKING_V2", env);
}

/** Messages support thread. Off. Nothing is created or sent until this is on. */
export function supportDeskEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_SUPPORT_CHAT", env);
}

/** Owner SMS replies into a support thread. Off. Also needs FEATURE_SUPPORT_CHAT. */
export function supportSmsReplyEnabled(env?: EnvMap): boolean {
  return supportDeskEnabled(env) && evaluateFeatureFlag("FEATURE_SUPPORT_SMS_REPLY", env);
}

/** Owner email when a support message arrives. Off. The chat flag does not turn this on. */
export function supportEmailAlertEnabled(env?: EnvMap): boolean {
  const source = env ?? (typeof process !== "undefined" ? (process.env as EnvMap) : {});
  return evaluateFeatureFlag("FEATURE_SUPPORT_CHAT", source) && envFlagOn(source.SUPPORT_EMAIL_ALERTS);
}

/** KidEase Top Rated. Off. Not a government rating. */
export function topRatedEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_TOP_RATED_BADGE", env);
}

/** Mobile Where / When / Who search. Off. The current search stays until this is on. */
export function mobileSearchV2Enabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_MOBILE_SEARCH_V2", env);
}

/** Calm full-screen phone shell. Off. Today’s screens stay until this is on. */
export function airbnbUiEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_UI_AIRBNB_V1", env);
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

/** Government desk and footer link. Default off. /gov and /gov/login redirect home. */
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

/**
 * Listing-pin distance on Need care fast. Default off.
 * Does not enable FEATURE_NCF_STREET or FEATURE_NEED_CARE_FAST.
 */
export function ncfPointDistanceEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_NCF_POINT_DISTANCE", env);
}

/** Private R2 links for daily logs and learning stories. Default off. */
export function privateMediaEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PRIVATE_MEDIA", env);
}

/** Rotating daycare check-in code. Default off. Still needs KIOSK_TOKEN_SECRET to mint. */
export function qrKioskEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_QR_KIOSK", env);
}

/** Provincial licensing CSV and PDF. Default off. */
export function provinceReportsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PROVINCE_REPORTS", env);
}

/** Province-only government totals. Default off. Does not sign anyone out. */
export function govScopesEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_GOV_SCOPES", env);
}

/**
 * French (Canada) pack. Default off.
 * Off: today's locale rules (Quebec only, browser language ignored).
 * On: Quebec and New Brunswick, plus the browser or device language, and French email and SMS.
 */
export function frCaEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_FR_CA", env);
}

/** French auth pages' geo redirect plus French reset, code, and verify mail. Off until set. */
export function frAuthQcEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_FR_AUTH_QC", env);
}

/** Province curriculum pack. Default off. */
export function curriculumPackEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CURRICULUM_PACK", env);
}

/** Parents see published curriculum stories. Default off. */
export function curriculumPackLive(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CURRICULUM_PACK_LIVE", env);
}

/** Local CC BY picture books. Default off. */
export function storyCornerEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_STORY_CORNER", env);
}

/** Second parent, own login, shared family records. Default off. No email or SMS. */
export function coparentLinkEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_COPARENT_LINK", env);
}

/** Child file must be complete before a daycare can approve. Default off. */
export function childPortfolioGateEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CHILD_PORTFOLIO_GATE", env);
}

/** Co-parent email invite, daycare confirm, and custody limits. Default off. */
export function coparentEmailEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_COPARENT_EMAIL", env);
}

/** Drop-off and pick-up reminders. Default off. Does not turn on push or SMS. */
export function careRemindersEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CARE_REMINDERS", env);
}

/** Staff clock in and clock out on the daycare desk. Default off. Not payroll. */
export function staffTimesheetsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_STAFF_TIMESHEETS", env);
}

/** Centre reply under a public parent review. Default off. No email. */
export function reviewRepliesEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_REVIEW_REPLIES", env);
}

/** Enrolment e-sign, sign page, and signed PDF. Default off. */
export function enrolmentEsignEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_ENROLMENT_ESIGN", env);
}

/** Yearly receipt from paid invoices, as a PDF. Default off. */
export function taxReceiptsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_TAX_RECEIPTS", env);
}

/** Daily journal, meals, and naps. Default off. */
export function dailyLogsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_DAILY_LOGS", env);
}

/** Tour calendar and in-app reminders. Default off. */
export function tourCalendarEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_TOUR_CALENDAR", env);
}

/** Parent document vault. Default off. */
export function familyVaultEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_FAMILY_VAULT", env);
}

/** Centre email to one or more families. Off. No message is sent. */
export function familyBulkMailEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_FAMILY_BULK_MAIL", env);
}

/** CSV download for centre lists. Off. */
export function listCsvEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_LIST_CSV", env);
}

/** Public licence-type filter. Off. Unknown is never guessed. */
export function licenceTypeFilterEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_LICENCE_TYPE_FILTER", env);
}

/** Search for more than one child. Off. Ages are not saved. */
export function multiChildSearchEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_MULTI_CHILD_SEARCH", env);
}

/** Hide an open-spot badge after the freshness window. Off. */
export function vacancyFreshnessEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_VACANCY_FRESHNESS", env);
}

/** Hide fees that are not confirmed. Off. */
export function feeDisplayGateEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_FEE_DISPLAY_GATE", env);
}

/** Daycare inbox also lists requests with no thread. Default off. */
export function unifiedInboxEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_UNIFIED_INBOX", env);
}

/** In-app voice on a thread. Default off. Does not place a call. */
export function voiceCallsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_VOICE", env);
}

/** Pickup people on a child profile. Default off. */
export function pickupContactsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PICKUP_CONTACTS", env);
}

/**
 * Parent and centre enrolment agreement.
 * Both flags must be on. DocuSign is the only send, and only after a click.
 */
export function parentAgreementEnabled(env?: EnvMap): boolean {
  return enrolmentEsignEnabled(env) && evaluateFeatureFlag("FEATURE_PARENT_AGREEMENT", env);
}

/** Daycare waitlist rank and the place a parent sees. Default off. No fee. */
export function waitlistToolsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_WAITLIST_TOOLS", env);
}

/** Post open spots by age group. Mail and push still use their own flags. Default off. */
export function ageOpenSpotsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_AGE_OPEN_SPOTS", env);
}

/** Timestamped arrival and pickup on the daycare desk. Default off. No photo. */
export function childCheckinEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CHILD_CHECKIN", env);
}

/** Listing editor and day calendar on the daycare desk. Default off. */
export function hostListingEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_HOST_LISTING", env);
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

/** Family steps on the daycare desk. Off. Does not send mail, text, or push. */
export function centreLeadTrackerEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_CENTRE_LEAD_TRACKER", env);
}

/** Per-centre API. Off. Also needs the lead tracker for the desk that creates keys. */
export function centreApiEnabled(env?: EnvMap): boolean {
  return centreLeadTrackerEnabled(env) && evaluateFeatureFlag("FEATURE_CENTRE_API", env);
}

/** Unified alerts. Off. Saving choices does not send. */
export function unifiedAlertsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_UNIFIED_ALERTS", env);
}

/** Email and existing phone push for unified alerts. Off unless both flags are on. */
export function unifiedAlertsLive(env?: EnvMap): boolean {
  return unifiedAlertsEnabled(env) && evaluateFeatureFlag("FEATURE_UNIFIED_ALERTS_LIVE", env);
}

/** Centre tools (meal plans, observations, checklists, billing helpers). Each default off. */
export function centreToolIds(env?: EnvMap): CentreToolId[] {
  return enabledToolIds((flag) => evaluateFeatureFlag(flag, env));
}
