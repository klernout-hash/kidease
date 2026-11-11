import { FEATURE_SWITCHES } from "./admin-features.ts";
import { FEATURE_FLAG_CATALOG, FEATURE_FLAG_KEYS, FLAG_DEFAULTS, type FeatureFlagKey } from "./flags.ts";
import { evaluateSameSiteRequest } from "./access-control.ts";

export type FeatureCategory = "parent" | "daycare" | "admin" | "government" | "shared";
export type FeatureAudience = "parent" | "daycare" | "admin" | "government";

const CATEGORY: Record<FeatureFlagKey, FeatureCategory> = {
  FEATURE_INAPP_CHAT: "shared",
  FEATURE_PUSH: "shared",
  FEATURE_SMS: "shared",
  FEATURE_VIDEO: "shared",
  FEATURE_PROVIDER_SUBSCRIPTIONS: "daycare",
  SHOW_PAY_CTAS: "shared",
  SUBSCRIPTIONS_ENABLED: "shared",
  FOUNDING_BADGE_ENABLED: "shared",
  FEATURE_OPEN_SPOT_ALERTS: "parent",
  FEATURE_SPOT_OFFER_MAIL: "daycare",
  FEATURE_OPEN_SPOTS_CHECKIN_MAIL: "parent",
  FEATURE_OPEN_SPOTS_CHECKIN_SMS: "parent",
  FEATURE_QC_HOME_DAYCARES: "shared",
  FEATURE_AREA_WAITLIST_ALERTS: "parent",
  FEATURE_POSTHOG_ERRORS: "admin",
  FEATURE_OPS_ALERTS: "admin",
  FEATURE_CRON_HEARTBEATS: "admin",
  FEATURE_INVOICE_REMINDERS: "shared",
  FEATURE_PAYMENT_DUNNING: "shared",
  FEATURE_MISSING_INFO_REMINDERS: "shared",
  FEATURE_DAYCARE_ONBOARDING: "daycare",
  FEATURE_CLAIM_LISTING_REMINDERS: "daycare",
  FEATURE_STALE_OPEN_SPOTS: "daycare",
  FEATURE_POST_TOUR_FOLLOWUP: "parent",
  FEATURE_ENROLMENT_REVIEW: "parent",
  FEATURE_NEON_BACKUP: "admin",
  FEATURE_INSPECTION_HISTORY: "shared",
  FEATURE_PROVINCIAL_VACANCY_INDEX: "shared",
  FEATURE_REVIEW_REPORTS: "shared",
  FEATURE_TOUR_PIPELINE: "daycare",
  FEATURE_NEED_CARE_FAST: "parent",
  FEATURE_INCLUSIVE_FILTERS: "shared",
  FEATURE_ECE_JOBS: "shared",
  FEATURE_DIGITAL_ATTENDANCE: "daycare",
  FEATURE_STAFF_SCHEDULING: "daycare",
  FEATURE_LEARNING_PORTFOLIOS: "shared",
  FEATURE_ORG_DASHBOARD: "daycare",
  FEATURE_PRIVATE_PHOTO_FEED: "shared",
  FEATURE_GOV_PORTAL: "government",
  FEATURE_PRODUCT_EVENTS: "admin",
  FEATURE_NCF_STREET: "parent",
  FEATURE_NCF_POINT_DISTANCE: "parent",
  FEATURE_PRIVATE_MEDIA: "daycare",
  FEATURE_QR_KIOSK: "daycare",
  FEATURE_PROVINCE_REPORTS: "government",
  FEATURE_GOV_SCOPES: "government",
  FEATURE_FR_CA: "shared",
  FEATURE_CURRICULUM_PACK: "daycare",
  FEATURE_CURRICULUM_PACK_LIVE: "parent",
  FEATURE_STORY_CORNER: "parent",
  FEATURE_COPARENT_LINK: "parent",
  FEATURE_STAFF_TIMESHEETS: "daycare",
  FEATURE_REVIEW_REPLIES: "daycare",
  FEATURE_ENROLMENT_ESIGN: "daycare",
  FEATURE_TAX_RECEIPTS: "parent",
  FEATURE_DAILY_LOGS: "shared",
  FEATURE_TOUR_CALENDAR: "shared",
  FEATURE_FAMILY_VAULT: "parent",
  FEATURE_UNIFIED_INBOX: "daycare",
  FEATURE_VOICE: "shared",
  FEATURE_PICKUP_CONTACTS: "parent",
  FEATURE_PARENT_AGREEMENT: "shared",
  FEATURE_WAITLIST_TOOLS: "shared",
  FEATURE_AGE_OPEN_SPOTS: "daycare",
  FEATURE_CHILD_CHECKIN: "daycare",
  FEATURE_HOST_LISTING: "daycare",
  FEATURE_MEAL_PLANNING: "shared",
  FEATURE_DEV_OBSERVATIONS: "shared",
  FEATURE_STAFF_PD: "daycare",
  FEATURE_MAINTENANCE_CHECKLISTS: "daycare",
  FEATURE_CLEANING_CHECKLISTS: "daycare",
  FEATURE_QUICKBOOKS_EXPORT: "daycare",
  FEATURE_TAP_TO_PAY: "shared",
  FEATURE_ATTENDANCE_BILLING: "shared",
  FEATURE_PAYROLL: "daycare",
  FEATURE_SUBSIDY_BILLING: "shared",
  FEATURE_OFFLINE_CHECKIN: "daycare",
  FEATURE_AMAZON_ADM: "shared",
  FEATURE_LOGIN_AMAZON: "shared",
  FEATURE_FIRE_KIOSK: "daycare",
  FEATURE_ALEXA_SKILL: "parent",
  FEATURE_CHILD_PORTFOLIO_GATE: "daycare",
  FEATURE_COPARENT_EMAIL: "parent",
  FEATURE_CARE_REMINDERS: "parent",
  FEATURE_UNIFIED_ALERTS: "shared",
  FEATURE_UNIFIED_ALERTS_LIVE: "shared",
  FEATURE_PROVIDER_INSIGHTS: "daycare",
  FEATURE_RANKING_V2: "parent",
  FEATURE_SUPPORT_CHAT: "shared",
  FEATURE_SUPPORT_SMS_REPLY: "admin",
  FEATURE_TOP_RATED_BADGE: "shared",
  FEATURE_MOBILE_SEARCH_V2: "parent",
  FEATURE_UI_AIRBNB_V1: "shared",
  FEATURE_FR_AUTH_QC: "shared",
  FEATURE_FAMILY_BULK_MAIL: "daycare",
  FEATURE_LIST_CSV: "daycare",
  FEATURE_LICENCE_TYPE_FILTER: "parent",
  FEATURE_MULTI_CHILD_SEARCH: "parent",
  FEATURE_VACANCY_FRESHNESS: "daycare",
  FEATURE_FEE_DISPLAY_GATE: "shared",
  FEATURE_CENTRE_LEAD_TRACKER: "daycare",
  FEATURE_CENTRE_API: "daycare",
  FEATURE_CUSTODY_ORDERS: "daycare",
  FEATURE_OPERATOR_PACKS: "daycare",
  FEATURE_EXTRA_DAYS: "shared",
  FEATURE_THIRD_PARTY_PAYER: "shared",
};

