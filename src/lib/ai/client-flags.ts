import { readAiFeatureFlags } from "@/lib/server/ai-flags";
import { createInflightRead } from "../inflight-read.ts";

/** Each identity keeps its own request; no snapshot survives its completion. */
export const readClientAiFlags = createInflightRead((distinctId) =>
  readAiFeatureFlags({ data: { distinctId } }),
);
