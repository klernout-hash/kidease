/**
 * Product feature flags: env defaults + optional PostHog overlay.
 *
 * Why PostHog (not Vercel Flags, Flagsmith, or LaunchDarkly): KidEase
 * already ships posthog-js, legal copy lists feature flags, and
 * `isPostHogFlagEnabled` exists. A thin POST /flags HTTP call needs no extra
 * SDK and no personal API key. Unset POSTHOG_FLAGS_KEY → env-only, same as today.
 *
 * Do not use these for auth or Turnstile.
 * SUBSCRIPTIONS_ENABLED is the one payments gate: it only decides whether
 * checkout is offered. Stripe secrets stay in their own env helpers.
 * FEATURE_PUSH and FEATURE_SMS default off. Do not flip them here.
 *
 * No @/ imports — scripts/flags.test.mjs loads this file in Node.
 */

export type EnvMap = Record<string, string | undefined>;

export const FEATURE_FLAG_KEYS = [
  "FEATURE_INAPP_CHAT",
  "FEATURE_PUSH",
  "FEATURE_SMS",
  "FEATURE_VIDEO",
  "FEATURE_PROVIDER_SUBSCRIPTIONS",
  "SHOW_PAY_CTAS",
  "SUBSCRIPTIONS_ENABLED",
  "FOUNDING_BADGE_ENABLED",
  "FEATURE_OPEN_SPOT_ALERTS",
  "FEATURE_SPOT_OFFER_MAIL",
  "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
  "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
  "FEATURE_QC_HOME_DAYCARES",
  "FEATURE_AREA_WAITLIST_ALERTS",
  "FEATURE_POSTHOG_ERRORS",
  "FEATURE_OPS_ALERTS",
  "FEATURE_CRON_HEARTBEATS",
  "FEATURE_INVOICE_REMINDERS",
  "FEATURE_PAYMENT_DUNNING",
  "FEATURE_MISSING_INFO_REMINDERS",
  "FEATURE_DAYCARE_ONBOARDING",
  "FEATURE_CLAIM_LISTING_REMINDERS",
  "FEATURE_STALE_OPEN_SPOTS",
  "FEATURE_POST_TOUR_FOLLOWUP",
  "FEATURE_ENROLMENT_REVIEW",
  "FEATURE_NEON_BACKUP",
  "FEATURE_INSPECTION_HISTORY",
  "FEATURE_PROVINCIAL_VACANCY_INDEX",
  "FEATURE_REVIEW_REPORTS",
  "FEATURE_TOUR_PIPELINE",
  "FEATURE_NEED_CARE_FAST",
  "FEATURE_INCLUSIVE_FILTERS",
  "FEATURE_ECE_JOBS",
  "FEATURE_DIGITAL_ATTENDANCE",
  "FEATURE_STAFF_SCHEDULING",
  "FEATURE_LEARNING_PORTFOLIOS",
  "FEATURE_ORG_DASHBOARD",
  "FEATURE_PRIVATE_PHOTO_FEED",
  "FEATURE_GOV_PORTAL",
  "FEATURE_PRODUCT_EVENTS",
  "FEATURE_NCF_STREET",
  "FEATURE_NCF_POINT_DISTANCE",
  "FEATURE_PRIVATE_MEDIA",
  "FEATURE_QR_KIOSK",
  "FEATURE_PROVINCE_REPORTS",
  "FEATURE_GOV_SCOPES",
  "FEATURE_FR_CA",
  "FEATURE_CURRICULUM_PACK",
  "FEATURE_CURRICULUM_PACK_LIVE",
  "FEATURE_STORY_CORNER",
  "FEATURE_COPARENT_LINK",
  "FEATURE_STAFF_TIMESHEETS",
  "FEATURE_REVIEW_REPLIES",
  "FEATURE_ENROLMENT_ESIGN",
  "FEATURE_TAX_RECEIPTS",
  "FEATURE_DAILY_LOGS",
  "FEATURE_TOUR_CALENDAR",
  "FEATURE_FAMILY_VAULT",
  "FEATURE_UNIFIED_INBOX",
  "FEATURE_VOICE",
  "FEATURE_PICKUP_CONTACTS",
  "FEATURE_PARENT_AGREEMENT",
  "FEATURE_WAITLIST_TOOLS",
  "FEATURE_AGE_OPEN_SPOTS",
  "FEATURE_CHILD_CHECKIN",
  "FEATURE_HOST_LISTING",
  "FEATURE_MEAL_PLANNING",
  "FEATURE_DEV_OBSERVATIONS",
  "FEATURE_STAFF_PD",
  "FEATURE_MAINTENANCE_CHECKLISTS",
  "FEATURE_CLEANING_CHECKLISTS",
  "FEATURE_QUICKBOOKS_EXPORT",
  "FEATURE_TAP_TO_PAY",
  "FEATURE_ATTENDANCE_BILLING",
  "FEATURE_PAYROLL",
  "FEATURE_SUBSIDY_BILLING",
  "FEATURE_OFFLINE_CHECKIN",
  "FEATURE_AMAZON_ADM",
  "FEATURE_LOGIN_AMAZON",
  "FEATURE_FIRE_KIOSK",
  "FEATURE_ALEXA_SKILL",
  "FEATURE_CHILD_PORTFOLIO_GATE",
  "FEATURE_COPARENT_EMAIL",
  "FEATURE_CARE_REMINDERS",
  "FEATURE_UNIFIED_ALERTS",
  "FEATURE_UNIFIED_ALERTS_LIVE",
  "FEATURE_PROVIDER_INSIGHTS",
  "FEATURE_RANKING_V2",
  "FEATURE_SUPPORT_CHAT",
  "FEATURE_SUPPORT_SMS_REPLY",
  "FEATURE_TOP_RATED_BADGE",
  "FEATURE_MOBILE_SEARCH_V2",
  "FEATURE_UI_AIRBNB_V1",
  "FEATURE_FR_AUTH_QC",
  "FEATURE_FAMILY_BULK_MAIL",
  "FEATURE_LIST_CSV",
  "FEATURE_LICENCE_TYPE_FILTER",
  "FEATURE_MULTI_CHILD_SEARCH",
  "FEATURE_VACANCY_FRESHNESS",
  "FEATURE_FEE_DISPLAY_GATE",
  "FEATURE_CENTRE_LEAD_TRACKER",
  "FEATURE_CENTRE_API",
  "FEATURE_WALKIN_LEADS",
  "FEATURE_PROGRAM_WAITLIST",
  "FEATURE_WAITLIST_OFFERS",
  "FEATURE_FORM_STATUS",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FlagSource = "remote" | "env" | "default";

export type FlagDecision = {
  key: FeatureFlagKey;
  enabled: boolean;
  source: FlagSource;
  envEnabled: boolean;
  envSet: boolean;
  remoteValue: boolean | null;
  remoteConfigured: boolean;
};

export type RemoteFlagSnapshot = {
  flags: Partial<Record<FeatureFlagKey, boolean>>;
  fetchedAt: number;
  provider: "posthog" | "none";
  ok: boolean;
  error?: string;
};

export const POSTHOG_FLAGS_KEY_ENV = "POSTHOG_FLAGS_KEY";
export const POSTHOG_FLAGS_HOST_ENV = "POSTHOG_FLAGS_HOST";
export const SERVER_FLAGS_DISTINCT_ID = "kidease-server";
export const REMOTE_FLAGS_TTL_MS = 30_000;
export const REMOTE_FLAGS_TIMEOUT_MS = 1_200;
export const DEFAULT_POSTHOG_FLAGS_HOST = "https://us.i.posthog.com";

/** Defaults when env is unset and PostHog has not returned the key. */
export const FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  FEATURE_INAPP_CHAT: false,
  FEATURE_PUSH: false,
  FEATURE_SMS: false,
  FEATURE_VIDEO: false,
  FEATURE_PROVIDER_SUBSCRIPTIONS: false,
  SHOW_PAY_CTAS: false,
  /** Paid daycare and parent plans. Off during the free founding period. */
  SUBSCRIPTIONS_ENABLED: false,
  /** Founding member badge on claimed listings. The marker stays either way. */
  FOUNDING_BADGE_ENABLED: true,
  FEATURE_OPEN_SPOT_ALERTS: false,
  FEATURE_SPOT_OFFER_MAIL: false,
  FEATURE_OPEN_SPOTS_CHECKIN_MAIL: false,
  FEATURE_OPEN_SPOTS_CHECKIN_SMS: false,
  /** Quebec recognized home daycares. Off until Kyle publishes them. */
  FEATURE_QC_HOME_DAYCARES: false,
  /** Area waitlist email. Off until Kyle approves the wording. */
  FEATURE_AREA_WAITLIST_ALERTS: false,
  /** Browser and server exception capture in PostHog. Off. Bots and WebDriver are filtered. */
  FEATURE_POSTHOG_ERRORS: false,
  /** Email kyle@kidease.ca on error spikes and failed crons. Off. Dry-run until _LIVE. */
  FEATURE_OPS_ALERTS: false,
  /** Better Stack heartbeat after each successful cron. Off. */
  FEATURE_CRON_HEARTBEATS: false,
  /** Bill reminders: 3 days before, due date, 3 and 7 days late. Off. */
  FEATURE_INVOICE_REMINDERS: false,
  /** Follow-ups after a failed payment. Off. Stops when the bill is paid. */
  FEATURE_PAYMENT_DUNNING: false,
  /** Weekly mail for missing listing facts and a missing child profile. Off. */
  FEATURE_MISSING_INFO_REMINDERS: false,
  /** Daycare emails on day 0, 2, and 7 after claim. Off. */
  FEATURE_DAYCARE_ONBOARDING: false,
  /** Claim reminders to unclaimed centres with a public business email. Off. Dry-run until _LIVE. */
  FEATURE_CLAIM_LISTING_REMINDERS: false,
  /** Hide open spots not updated in 30 days, with a reminder at day 21. Off. */
  FEATURE_STALE_OPEN_SPOTS: false,
  /** Email 24 hours after a tour. Off. */
  FEATURE_POST_TOUR_FOLLOWUP: false,
  /** Optional review invite about 30 days after enrolment. Off. No review gating. */
  FEATURE_ENROLMENT_REVIEW: false,
  /** Weekly Neon backup to R2 plus a restore-list check. Off. */
  FEATURE_NEON_BACKUP: false,
  /** Cached public inspection rows on a listing. Off until Kyle turns it on. */
  FEATURE_INSPECTION_HISTORY: false,
  /** Per-province vacancy index, confirm history, and freshness bands. */
  FEATURE_PROVINCIAL_VACANCY_INDEX: false,
  /** Report a published parent review, and show a rating from the first review. */
  FEATURE_REVIEW_REPORTS: false,
  /** No-show stage, reminder moves, and a calendar file in the tour email. */
  FEATURE_TOUR_PIPELINE: false,
  /** Need care fast sorts by open spots, then distance. OpenStreetMap pins only. */
  FEATURE_NEED_CARE_FAST: false,
  /** Diet and extra-support fields on the centre profile. */
  FEATURE_INCLUSIVE_FILTERS: false,
  /** Post, apply, and review ECE applicants. No charge. */
  FEATURE_ECE_JOBS: false,
  /** Door check-in and check-out without a camera. */
  FEATURE_DIGITAL_ATTENDANCE: false,
  /** Staff shifts, ECE certificates, and room ratios. Off until Kyle turns it on. */
  FEATURE_STAFF_SCHEDULING: false,
  /** Private learning stories for enrolled families. Off until Kyle turns it on. */
  FEATURE_LEARNING_PORTFOLIOS: false,
  /** Multi-site occupancy from real capacity and enrolments. Off until Kyle turns it on. */
  FEATURE_ORG_DASHBOARD: false,
  /** Private per-child photos for enrolled parents who consented. */
  FEATURE_PRIVATE_PHOTO_FEED: false,
  /** Government desk. Off hides /gov, /gov/login, and the footer link. */
  FEATURE_GOV_PORTAL: false,
  /** Named product events for PostHog. Off until Kyle turns it on. No personal details in the payload. */
  FEATURE_PRODUCT_EVENTS: false,
  /** Street address matching on Need care fast via OpenStreetMap. Off until Kyle turns it on. */
  FEATURE_NCF_STREET: false,
  /**
   * Need care fast distance uses the listing pin and the parent's point
   * (device location or postal code). Off. Home daycares stay on a coarse pin.
   * Does not turn on FEATURE_NCF_STREET or FEATURE_NEED_CARE_FAST.
   */
  FEATURE_NCF_POINT_DISTANCE: false,
  /** Short-lived private URLs for daily logs and learning stories. Off until Kyle turns it on. */
  FEATURE_PRIVATE_MEDIA: false,
  /** Daycare tablet QR and parent scan check-in. Off until Kyle turns it on. */
  FEATURE_QR_KIOSK: false,
  /** Provincial licensing CSV and PDF exports. Off until Kyle turns it on. */
  FEATURE_PROVINCE_REPORTS: false,
  /** Province-only totals for government accounts. Off until Kyle turns it on. */
  FEATURE_GOV_SCOPES: false,
  /** French (fr-CA) auto-detect and the admin, government, email, and SMS pack. Off until Kyle turns it on. */
  FEATURE_FR_CA: false,
  /** Province learning goals, stories, plans, and coverage. Off until Kyle turns it on. */
  FEATURE_CURRICULUM_PACK: false,
  /** Parents see published stories. Off. Without this, publish is log-only. */
  FEATURE_CURRICULUM_PACK_LIVE: false,
  /** Local open picture books. Off. Does not hotlink book files. */
  FEATURE_STORY_CORNER: false,
  /** Second parent with their own login. Off. In-app invite link only. No email or SMS. */
  FEATURE_COPARENT_LINK: false,
  /** Daycare clock in, clock out, edits, weekly hours, and CSV. Off. Not payroll. */
  FEATURE_STAFF_TIMESHEETS: false,
  /** A centre can reply under a public parent review. Off. No email. */
  FEATURE_REVIEW_REPLIES: false,
  /** Enrolment contract, the sign page, and the signed PDF. Off. No DocuSign call. */
  FEATURE_ENROLMENT_ESIGN: false,
  /** Ontario or federal receipt and Quebec RL-24 from paid invoices. Off. */
  FEATURE_TAX_RECEIPTS: false,
  /** Daily journal plus meal and nap logs. Off. No email. */
  FEATURE_DAILY_LOGS: false,
  /** Tour calendar page and an in-app visit reminder. Off. No email or text. */
  FEATURE_TOUR_CALENDAR: false,
  /** Parent document vault. Off. */
  FEATURE_FAMILY_VAULT: false,
  /** Daycare inbox lists message threads and requests that have no thread yet. Off. */
  FEATURE_UNIFIED_INBOX: false,
  /** In-app voice between a parent and a centre. Off. No call is placed. */
  FEATURE_VOICE: false,
  /** Named pickup people on a child profile. Off. Allergies stay either way. */
  FEATURE_PICKUP_CONTACTS: false,
  /** Parent and centre enrolment agreement. Off. Also needs FEATURE_ENROLMENT_ESIGN. */
  FEATURE_PARENT_AGREEMENT: false,
  /** Rank a waitlist, then offer a spot. Off. No fee. */
  FEATURE_WAITLIST_TOOLS: false,
  /** Post open spots by age group and tell matching families. Off. */
  FEATURE_AGE_OPEN_SPOTS: false,
  /** Timestamped child check-in and check-out. Off. No photo. */
  FEATURE_CHILD_CHECKIN: false,
  /** Airbnb-style daycare listing editor and day calendar. Off. */
  FEATURE_HOST_LISTING: false,
  /** Weekly menu with Canada's Food Guide groups and allergens. Parents see the menu. Off. */
  FEATURE_MEAL_PLANNING: false,
  /** Developmental observations by ELECT domain. Text only, no photos. Parents see their child's notes. Off. */
  FEATURE_DEV_OBSERVATIONS: false,
  /** Staff professional development hours log. Daycare only. Off. */
  FEATURE_STAFF_PD: false,
  /** Maintenance and safety checklists. Daycare only. Off. */
  FEATURE_MAINTENANCE_CHECKLISTS: false,
  /** Cleaning and sanitation checklists. Daycare only. Off. */
  FEATURE_CLEANING_CHECKLISTS: false,
  /** QuickBooks Online import CSV. No QuickBooks connection or credentials. Off. */
  FEATURE_QUICKBOOKS_EXPORT: false,
  /** Tap to Pay scaffold. Never charges a card in this build. Parent sees receipts. Off. */
  FEATURE_TAP_TO_PAY: false,
  /** Bill drafts from attended days. Parent sees the bill. Off. */
  FEATURE_ATTENDANCE_BILLING: false,
  /** Gross pay export CSV from hours. Not a payroll processor. No credentials. Off. */
  FEATURE_PAYROLL: false,
  /** Agency subsidy share vs parent share, plus an agency claim CSV. Parent sees the split. Off. */
  FEATURE_SUBSIDY_BILLING: false,
  /** Queue check-in taps offline and sync with the tap time on reconnect. Needs FEATURE_CHILD_CHECKIN. Off. */
  FEATURE_OFFLINE_CHECKIN: false,
  /** Amazon Device Messaging push for Fire devices (no Google Play services). Off. Needs ADM_CLIENT_ID / ADM_CLIENT_SECRET. */
  FEATURE_AMAZON_ADM: false,
  /** Login with Amazon button, shown only on Fire / Amazon Appstore devices. Off. */
  FEATURE_LOGIN_AMAZON: false,
  /** Landscape daycare check-in kiosk for Fire tablets with a PIN exit. Off. */
  FEATURE_FIRE_KIOSK: false,
  /** Alexa custom skill endpoint /api/alexa. Off. Needs ALEXA_SKILL_ID. */
  FEATURE_ALEXA_SKILL: false,
  /** A daycare cannot approve a request until the child file is complete. Off. */
  FEATURE_CHILD_PORTFOLIO_GATE: false,
  /** Email a co-parent. They must accept. A daycare confirms them before pickup. Off. */
  FEATURE_COPARENT_EMAIL: false,
  /** Drop-off and pick-up reminders. Off. In-app, and phone alerts only when FEATURE_PUSH is already on. No SMS. */
  FEATURE_CARE_REMINDERS: false,
  /** Unified parent, daycare, staff, and desk alerts. Off. Nothing is sent until this is on. */
  FEATURE_UNIFIED_ALERTS: false,
  /** Email and phone push for unified alerts. Off. Also needs FEATURE_UNIFIED_ALERTS. Preview never sends. */
  FEATURE_UNIFIED_ALERTS_LIVE: false,
  /** Daycare Insights tab. Off. Real rows only. No area average under 5 centres. */
  FEATURE_PROVIDER_INSIGHTS: false,
  /** Search ranking v2. Off. Best match stays as it is today. No paid rank. */
  FEATURE_RANKING_V2: false,
  /** KidEase Support thread in Messages. Off. No thread, no email, no text until this is on. */
  FEATURE_SUPPORT_CHAT: false,
  /** Owner text replies into that thread. Off. Also needs FEATURE_SUPPORT_CHAT. */
  FEATURE_SUPPORT_SMS_REPLY: false,
  /** KidEase Top Rated. Off. Not a government rating. */
  FEATURE_TOP_RATED_BADGE: false,
  /** Mobile Where / When / Who search. Off. The current search stays until this is on. */
  FEATURE_MOBILE_SEARCH_V2: false,
  /** Phone shell: edge-to-edge home, menu, and account. Off. Today’s UI stays until this is on. */
  FEATURE_UI_AIRBNB_V1: false,
  /** French password reset, sign-in code, and verify mail for Quebec and French. Off. English mail stays. */
  FEATURE_FR_AUTH_QC: false,
  /** Centre email to families. Off. Nothing is sent. */
  FEATURE_FAMILY_BULK_MAIL: false,
  /** CSV download of centre lists. Off. */
  FEATURE_LIST_CSV: false,
  /** Licence type on public search. Off. Unknown is never guessed. */
  FEATURE_LICENCE_TYPE_FILTER: false,
  /** Search for two or more children. Off. No names are stored. */
  FEATURE_MULTI_CHILD_SEARCH: false,
  /** Open-spot freshness window. Off. No reminder is sent. */
  FEATURE_VACANCY_FRESHNESS: false,
  /** Hide unconfirmed fees. Off. */
  FEATURE_FEE_DISPLAY_GATE: false,
  /** Family pipeline on the daycare desk. Off. No mail, text, or push. */
  FEATURE_CENTRE_LEAD_TRACKER: false,
  /** Per-centre API keys and webhooks. Off. Nothing is exposed until a centre turns a key on. */
  FEATURE_CENTRE_API: false,
  /** Walk-in and phone leads. Off. Consent defaults off. */
  FEATURE_WALKIN_LEADS: false,
  /** Program waitlists and position bands. Off. */
  FEATURE_PROGRAM_WAITLIST: false,
  /** Waitlist offers. Off. No offer email is sent. */
  FEATURE_WAITLIST_OFFERS: false,
  /** Form and packet status board. Off. */
  FEATURE_FORM_STATUS: false,
};