const SWITCH_CATEGORY: Record<string, FeatureCategory> = {
  "smart-match": "parent",
  "ai-listing-writer": "daycare",
  "ranking-best-match": "parent",
  "ai-photo-check": "daycare",
  "spot-alerts": "parent",
  "ai-reply-drafts": "daycare",
  "parent-helper": "parent",
  "ai-translate": "shared",
  "ai-review-summary": "parent",
  "ai-truth-checker": "admin",
  "ai-licence-reader": "admin",
  "ai-spam-filter": "admin",
  "ai-support-triage": "admin",
  "ai-demand-map": "admin",
};

/** Real code dependencies. Flipping one does not turn the others on. */
export const FLAG_DEPENDENCIES: Record<string, readonly string[]> = {
  FEATURE_PARENT_AGREEMENT: ["FEATURE_ENROLMENT_ESIGN"],
  FEATURE_SUPPORT_SMS_REPLY: ["FEATURE_SUPPORT_CHAT"],
  FEATURE_UNIFIED_ALERTS_LIVE: ["FEATURE_UNIFIED_ALERTS"],
  FEATURE_OFFLINE_CHECKIN: ["FEATURE_CHILD_CHECKIN"],
  FEATURE_FIRE_KIOSK: ["FEATURE_CHILD_CHECKIN"],
  FEATURE_CARE_REMINDERS: ["FEATURE_PUSH"],
  FEATURE_OPEN_SPOTS_CHECKIN_SMS: ["FEATURE_SMS"],
  FEATURE_CENTRE_API: ["FEATURE_CENTRE_LEAD_TRACKER"],
  FEATURE_AMAZON_ADM: ["FEATURE_PUSH"],
};

