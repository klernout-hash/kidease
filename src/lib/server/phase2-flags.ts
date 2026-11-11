import { createServerFn } from "@tanstack/react-start";
import { evaluateFeatureFlag } from "@/lib/flags";

/** All default off. The desk renders nothing until one of these is on. */
export const phase2DeskFlags = createServerFn({ method: "GET" }).handler(async () => ({
  reviews: evaluateFeatureFlag("FEATURE_REVIEW_REPLIES"),
  pdf: evaluateFeatureFlag("FEATURE_FILLABLE_PDF"),
  packet: evaluateFeatureFlag("FEATURE_ADMISSION_PACKET"),
  mobile: evaluateFeatureFlag("FEATURE_STAFF_MOBILE"),
  reminder: evaluateFeatureFlag("FEATURE_INVOICE_REMINDERS"),
  lateFee: evaluateFeatureFlag("FEATURE_LATE_FEE"),
  tax: evaluateFeatureFlag("FEATURE_TAX_RECEIPTS"),
  cwelcc: evaluateFeatureFlag("FEATURE_CWELCC_MATH"),
  video: evaluateFeatureFlag("FEATURE_VIDEO_SHARE"),
  milestones: evaluateFeatureFlag("FEATURE_MILESTONES"),
  renewal: evaluateFeatureFlag("FEATURE_CREDENTIAL_RENEWAL"),
}));
