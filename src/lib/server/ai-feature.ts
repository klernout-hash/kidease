/**
 * Same server flag read for English and French.
 * The bucket uses the visitor id after the same cleanup as the flag fetch.
 */

import { aiBucket, type AiFlag } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { aiFeatureVisible, sanitizeAiDistinctId } from "@/lib/ai/flag-gate";

export async function aiFeatureOn(flag: AiFlag, distinctId: string): Promise<boolean> {
  const id = sanitizeAiDistinctId(distinctId);
  const snapshot = await fetchAiFeatureFlags({ distinctId: id });
  return aiFeatureVisible({ flag, bucket: aiBucket(id), snapshot });
}