const SENSITIVE = new Set<string>([
  "SHOW_PAY_CTAS",
  "SUBSCRIPTIONS_ENABLED",
  "FEATURE_PROVIDER_SUBSCRIPTIONS",
  "FEATURE_TAP_TO_PAY",
  "FEATURE_ATTENDANCE_BILLING",
  "FEATURE_PAYMENT_DUNNING",
  "FEATURE_INVOICE_REMINDERS",
  "FEATURE_SUBSIDY_BILLING",
  "FEATURE_PAYROLL",
  "FEATURE_PUSH",
  "FEATURE_SMS",
  "FEATURE_OPEN_SPOT_ALERTS",
  "FEATURE_SPOT_OFFER_MAIL",
  "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
  "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
  "FEATURE_AREA_WAITLIST_ALERTS",
  "FEATURE_UNIFIED_ALERTS",
  "FEATURE_UNIFIED_ALERTS_LIVE",
  "FEATURE_CARE_REMINDERS",
  "FEATURE_SUPPORT_SMS_REPLY",
  "FEATURE_SUPPORT_CHAT",
  "FEATURE_CLAIM_LISTING_REMINDERS",
  "FEATURE_POST_TOUR_FOLLOWUP",
  "FEATURE_MISSING_INFO_REMINDERS",
  "FEATURE_DAYCARE_ONBOARDING",
  "FEATURE_OPS_ALERTS",
  "FEATURE_CHILD_CHECKIN",
  "FEATURE_DIGITAL_ATTENDANCE",
  "FEATURE_OFFLINE_CHECKIN",
  "FEATURE_QR_KIOSK",
  "FEATURE_FIRE_KIOSK",
  "FEATURE_GOV_PORTAL",
  "FEATURE_GOV_SCOPES",
  "FEATURE_PROVINCE_REPORTS",
  "FEATURE_LOGIN_AMAZON",
  "FEATURE_FR_AUTH_QC",
  "FEATURE_RANKING_V2",
  "spot-alerts",
  "ranking-best-match",
]);

const AUDIENCE: Record<FeatureCategory, FeatureAudience[]> = {
  parent: ["parent"],
  daycare: ["daycare"],
  admin: ["admin"],
  government: ["government"],
  shared: ["parent", "daycare", "admin", "government"],
};

export type ControlKind = "product-flag" | "posthog-switch";

export type RegistryRow = {
  id: string;
  key: string;
  kind: ControlKind;
  name: string;
  purpose: string;
  category: FeatureCategory;
  roles: FeatureAudience[];
  writable: boolean;
  sensitive: boolean;
  codeDefault: boolean | null;
  dependencies: readonly string[];
  control: "deployment-configuration-required" | "posthog-rollout";
};

function purposeOf(key: string): string {
  return FEATURE_FLAG_CATALOG.find((row) => row.key === key)?.summary || key;
}

export function productFlagRows(): RegistryRow[] {
  return FEATURE_FLAG_KEYS.map((key) => ({
    id: `flag:${key}`,
    key,
    kind: "product-flag" as const,
    name: purposeOf(key),
    purpose: purposeOf(key),
    category: CATEGORY[key],
    roles: AUDIENCE[CATEGORY[key]],
    writable: false,
    sensitive: SENSITIVE.has(key),
    codeDefault: FLAG_DEFAULTS[key],
    dependencies: FLAG_DEPENDENCIES[key] ?? [],
    control: "deployment-configuration-required" as const,
  }));
}

export function switchRows(): RegistryRow[] {
  return FEATURE_SWITCHES.map((row) => ({
    id: `switch:${row.key}`,
    key: row.key,
    kind: "posthog-switch" as const,
    name: row.name,
    purpose: row.description,
    category: SWITCH_CATEGORY[row.key] ?? "shared",
    roles: AUDIENCE[SWITCH_CATEGORY[row.key] ?? "shared"],
    writable: true,
    sensitive: SENSITIVE.has(row.key),
    codeDefault: null,
    dependencies: [],
    control: "posthog-rollout" as const,
  }));
}

