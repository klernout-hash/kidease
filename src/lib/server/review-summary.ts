import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import {
  groundReviewPoints,
  REVIEW_SUMMARY_MIN,
  REVIEW_SUMMARY_SYSTEM,
  reviewSummarySchema,
  reviewSummarySource,
} from "@/lib/ai/review-summary";
import { getSql } from "@/lib/db";

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

/** Themes from published parent reviews only. Nothing is written back to the listing. */
export const summarizeListingReviews = createServerFn({ method: "POST" })
  .validator((input: { daycareId?: string; distinctId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
    distinctId: String(input?.distinctId || "kidease-public").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80) || "kidease-public",
  }))
  .handler(async ({ data }) => {
    const empty = { ok: true as const, points: [] as string[], count: 0, source: "empty" as const };
    if (!data.daycareId) return { ok: false as const, error: "missing" as const };
    const snapshot = await fetchAiFeatureFlags({ distinctId: data.distinctId });
    if (!(snapshot.reached === true && snapshot.flags[AI_FLAGS.reviewSummary] === true)) {
      return { ok: false as const, error: "off" as const };
    }
    const sql = await getSql();
    const rows = await sql<{ body: string | null }>`
      select body from reviews
      where daycare_id = ${data.daycareId}
        and status in ('published', 'approved')
      order by created_at desc
      limit 40
    `.catch(() => [] as Array<{ body: string | null }>);
    const bodies = rows.map((row) => String(row.body || "").trim()).filter(Boolean);
    if (bodies.length < REVIEW_SUMMARY_MIN) return { ...empty, count: bodies.length };
    const source = reviewSummarySource(bodies);
    if (!source) return { ...empty, count: bodies.length };
    const ipHash = await ipHashFor();
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "ai-review-summary",
      system: REVIEW_SUMMARY_SYSTEM,
      user: source,
      schema: reviewSummarySchema,
      ipHash,
      maxTokens: 180,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("ai-review-summary", key, body),
      },
    });
    if (!result.ok) return { ok: true as const, points: [], count: bodies.length, source: "fallback" as const };
    const points = groundReviewPoints(result.data.points, source, bodies.length);
    if (!points.length) return { ok: true as const, points: [], count: bodies.length, source: "fallback" as const };
    return { ok: true as const, points, count: bodies.length, source: "summary" as const };
  });
