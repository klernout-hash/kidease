import { createServerFn } from "@tanstack/react-start";
import { evaluateFeatureFlag } from "@/lib/flags";

export const phase6Flags = createServerFn({ method: "GET" }).handler(async () => ({
  custody: evaluateFeatureFlag("FEATURE_CUSTODY_ORDERS"),
  packs: evaluateFeatureFlag("FEATURE_OPERATOR_PACKS"),
  extra: evaluateFeatureFlag("FEATURE_EXTRA_DAYS"),
  payer: evaluateFeatureFlag("FEATURE_THIRD_PARTY_PAYER"),
}));