/**
 * BRANDED_EMAILS is env-only. It is not a PostHog product flag and it is not in
 * FEATURE_FLAG_KEYS. Unset or any value other than "1" / "true" keeps today's
 * email bodies. See docs/flags.md. Do not turn this on in production from code.
 */

/** Staff-facing catalog. Names match env / PostHog keys exactly. */
export type FeatureFlagCatalogRow = {
  key: FeatureFlagKey;
  defaultOn: boolean;
  docs: string;
  summary: string;
};

export const FEATURE_FLAG_CATALOG: readonly FeatureFlagCatalogRow[] = [
  {
    key: "FEATURE_INAPP_CHAT",
    defaultOn: false,
    docs: "docs/chat.md",
    summary: "Extra parent/admin chat kinds. Composer stays disabled. Live threads stay on /inbox.",
  },
  {
    key: "FEATURE_PUSH",
    defaultOn: false,
    docs: "docs/push.md",
    summary: "One push path for website (VAPID) and phones (FCM / APNs). Default off. Production stays disarmed without secrets.",
  },
  {
    key: "FEATURE_SMS",
    defaultOn: false,
    docs: "docs/sms.md",
    summary: "Transactional Twilio Programmable SMS (not Verify). Production stays off without secrets.",
  },
  {
    key: "FEATURE_VIDEO",
    defaultOn: false,
    docs: "docs/video.md",
    summary: "Parent Plus Twilio Video. Inbox hidden until SDK is wired. Production stays off without secrets.",
  },
  {
    key: "FEATURE_PROVIDER_SUBSCRIPTIONS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Director Subscription and Promote. Off when unset. Checkout still needs Stripe live keys and SUBSCRIPTIONS_ENABLED.",
  },
  {
    key: "SHOW_PAY_CTAS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Parent and director Upgrade / Subscribe / plan-price chrome. Default off. Stripe code stays. Admin catalog stays. Ignored while SUBSCRIPTIONS_ENABLED is off.",
  },
  {
    key: "SUBSCRIPTIONS_ENABLED",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Paid plans and checkout. Default off: free founding period, no charges, daycare tools unlocked, signed-in parents get Parent Plus tools with no upgrade button. Set 1 to restore the current subscription flow. Env or PostHog. No redeploy when PostHog is already connected.",
  },
  {
    key: "FOUNDING_BADGE_ENABLED",
    defaultOn: true,
    docs: "docs/flags.md",
    summary:
      "Founding member badge. Default on. Turning it off hides the badge. The founding_member marker on the listing stays.",
  },
  {
    key: "FEATURE_OPEN_SPOT_ALERTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Email when a saved search matches a newly posted open spot. Default off. Saving a search still works. Needs CASL.",
  },
  {
    key: "FEATURE_SPOT_OFFER_MAIL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Email when a daycare sends a 48-hour spot offer. Default off. The offer still shows in the parent account.",
  },
  {
    key: "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Weekly open-spots email to claimed daycares. Default off. No send until this is on.",
  },
  {
    key: "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Weekly open-spots SMS. Default off. Also needs FEATURE_SMS and consent. The toll-free sender is approved.",
  },
  {
    key: "FEATURE_QC_HOME_DAYCARES",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Quebec recognized home daycares. Default off. Area only, no street pin, no email or text to those providers.",
  },
  {
    key: "FEATURE_AREA_WAITLIST_ALERTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Email when an area waitlist matches a posted spot. Default off. Kyle approved the wording. In-app notices still save.",
  },
  {
    key: "FEATURE_POSTHOG_ERRORS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "PostHog exception capture on the website and server. Default off. Bots and WebDriver are dropped. Needs _LIVE to send.",
  },
  {
    key: "FEATURE_OPS_ALERTS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email kyle@kidease.ca for a daily digest and an immediate note when a cron fails or errors spike. Default off.",
  },
  {
    key: "FEATURE_CRON_HEARTBEATS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Ping a Better Stack heartbeat after each successful cron. Default off. Unset URL is a no-op.",
  },
  {
    key: "FEATURE_INVOICE_REMINDERS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email a parent 3 days before a bill is due, on the due date, and 3 and 7 days later. Stops when paid. Default off.",
  },
  {
    key: "FEATURE_PAYMENT_DUNNING",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email after a failed payment, then 3 and 7 days later. Stops when paid. Does not replace the Stripe webhook. Default off.",
  },
  {
    key: "FEATURE_MISSING_INFO_REMINDERS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Weekly email listing exactly which licence, photo, fee, hours, contact, or ages are missing. Also a parent missing a child profile. Default off.",
  },
  {
    key: "FEATURE_DAYCARE_ONBOARDING",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Three emails after a centre is claimed: the same day, day 2, and day 7. Default off.",
  },
  {
    key: "FEATURE_CLAIM_LISTING_REMINDERS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email unclaimed centres at their published business address. CASL implied consent, unsubscribe, daily cap. Default off and dry-run until _LIVE.",
  },
  {
    key: "FEATURE_STALE_OPEN_SPOTS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Remind at day 21 and hide open spots that were not updated for 30 days. Default off.",
  },
  {
    key: "FEATURE_POST_TOUR_FOLLOWUP",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "One email about 24 hours after a tour. Default off.",
  },
  {
    key: "FEATURE_ENROLMENT_REVIEW",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "One optional review invite about 30 days after enrolment. Every enrolled parent gets it. No star gate. Default off.",
  },
  {
    key: "FEATURE_NEON_BACKUP",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Weekly pg_dump to R2 and a pg_restore list check. Alerts on failure. Default off.",
  },
  {
    key: "FEATURE_INSPECTION_HISTORY",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Show cached Ontario, British Columbia, and Alberta inspection rows on a listing. Default off. Rows must cite a public government page. KidEase does not invent a violation.",
  },
  {
    key: "FEATURE_PROVINCIAL_VACANCY_INDEX",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Per-province open-spot pages, confirm history, and freshness bands. Default off. The national vacancy index stays either way.",
  },
  {
    key: "FEATURE_REVIEW_REPORTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Report a published parent review, and show a parent rating from the first review. Default off. Three-review summaries stay.",
  },
  {
    key: "FEATURE_TOUR_PIPELINE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Tour no-show, moved reminders, and a calendar file in the booking email. Default off. Booking a tour still works.",
  },
  {
    key: "FEATURE_NEED_CARE_FAST",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Need care fast lists more open spots first, then closer centres. Default off. Closest-first stays. No Google Maps.",
  },
  {
    key: "FEATURE_INCLUSIVE_FILTERS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Halal, kosher, nut-free, vegetarian, and extra support on the centre profile. Default off. Search chips stay.",
  },
  {
    key: "FEATURE_ECE_JOBS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Post an ECE role, apply, and see applicants. Default off. Does not charge and does not turn subscriptions on.",
  },
  {
    key: "FEATURE_DIGITAL_ATTENDANCE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Check-in page records arrival and pickup for an enrolled child. Default off. The old camera preview stays. No photo of a child.",
  },
  {
    key: "FEATURE_STAFF_SCHEDULING",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Staff shifts, ECE certificate expiry reminders, and room ratios on the daycare desk. Default off. Not payroll. Email only, no SMS.",
  },
  {
    key: "FEATURE_LEARNING_PORTFOLIOS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Private learning stories for enrolled parents. Default off. No photos. Not shown on the public listing.",
  },
  {
    key: "FEATURE_ORG_DASHBOARD",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Occupancy across the centres you run. Default off. Uses licensed capacity and enrolled bookings only. Does not invent a number.",
  },
  {
    key: "FEATURE_PRIVATE_PHOTO_FEED",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Classroom photos only for an enrolled parent who consented. Default off. Photos are not public and are not used in marketing.",
  },
  {
    key: "FEATURE_GOV_PORTAL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Government desk. Default off. /gov, /gov/login, and the footer link stay hidden.",
  },
  {
    key: "FEATURE_PRODUCT_EVENTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "PostHog events for signup, search, listing view, waitlist, enrolment, paid invoice, and claim. Default off. Properties stay coarse: no name, email, phone, child, or address.",
  },
  {
    key: "FEATURE_NCF_STREET",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Need care fast can geocode a street address with OpenStreetMap Nominatim and keep centres inside 15 km. Default off. No Google. City search stays the same.",
  },
  {
    key: "FEATURE_NCF_POINT_DISTANCE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Need care fast sorts by distance from a postal code or device location to each listing pin. Default off. Home daycares use a coarse pin. No street address is returned. Does not turn on street search or availability-first sort.",
  },
  {
    key: "FEATURE_PRIVATE_MEDIA",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daily-log and learning-story photos use a short-lived R2 link. Default off. No public photo URL is returned while this is on.",
  },
  {
    key: "FEATURE_QR_KIOSK",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daycare tablet shows a rotating check-in code. A parent scans it to check a child in or out. Default off. Needs KIOSK_TOKEN_SECRET. The code is not a public photo link.",
  },
  {
    key: "FEATURE_PROVINCE_REPORTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "CSV and PDF licensing exports. Manitoba and Ontario use their own columns. Other provinces use a generic file. Default off. Numbers come from saved listings only.",
  },
  {
    key: "FEATURE_GOV_SCOPES",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "A government account sees totals for its province only. Default off. No names, streets, or child details. The account stays signed in.",
  },
  {
    key: "FEATURE_FR_CA",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "French (fr-CA) for parent, daycare, admin, and government screens, plus email and SMS. Auto-detect from the browser or device, and from Quebec or New Brunswick. Default off. A saved language choice still wins. The language toggle stays.",
  },
  {
    key: "FEATURE_CURRICULUM_PACK",
    defaultOn: false,
    docs: "docs/curriculum.md",
    summary:
      "Province goals, learning stories, plans, and coverage for a daycare. Default off. Goal lines are KidEase wording plus a link. No ASQ.",
  },
  {
    key: "FEATURE_CURRICULUM_PACK_LIVE",
    defaultOn: false,
    docs: "docs/curriculum.md",
    summary:
      "Parents can read a published story and reply. Default off. While off, publish is only written to the log.",
  },
  {
    key: "FEATURE_STORY_CORNER",
    defaultOn: false,
    docs: "docs/curriculum.md",
    summary:
      "Picture books stored on this server from the Global Digital Library. Default off. Skips NC and ND. StoryWeaver stays off until a token exists. Unite for Literacy is a link out.",
  },
  {
    key: "FEATURE_COPARENT_LINK",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "A main parent invites one other parent with an in-app link. They share children, tours, waitlists, messages, and bills. Default off. No email or SMS. Access is full or view only, and the main parent can remove them.",
  },
  {
    key: "FEATURE_STAFF_TIMESHEETS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daycare desk clock in, clock out, edits with a note, weekly hours, and a CSV download. Default off. The week starts Monday. KidEase does not pay wages. No email or SMS.",
  },
  {
    key: "FEATURE_REVIEW_REPLIES",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "A centre writes a public reply under a parent review. Default off. The parent gets an in-app notice. No email.",
  },
  {
    key: "FEATURE_ENROLMENT_ESIGN",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Enrolment e-sign, /sign/$id, and the signed PDF. Default off. DocuSign is not called.",
  },
  {
    key: "FEATURE_TAX_RECEIPTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Ontario and federal child care PDF, plus a Quebec RL-24 PDF. The total is paid invoices for that year. Default off. No invented fee. No email.",
  },
  {
    key: "FEATURE_DAILY_LOGS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Daily journal, meals, and naps for an enrolled child. Default off. The note stays in the account. No email.",
  },
  {
    key: "FEATURE_TOUR_CALENDAR",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Tour calendar and an in-app reminder. Default off. No email, text, or push.",
  },
  {
    key: "FEATURE_FAMILY_VAULT",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Parent page for immunization records and subsidy forms. Default off. A centre sees a file only after the parent shares it.",
  },
  {
    key: "FEATURE_UNIFIED_INBOX",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Daycare messages include requests and visits that do not have a thread yet. Default off. The current inbox stays.",
  },
  {
    key: "FEATURE_VOICE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "In-app call on a message thread. Default off. No call is dialled. Phone numbers stay hidden.",
  },
  {
    key: "FEATURE_PICKUP_CONTACTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Name, phone, and relationship for people who can pick a child up. Default off. Allergies stay on the profile.",
  },
  {
    key: "FEATURE_PARENT_AGREEMENT",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Parent and centre enrolment agreement. Default off. Also needs FEATURE_ENROLMENT_ESIGN. DocuSign sends only when the director clicks. The fee stays inside the agreement.",
  },
  {
    key: "FEATURE_WAITLIST_TOOLS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daycare ranks a waitlist and the parent sees that place. Default off. Offer, accept, and decline stay. No waitlist fee.",
  },
  {
    key: "FEATURE_AGE_OPEN_SPOTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daycare posts open spots by age group. Matching saved and waitlisted parents are told through the existing mail and push path. Default off. No checkout.",
  },
  {
    key: "FEATURE_CHILD_CHECKIN",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daycare desk records child arrival and pickup with a time. Uses pickup people when the parent already listed them. Parent sees the history. Default off. No photo.",
  },
  {
    key: "FEATURE_HOST_LISTING",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Daycare desk splits into today, a listing editor, and a month calendar. Default off. The current desk stays. Today's saved spots update the public listing.",
  },
  {
    key: "FEATURE_MEAL_PLANNING",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Weekly menu with Canada's Food Guide groups and allergens. Parents see the menu.",
  },
  {
    key: "FEATURE_DEV_OBSERVATIONS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Developmental observations by ELECT domain. Text only, no photos. Parents see their child's notes.",
  },
  {
    key: "FEATURE_STAFF_PD",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Staff professional development hours log. Daycare only.",
  },
  {
    key: "FEATURE_MAINTENANCE_CHECKLISTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Maintenance and safety checklists. Daycare only.",
  },
  {
    key: "FEATURE_CLEANING_CHECKLISTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Cleaning and sanitation checklists. Daycare only.",
  },
  {
    key: "FEATURE_QUICKBOOKS_EXPORT",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "QuickBooks Online import CSV. No QuickBooks connection or credentials.",
  },
  {
    key: "FEATURE_TAP_TO_PAY",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Tap to Pay scaffold. Never charges a card in this build. Parent sees receipts.",
  },
  {
    key: "FEATURE_ATTENDANCE_BILLING",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Bill drafts from attended days. Parent sees the bill.",
  },
  {
    key: "FEATURE_PAYROLL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Gross pay export CSV from hours. Not a payroll processor. No credentials.",
  },
  {
    key: "FEATURE_SUBSIDY_BILLING",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Agency subsidy share vs parent share, plus an agency claim CSV. Parent sees the split.",
  },
  {
    key: "FEATURE_OFFLINE_CHECKIN",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Queue check-in taps offline and sync with the tap time on reconnect. Needs FEATURE_CHILD_CHECKIN.",
  },
  {
    key: "FEATURE_AMAZON_ADM",
    defaultOn: false,
    docs: "docs/amazon.md",
    summary: "Amazon Device Messaging push on Fire devices, next to FCM / APNs. Needs FEATURE_PUSH and ADM keys.",
  },
  {
    key: "FEATURE_LOGIN_AMAZON",
    defaultOn: false,
    docs: "docs/amazon.md",
    summary: "Login with Amazon button on Fire / Amazon Appstore devices only. Apple, Google, Facebook order is unchanged.",
  },
  {
    key: "FEATURE_FIRE_KIOSK",
    defaultOn: false,
    docs: "docs/amazon.md",
    summary: "Landscape check-in kiosk at /kiosk for Fire tablets. Big buttons, PIN to exit. Needs FEATURE_CHILD_CHECKIN.",
  },
  {
    key: "FEATURE_ALEXA_SKILL",
    defaultOn: false,
    docs: "docs/amazon.md",
    summary: "Alexa custom skill at /api/alexa with request signature checks. Open spots, linked parent day log, daycare messages.",
  },
  {
    key: "FEATURE_CHILD_PORTFOLIO_GATE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "A daycare cannot approve a request until the child file has a name, birthdate, health note, emergency contact, pickup person, and immunization status. Some provinces also ask for a doctor or home address. Off. The file is shared only with a daycare the family has asked or enrolled with.",
  },
  {
    key: "FEATURE_COPARENT_EMAIL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Email invite for one other parent. They accept with their own login. A daycare confirms them before pickup or the child file. Custody limits stay with that daycare. Off. No email in preview or tests.",
  },
  {
    key: "FEATURE_CARE_REMINDERS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "A parent sets drop-off and pick-up times for each child. Each login has its own reminders. In-app notice, and a phone alert only when FEATURE_PUSH is already on. No SMS. Off.",
  },
  {
    key: "FEATURE_UNIFIED_ALERTS",
    defaultOn: false,
    docs: "docs/unified-alerts.md",
    summary: "One alert list for parents, daycares, staff, and the web desk. Off. Choices can be saved. Nothing is sent.",
  },
  {
    key: "FEATURE_UNIFIED_ALERTS_LIVE",
    defaultOn: false,
    docs: "docs/unified-alerts.md",
    summary: "Email and existing phone push for unified alerts. Off. Needs FEATURE_UNIFIED_ALERTS. Preview and tests never send. No texts. Does not turn on call push.",
  },
  {
    key: "FEATURE_PROVIDER_INSIGHTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Insights on the daycare desk: views, saves, requests, reply time, waitlist, enrolment, tours, attendance, staff, and reviews. Default off. Area averages stay hidden under 5 centres. No invented numbers.",
  },
  {
    key: "FEATURE_RANKING_V2",
    defaultOn: false,
    docs: "docs/ranking-v2-gap-report.md",
    summary: "Search ranking v2. Off. Best match stays as it is today. No paid rank and no new Google calls.",
  },
  {
    key: "FEATURE_SUPPORT_CHAT",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "KidEase Support in Messages for parents and daycares, plus a staff inbox. Off. No message is sent.",
  },
  {
    key: "FEATURE_SUPPORT_SMS_REPLY",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Owner text replies land in the support thread. Off. Needs FEATURE_SUPPORT_CHAT. A bad signature is rejected.",
  },
  {
    key: "FEATURE_TOP_RATED_BADGE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "KidEase Top Rated mark on listings and a status page for the daycare. Off. Not a government rating.",
  },
  {
    key: "FEATURE_MOBILE_SEARCH_V2",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Mobile Home search: Where, When, and Who. Off. Desktop and the current search stay as they are. No paid place lookup.",
  },
  {
    key: "FEATURE_UI_AIRBNB_V1",
    defaultOn: false,
    docs: "docs/ui-airbnb-v1/README.md",
    summary:
      "Phone shell modelled on a calm full-screen app. Off. Desktop, admin, and gov stay as they are. No paid placement and no new search API.",
  },
  {
    key: "FEATURE_FR_AUTH_QC",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "French password reset, sign-in code, and verify-email for people in Quebec or using French. Off. English mail subjects stay as they are.",
  },
  {
    key: "FEATURE_FAMILY_BULK_MAIL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "A centre email to families, in English or French, with delivery notes. Off. No message is sent. The sender stays on kidease.ca.",
  },
  {
    key: "FEATURE_LIST_CSV",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Download a list as a CSV file. Off. Health columns stay hidden without document access.",
  },
  {
    key: "FEATURE_LICENCE_TYPE_FILTER",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Filter search by stored licence type. Off. Unknown stays its own group and is never guessed.",
  },
  {
    key: "FEATURE_MULTI_CHILD_SEARCH",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Search once for more than one child. Off. Ages are not saved. No ranking boost for a sibling discount.",
  },
  {
    key: "FEATURE_VACANCY_FRESHNESS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Hide an open-spot badge after the centre's freshness window. Off. No reminder email is sent.",
  },
  {
    key: "FEATURE_FEE_DISPLAY_GATE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Hide fees that the centre or an official source has not confirmed. Off. Scraped fees stay hidden.",
  },
  {
    key: "FEATURE_CENTRE_LEAD_TRACKER",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Family steps on the daycare desk, from inquiry to enrolled. Off. Uses messages, tours, waitlists, and enrolments the family already shared. No mail, text, or push.",
  },
  {
    key: "FEATURE_CENTRE_API",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "A centre key for its own families. Off. Keys are hashed, child health stays out, and webhooks stay off until the centre turns them on.",
  },
  {
    key: "FEATURE_WALKIN_LEADS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Record a walk-in or phone lead. Off. Consent to be contacted defaults off. No email is sent.",
  },
  {
    key: "FEATURE_PROGRAM_WAITLIST",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Waitlists per age group with a position band, not an exact place. Off. Parents see only their own rows.",
  },
  {
    key: "FEATURE_WAITLIST_OFFERS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Offer a waitlist spot with a deadline. Off. Two accepts cannot take the last spot. No email is sent.",
  },
  {
    key: "FEATURE_FORM_STATUS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Status of forms and packets from events. Off. A rejection is held, not emailed.",
  },
];

