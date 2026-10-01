import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { scrubText } from "@/lib/ai/pii";
import {
  groundParentAnswer,
  parentHelperModelUser,
  parentHelperSchema,
  PARENT_HELPER_SYSTEM,
  subsidyEstimate,
  type ParentAnswer,
  type SubsidyEstimate,
} from "@/lib/ai/parent-helper";

async function ipHashFor(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
    const ip = clientIpFromHeaders(getRequest().headers) || "guest";
    return createHash("sha256").update(ip).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update("guest").digest("hex").slice(0, 16);
  }
}

async function flagOn(distinctId: string): Promise<boolean> {
  const snapshot = await fetchAiFeatureFlags({ distinctId });
  return snapshot.reached === true && snapshot.flags[AI_FLAGS.parentHelper] === true;
}

export const askParentHelper = createServerFn({ method: "POST" })
  .validator((input: { question?: string; distinctId?: string } | undefined) => ({
    question: scrubText(String(input?.question || "")).replace(/\s+/g, " ").trim().slice(0, 400),
    distinctId: String(input?.distinctId || "guest").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80) || "guest",
  }))
  .handler(async ({ data }): Promise<ParentAnswer | { ok: false; error: "off" }> => {
    if (!(await flagOn(data.distinctId))) return { ok: false, error: "off" };
    if (!data.question) return groundParentAnswer(null);
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "parent-helper",
      system: PARENT_HELPER_SYSTEM,
      user: parentHelperModelUser(data.question),
      schema: parentHelperSchema,
      userId: data.distinctId,
      ipHash: await ipHashFor(),
      maxTokens: 180,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("parent-helper", key, body),
      },
    });
    return groundParentAnswer(result.ok ? result.data : null);
  });

export const estimateSubsidy = createServerFn({ method: "POST" })
  .validator((input: { province?: string; distinctId?: string } | undefined) => ({
    province: String(input?.province || "").trim().slice(0, 8),
    distinctId: String(input?.distinctId || "guest").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80) || "guest",
  }))
  .handler(async ({ data }): Promise<SubsidyEstimate | { ok: false; error: "off" }> => {
    if (!(await flagOn(data.distinctId))) return { ok: false, error: "off" };
    return subsidyEstimate(data.province);
  });
