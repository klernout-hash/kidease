/**
 * Reads the AI suite flags. Does not send mail, text, or place a call.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { AI_SUITE_FLAGS, type AiSuiteFlag } from "@/lib/ai/suite";
import { evaluateFeatureFlag } from "@/lib/flags";

export type AiSuiteGate = {
  any: boolean;
  flags: Record<AiSuiteFlag, boolean>;
};

export function aiSuiteGate(env: Record<string, string | undefined> = process.env): AiSuiteGate {
  const flags = {} as Record<AiSuiteFlag, boolean>;
  for (const key of AI_SUITE_FLAGS) flags[key] = evaluateFeatureFlag(key, env);
  return { any: AI_SUITE_FLAGS.some((key) => flags[key]), flags };
}

export const loadAiSuiteGate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<AiSuiteGate> => aiSuiteGate());