let cache: RemoteFlagSnapshot | null = null;
let inflight: Promise<RemoteFlagSnapshot> | null = null;

export function envMap(env?: EnvMap): EnvMap {
  if (env) return env;
  if (typeof process !== "undefined" && process.env) return process.env;
  return {};
}

export function envFlagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function envFlagSet(raw: string | undefined | null): boolean {
  return raw != null && String(raw).trim() !== "";
}

export function remoteFlagsKey(env?: EnvMap): string {
  return String(envMap(env)[POSTHOG_FLAGS_KEY_ENV] || "").trim();
}

export function remoteFlagsConfigured(env?: EnvMap): boolean {
  return Boolean(remoteFlagsKey(env));
}

export function flagsHost(env?: EnvMap): string {
  const mapped = envMap(env);
  const host = String(mapped[POSTHOG_FLAGS_HOST_ENV] || mapped.POSTHOG_HOST || DEFAULT_POSTHOG_FLAGS_HOST)
    .trim()
    .replace(/\/$/, "");
  return host || DEFAULT_POSTHOG_FLAGS_HOST;
}

export function parseRemoteFlagValue(raw: unknown): boolean | undefined {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v || v === "false" || v === "0" || v === "off" || v === "no") return false;
  if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
  // Multivariate variant name means the flag is on for this distinct id.
  return true;
}

