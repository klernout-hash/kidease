import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import {
  EMPTY_LISTING_DRAFT,
  groundListingDraft,
  listingDraftSchema,
  LISTING_WRITER_SYSTEM,
  listingWriterModelUser,
  listingWriterNotes,
  listingWriterSource,
  websiteOnFile,
} from "@/lib/ai/listing-writer";
import { AI_FLAGS } from "@/lib/ai/flags";
import { authMiddleware } from "@/lib/auth/middleware";
import { aiFeatureOn } from "@/lib/server/ai-feature";
import { assertCentreCanMutateListing } from "@/lib/server/centre-access";
import { getSql } from "@/lib/db";

/**
 * Draft only. The daycare edits it and saves the listing themselves.
 * The model sees the website address on file and the notes, not contact details.
 */
export const draftListingCopy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; notes?: string }) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
    notes: listingWriterNotes(typeof input?.notes === "string" ? input.notes : ""),
  }))
  .handler(async ({ context, data }) => {
    if (!data.daycareId) return { draft: EMPTY_LISTING_DRAFT, source: "empty" as const };
    if (!(await aiFeatureOn(AI_FLAGS.listingWriter, context.userId))) {
      return { draft: EMPTY_LISTING_DRAFT, source: "off" as const };
    }
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    const rows = await sql<{ website: string | null }>`
      select website from daycares where id = ${data.daycareId} limit 1
    `.catch(() => [] as Array<{ website: string | null }>);
    const website = websiteOnFile(rows[0]?.website);
    const source = listingWriterSource(website, data.notes);
    if (!source) return { draft: EMPTY_LISTING_DRAFT, source: "empty" as const };
    let ipHash = createHash("sha256").update("no-ip").digest("hex").slice(0, 16);
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
      const ip = clientIpFromHeaders(getRequest().headers) || "no-ip";
      ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    } catch {
      ipHash = createHash("sha256").update("no-ip").digest("hex").slice(0, 16);
    }
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "ai-listing-writer",
      system: LISTING_WRITER_SYSTEM,
      user: listingWriterModelUser(website, data.notes),
      schema: listingDraftSchema,
      userId: context.userId,
      ipHash,
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("ai-listing-writer", key, body),
      },
    });
    if (!result.ok) return { draft: EMPTY_LISTING_DRAFT, source: "fallback" as const };
    return { draft: groundListingDraft(result.data, source), source: "draft" as const, website };
  });