export function featureControlRegistry(): RegistryRow[] {
  return [...productFlagRows(), ...switchRows()];
}

export function isSensitiveControl(key: string): boolean {
  return SENSITIVE.has(key);
}

export function canManageFeatureControls(role: string | null | undefined): boolean {
  return role === "admin";
}

export function validateControlReason(reason: string, sensitive: boolean): { ok: true; reason: string } | { ok: false; error: string } {
  const text = reason.replace(/\s+/g, " ").trim().slice(0, 200);
  if (sensitive && text.length < 8) return { ok: false, error: "Add a short reason." };
  return { ok: true, reason: text };
}

export function validateRequestId(requestId: string): boolean {
  return /^[A-Za-z0-9_-]{8,80}$/.test(requestId);
}

export function dependencyNote(key: string): string | null {
  const needs = FLAG_DEPENDENCIES[key];
  if (!needs?.length) return null;
  return `Also needs ${needs.join(", ")}. Turning this on does not turn those on.`;
}

export function paymentHoldNote(key: string): string | null {
  if (!SENSITIVE.has(key)) return null;
  if (!/PAY|SUBSCRIPTION|DUNNING|INVOICE|TAP_TO_PAY|BILLING|PAYROLL/.test(key) && key !== "SHOW_PAY_CTAS") return null;
  return "This does not start payments, penalties, or cancellation fees.";
}

export type Observed = "on" | "off" | "partial" | "unverified";

export type ControlReading = {
  effective: Observed;
  effectiveSource: "remote" | "env" | "code-default" | "unverified";
  savedControl: "on" | "off" | "unset" | "unverified";
  rolloutPercent: number | null;
  codeDefault: boolean | null;
  error: string | null;
  deploymentConfigurationRequired: boolean;
};

export function presentProductFlag(input: {
  envSet: boolean;
  envOn: boolean | null;
  remoteConfigured: boolean;
  remote: boolean | "missing" | "unverified";
  codeDefault: boolean;
  error?: string | null;
}): ControlReading {
  if (input.error) {
    return {
      effective: "unverified",
      effectiveSource: "unverified",
      savedControl: "unverified",
      rolloutPercent: null,
      codeDefault: input.codeDefault,
      error: input.error,
      deploymentConfigurationRequired: true,
    };
  }
  if (input.remote === "unverified") {
    return {
      effective: "unverified",
      effectiveSource: "unverified",
      savedControl: input.envSet ? (input.envOn ? "on" : "off") : "unset",
      rolloutPercent: null,
      codeDefault: input.codeDefault,
      error: null,
      deploymentConfigurationRequired: true,
    };
  }
  if (input.remote === true || input.remote === false) {
    return {
      effective: input.remote ? "on" : "off",
      effectiveSource: "remote",
      savedControl: input.envSet ? (input.envOn ? "on" : "off") : "unset",
      rolloutPercent: null,
      codeDefault: input.codeDefault,
      error: null,
      deploymentConfigurationRequired: true,
    };
  }
  if (input.envSet) {
    return {
      effective: input.envOn ? "on" : "off",
      effectiveSource: "env",
      savedControl: input.envOn ? "on" : "off",
      rolloutPercent: null,
      codeDefault: input.codeDefault,
      error: null,
      deploymentConfigurationRequired: true,
    };
  }
  return {
    effective: "unverified",
    effectiveSource: "code-default",
    savedControl: "unset",
    rolloutPercent: null,
    codeDefault: input.codeDefault,
    error: null,
    deploymentConfigurationRequired: true,
  };
}

