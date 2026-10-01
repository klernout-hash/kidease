import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import {
  filtersAfterModel,
  parseSmartMatchQuiz,
  quizToFilters,
  SMART_MATCH_SYSTEM,
  smartMatchModelUser,
  smartMatchNoteSchema,
} from "@/lib/ai/smart-match";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";

/**
 * Optional note -> filters. Home, work, and the start date are not accepted.
 * TODO: waitlist tracker is not in this repo. Opening alerts stay on saved searches.
 */
export const refineSmartMatch = createServerFn({ method: "POST" })
  .middleware([sessionBearerMiddleware])
  .validator((input: unknown) => parseSmartMatchQuiz(input))
  .handler(async ({ data, context }) => {
    const base = quizToFilters(data);
    if (!data.note) return { filters: base, source: "quiz" as const };
    const bearer = (context as { bearerToken?: string }).bearerToken;
    let userId: string | null = null;
    let ipHash = createHash("sha256").update("no-ip").digest("hex").slice(0, 16);
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
      const ip = clientIpFromHeaders(getRequest().headers) || "no-ip";
      ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    } catch {
      ipHash = createHash("sha256").update("no-ip").digest("hex").slice(0, 16);
    }
    try {
      const { getSessionUser } = await import("@/lib/auth/verify.server");
      userId = (await getSessionUser(bearer))?.id ?? null;
    } catch {
      userId = null;
    }
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "smart-match",
      system: SMART_MATCH_SYSTEM,
      user: smartMatchModelUser(data.note),
      schema: smartMatchNoteSchema,
      userId,
      ipHash,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("smart-match", key, body),
      },
    });
    return filtersAfterModel(base, result.ok ? { ok: true, data: result.data } : { ok: false });
  });
