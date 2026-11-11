import { createServerFn } from "@tanstack/react-start";
import { evaluateFeatureFlag } from "@/lib/flags";
import type { Phase1Card } from "@/lib/phase1-screens";

/** One flag per card. All default off. */
export const phase1ScreenFlags = createServerFn({ method: "GET" }).handler(async () => {
  const on = (key: Parameters<typeof evaluateFeatureFlag>[0]) => evaluateFeatureFlag(key);
  const flags: Record<Phase1Card, boolean> = {
    leads: on("FEATURE_WALKIN_LEADS"),
    waitlist: on("FEATURE_PROGRAM_WAITLIST"),
    offers: on("FEATURE_WAITLIST_OFFERS"),
    forms: on("FEATURE_FORM_STATUS"),
    news: on("FEATURE_FAMILY_NEWSFEED"),
    media: on("FEATURE_MEDIA_CONSENT"),
    pickup: on("FEATURE_PICKUP_VERIFY"),
    roll: on("FEATURE_EMERGENCY_ROLL"),
    arrival: on("FEATURE_ARRIVAL_NOTES"),
    toilet: on("FEATURE_TOILETING_LOG"),
    menu: on("FEATURE_ALLERGEN_MENU"),
    allergy: on("FEATURE_ALLERGY_BADGE"),
    incident: on("FEATURE_INCIDENT_SHARE"),
    export: on("FEATURE_INCIDENT_EXPORT"),
    portfolio: on("FEATURE_CHILD_PORTFOLIO"),
    certificate: on("FEATURE_CREDENTIAL_FILES"),
    screening: on("FEATURE_SCREENING_DOCS"),
    switch: on("FEATURE_CENTRE_SWITCHER"),
    billing: on("FEATURE_BILLING_ONLY_ROLE"),
    messaging: on("FEATURE_FAMILY_MESSAGING_DENY"),
    revenue: on("FEATURE_REVENUE_REPORT"),
    pdf: on("FEATURE_PDF_EXPORT"),
    audit: on("FEATURE_AUDIT_LOG"),
    security: on("FEATURE_SECURITY_PAGE"),
    privacy: on("FEATURE_PRIVACY_REQUESTS"),
    fees: on("FEATURE_FEE_DISPLAY_GATE"),
  };
  return flags;
});