export function presentSwitch(input: {
  known: boolean;
  error?: string | null;
  inPostHog: boolean;
  active: boolean;
  rollout: number;
}): ControlReading {
  if (!input.known || input.error) {
    return {
      effective: "unverified",
      effectiveSource: "unverified",
      savedControl: "unverified",
      rolloutPercent: null,
      codeDefault: null,
      error: input.error || null,
      deploymentConfigurationRequired: false,
    };
  }
  if (!input.inPostHog) {
    return {
      effective: "unverified",
      effectiveSource: "unverified",
      savedControl: "unverified",
      rolloutPercent: null,
      codeDefault: null,
      error: null,
      deploymentConfigurationRequired: false,
    };
  }
  if (!input.active || input.rollout <= 0) {
    return {
      effective: "off",
      effectiveSource: "remote",
      savedControl: "off",
      rolloutPercent: 0,
      codeDefault: null,
      error: null,
      deploymentConfigurationRequired: false,
    };
  }
  if (input.rollout >= 100) {
    return {
      effective: "on",
      effectiveSource: "remote",
      savedControl: "on",
      rolloutPercent: 100,
      codeDefault: null,
      error: null,
      deploymentConfigurationRequired: false,
    };
  }
  return {
    effective: "partial",
    effectiveSource: "remote",
    savedControl: "on",
    rolloutPercent: input.rollout,
    codeDefault: null,
    error: null,
    deploymentConfigurationRequired: false,
  };
}

export function sameSiteAllowsWrite(headers: { secFetchSite?: string | null; method?: string | null }): boolean {
  return evaluateSameSiteRequest({ ...headers, secFetchMode: "cors", secFetchDest: "empty" }) === "allow";
}

export function sampleControlCards(): Array<{
  id: string;
  key: string;
  name: string;
  purpose: string;
  category: FeatureCategory;
  roles: FeatureAudience[];
  writable: boolean;
  sensitive: boolean;
  dependencies: string[];
  dependencyNote: string | null;
  paymentHold: string | null;
  reading: ControlReading;
}> {
  const base = {
    dependencies: [] as string[],
    dependencyNote: null,
    paymentHold: null,
    sensitive: false,
    roles: ["parent"] as FeatureAudience[],
  };
  return [
    {
      ...base,
      id: "sample-default",
      key: "FEATURE_NEED_CARE_FAST",
      name: "Need care fast",
      purpose: "Sort open spots, then distance. Sample only.",
      category: "parent",
      writable: false,
      reading: presentProductFlag({ envSet: false, envOn: null, remoteConfigured: false, remote: "missing", codeDefault: false }),
    },
    {
      ...base,
      id: "sample-env-off",
      key: "FEATURE_OPEN_SPOT_ALERTS",
      name: "Spot alerts",
      purpose: "A parent can hear about a new opening. Sample only.",
      category: "parent",
      writable: false,
      sensitive: true,
      reading: presentProductFlag({ envSet: true, envOn: false, remoteConfigured: false, remote: "missing", codeDefault: false }),
    },
    {
      ...base,
      id: "sample-partial",
      key: "spot-alerts",
      name: "Spot alerts",
      purpose: "Writable switch at 25 percent. Sample only.",
      category: "parent",
      writable: true,
      sensitive: true,
      reading: presentSwitch({ known: true, inPostHog: true, active: true, rollout: 25 }),
    },
    {
      ...base,
      id: "sample-unknown",
      key: "smart-match",
      name: "Find my match",
      purpose: "The switch service did not answer. Sample only.",
      category: "parent",
      writable: false,
      reading: presentSwitch({ known: false, error: "Could not read the switch service.", inPostHog: false, active: false, rollout: 0 }),
    },
    {
      ...base,
      id: "sample-gov",
      key: "FEATURE_GOV_PORTAL",
      name: "Government desk",
      purpose: "Private government pages. Sample only.",
      category: "government",
      roles: ["government"],
      writable: false,
      sensitive: true,
      reading: presentProductFlag({ envSet: false, envOn: null, remoteConfigured: true, remote: "unverified", codeDefault: false }),
    },
    {
      ...base,
      id: "sample-shared",
      key: "FEATURE_PUSH",
      name: "Phone alerts",
      purpose: "Push stays a deployment setting. Sample only.",
      category: "shared",
      roles: ["parent", "daycare"],
      writable: false,
      sensitive: true,
      paymentHold: null,
      reading: presentProductFlag({ envSet: false, envOn: null, remoteConfigured: true, remote: true, codeDefault: false }),
    },
  ];
}

export function rememberWrite<T>(seen: Map<string, T>, requestId: string, value: T): { fresh: boolean; prior?: T } {
  if (seen.has(requestId)) return { fresh: false, prior: seen.get(requestId) };
  seen.set(requestId, value);
  return { fresh: true };
}