/**
 * Merge policy: a boolean from PostHog wins when that key was returned.
 * Missing remote key / no provider / fetch failure → env, then FLAG_DEFAULTS.
 */
export function resolveFlag(input: {
  envRaw: string | undefined | null;
  remoteValue?: boolean | null;
  defaultWhenUnset?: boolean;
}): { enabled: boolean; source: FlagSource } {
  if (input.remoteValue === true || input.remoteValue === false) {
    return { enabled: input.remoteValue, source: "remote" };
  }
  if (envFlagSet(input.envRaw)) {
    return { enabled: envFlagOn(input.envRaw), source: "env" };
  }
  return { enabled: input.defaultWhenUnset ?? false, source: "default" };
}

function isProcessEnv(env?: EnvMap): boolean {
  return !env || (typeof process !== "undefined" && env === process.env);
}

export function peekRemoteFlag(key: FeatureFlagKey): boolean | undefined {
  if (!cache || !Object.prototype.hasOwnProperty.call(cache.flags, key)) return undefined;
  return cache.flags[key];
}

export function peekRemoteSnapshot(): RemoteFlagSnapshot | null {
  return cache;
}

export function describeFeatureFlag(
  key: FeatureFlagKey,
  env?: EnvMap,
  options?: { remote?: Partial<Record<string, boolean>> | null },
): FlagDecision {
  const mapped = envMap(env);
  const envRaw = mapped[key];
  const useCache = options?.remote === undefined && isProcessEnv(env);
  if (useCache) scheduleRemoteRefresh();
  const remoteMap = options?.remote !== undefined ? options.remote : useCache ? (cache?.flags ?? null) : null;
  const remoteValue =
    remoteMap && Object.prototype.hasOwnProperty.call(remoteMap, key) ? remoteMap[key] : null;
  const resolved = resolveFlag({
    envRaw,
    remoteValue: typeof remoteValue === "boolean" ? remoteValue : null,
    defaultWhenUnset: FLAG_DEFAULTS[key],
  });
  return {
    key,
    enabled: resolved.enabled,
    source: resolved.source,
    envEnabled: envFlagSet(envRaw) ? envFlagOn(envRaw) : FLAG_DEFAULTS[key],
    envSet: envFlagSet(envRaw),
    remoteValue: typeof remoteValue === "boolean" ? remoteValue : null,
    remoteConfigured: remoteFlagsConfigured(mapped),
  };
}

