import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { groundListingFrench, translateSchema, translateSource, TRANSLATE_SYSTEM } from "@/lib/ai/translate";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertCentreCanMutateListing } from "@/lib/server/centre-access";
import { getSql } from "@/lib/db";

async function ipHashFor(userId: string): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
    const ip = clientIpFromHeaders(getRequest().headers) || userId;
    return createHash("sha256").update(ip).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update(userId).digest("hex").slice(0, 16);
  }
}

/** Draft only. The daycare edits the French and saves the listing themselves. */
export const draftListingFrench = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!data.daycareId) return { ok: false as const, error: "missing" as const };
    const snapshot = await fetchAiFeatureFlags({ distinctId: context.userId });
    if (!(snapshot.reached === true && snapshot.flags[AI_FLAGS.translate] === true)) {
      return { ok: false as const, error: "off" as const };
    }
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    const rows = await sql<{ description: string | null; tagline: string | null }>`
      select description, tagline from daycares where id = ${data.daycareId} limit 1
    `.catch(() => [] as Array<{ description: string | null; tagline: string | null }>);
    const source = translateSource(rows[0]?.description || "", rows[0]?.tagline || "");
    if (!source) return { ok: true as const, french: "", source: "empty" as const };
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "ai-translate",
      system: TRANSLATE_SYSTEM,
      user: source,
      schema: translateSchema,
      userId: context.userId,
      ipHash: await ipHashFor(context.userId),
      maxTokens: 220,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("ai-translate", key, body),
      },
    });
    if (!result.ok) return { ok: true as const, french: "", source: "fallback" as const };
    const french = groundListingFrench(result.data.french, source);
    if (!french) return { ok: true as const, french: "", source: "fallback" as const };
    return { ok: true as const, french, source: "draft" as const };
  });
