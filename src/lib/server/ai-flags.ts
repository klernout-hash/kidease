import { createServerFn } from "@tanstack/react-start";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { sanitizeAiDistinctId } from "@/lib/ai/flag-gate";

/** Guests included. The browser SDK does not start until Allow. */
export const readAiFeatureFlags = createServerFn({ method: "POST" })
  .validator((input: { distinctId?: string } | undefined) => ({
    distinctId: sanitizeAiDistinctId(input?.distinctId),
  }))
  .handler(async ({ data }) => fetchAiFeatureFlags({ distinctId: data.distinctId }));