export function evaluateFeatureFlag(
  key: FeatureFlagKey,
  env?: EnvMap,
  options?: { remote?: Partial<Record<string, boolean>> | null },
): boolean {
  return describeFeatureFlag(key, env, options).enabled;
}

export function listFeatureFlagDecisions(env?: EnvMap): FlagDecision[] {
  return FEATURE_FLAG_KEYS.map((key) => describeFeatureFlag(key, env));
}

export function parsePostHogFlagsResponse(body: unknown): Partial<Record<FeatureFlagKey, boolean>> {
  const out: Partial<Record<FeatureFlagKey, boolean>> = {};
  if (!body || typeof body !== "object") return out;
  const rec = body as Record<string, unknown>;
  const flags = rec.featureFlags ?? rec.flags;
  if (!flags || typeof flags !== "object") return out;
  const map = flags as Record<string, unknown>;
  for (const key of FEATURE_FLAG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const parsed = parseRemoteFlagValue(map[key]);
    if (typeof parsed === "boolean") out[key] = parsed;
  }
  return out;
}

export async function fetchPostHogFlags(input: {
  apiKey: string;
  host?: string;
  distinctId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Partial<Record<FeatureFlagKey, boolean>>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const host = (input.host || DEFAULT_POSTHOG_FLAGS_HOST).replace(/\/$/, "");
  const timeoutMs = input.timeoutMs ?? REMOTE_FLAGS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${host}/flags?v=2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: input.apiKey,
        distinct_id: input.distinctId || SERVER_FLAGS_DISTINCT_ID,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`PostHog flags HTTP ${res.status}`);
    }
    return parsePostHogFlagsResponse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshRemoteFlags(
  env?: EnvMap,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteFlagSnapshot> {
  const mapped = envMap(env);
  const key = remoteFlagsKey(mapped);
  if (!key) {
    const snap: RemoteFlagSnapshot = {
      flags: {},
      fetchedAt: Date.now(),
      provider: "none",
      ok: true,
    };
    if (isProcessEnv(env)) cache = snap;
    return snap;
  }
  try {
    const flags = await fetchPostHogFlags({
      apiKey: key,
      host: flagsHost(mapped),
      fetchImpl,
    });
    const snap: RemoteFlagSnapshot = {
      flags,
      fetchedAt: Date.now(),
      provider: "posthog",
      ok: true,
    };
    if (isProcessEnv(env)) cache = snap;
    return snap;
  } catch (err) {
    return {
      flags: cache?.flags ?? {},
      fetchedAt: cache?.fetchedAt ?? 0,
      provider: "posthog",
      ok: false,
      error: err instanceof Error ? err.message : "flags fetch failed",
    };
  }
}

function scheduleRemoteRefresh(): void {
  if (typeof process === "undefined" || !process.env) return;
  if (!remoteFlagsKey(process.env)) return;
  if (cache && cache.ok && Date.now() - cache.fetchedAt < REMOTE_FLAGS_TTL_MS) return;
  if (inflight) return;
  inflight = refreshRemoteFlags(process.env).finally(() => {
    inflight = null;
  });
}

/** Test-only: drop the in-process overlay so cases stay isolated. */
export function resetRemoteFlagsForTests(): void {
  cache = null;
  inflight = null;
}

/** Test-only: seed the process.env overlay. */
export function setRemoteFlagCacheForTests(flags: Partial<Record<FeatureFlagKey, boolean>> | null): void {
  if (flags == null) {
    cache = null;
    return;
  }
  cache = { flags, fetchedAt: Date.now(), provider: "posthog", ok: true };
}
