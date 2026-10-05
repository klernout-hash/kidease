import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import {
  localPhotoFacts,
  PHOTO_CHECK_SYSTEM,
  PHOTO_CHECK_USER,
  photoCheckOutcome,
  photoCheckSchema,
  sha256Hex,
  type PhotoCheckOutcome,
} from "@/lib/ai/photo-check";
import { authMiddleware } from "@/lib/auth/middleware";
import { applyManagedListingPhotos, managedListingPhotos, MAX_LISTING_PHOTOS, splitPhotoList } from "@/lib/listing-photo";
import { assertCentreCanMutateListing } from "@/lib/server/centre-access";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/server/roles";

const PREVIEW_MAX = 480_000;

function cleanImage(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(value)) return "";
  return value.slice(0, PREVIEW_MAX);
}

function cleanHashes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item ?? "").trim().toLowerCase())
    .filter((item) => /^[a-f0-9]{64}$/.test(item))
    .slice(0, 12);
}

function cleanNumber(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(255, Math.max(0, n)) : fallback;
}

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

export const checkListingPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; dataUrl?: string; meanLuma?: number; edgeScore?: number; existingHashes?: string[] } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
    dataUrl: cleanImage(input?.dataUrl),
    meanLuma: cleanNumber(input?.meanLuma, 255),
    edgeScore: cleanNumber(input?.edgeScore, 99),
    existingHashes: cleanHashes(input?.existingHashes),
  }))
  .handler(async ({ context, data }): Promise<PhotoCheckOutcome> => {
    const empty = photoCheckOutcome({
      model: null,
      local: { blurry: false, dark: false, duplicate: false },
    });
    if (!data.daycareId || !data.dataUrl) return empty;
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    const rows = await sql<{ photos: string | null }>`
      select photos from daycares where id = ${data.daycareId} limit 1
    `.catch(() => [] as Array<{ photos: string | null }>);
    const stored = splitPhotoList(rows[0]?.photos ?? "");
    const storedHashes = await Promise.all(stored.map((src) => sha256Hex(src)));
    const sha = await sha256Hex(data.dataUrl);
    const local = localPhotoFacts({
      meanLuma: data.meanLuma,
      edgeScore: data.edgeScore,
      sha256: sha,
      existingHashes: [...data.existingHashes, ...storedHashes],
    });
    const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
    const result = await callAi({
      feature: "ai-photo-check",
      system: PHOTO_CHECK_SYSTEM,
      user: PHOTO_CHECK_USER,
      schema: photoCheckSchema,
      imageDataUrl: data.dataUrl,
      maxTokens: 80,
      userId: context.userId,
      ipHash: await ipHashFor(context.userId),
      deps: {
        log: logAiCall,
        readCache: readAiCache,
        writeCache: (key, body) => writeAiCache("ai-photo-check", key, body),
      },
    });
    const outcome = photoCheckOutcome({ model: result.ok ? result.data : null, local });
    if (!outcome.hold) return outcome;
    const id = crypto.randomUUID();
    await sql`
      insert into photo_checks (id, daycare_id, sha256, status, preview)
      values (${id}, ${data.daycareId}, ${sha}, 'held', ${data.dataUrl})
    `.catch(() => undefined);
    void import("@/lib/server/alert-fanout")
      .then((mod) => mod.notifyListingAttention({ daycareId: data.daycareId, sourceId: id, kind: "photo" }))
      .catch(() => undefined);
    return outcome;
  });

export const listHeldPhotos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string; preview: string; created_at: string }>`
      select id, daycare_id, preview, created_at
      from photo_checks
      where status = 'held'
      order by created_at desc
      limit 20
    `.catch(() => [] as Array<{ id: string; daycare_id: string; preview: string; created_at: string }>);
    return rows.map((row) => ({
      id: row.id,
      daycareId: row.daycare_id,
      preview: row.preview,
      createdAt: row.created_at,
    }));
  });

export const resolveHeldPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; action?: string } | undefined) => ({
    id: String(input?.id || "").trim().slice(0, 80),
    action: input?.action === "allow" ? "allow" : "reject",
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!data.id) return { ok: false as const, error: "missing" };
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string; preview: string; status: string }>`
      select id, daycare_id, preview, status from photo_checks where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || row.status !== "held") return { ok: false as const, error: "missing" };
    if (data.action === "reject") {
      await sql`update photo_checks set status = 'rejected' where id = ${row.id}`;
      return { ok: true as const, action: "reject" as const };
    }
    const current = await sql<{ photos: string | null }>`
      select photos from daycares where id = ${row.daycare_id} limit 1
    `;
    const photos = current[0]?.photos ?? "";
    if (managedListingPhotos(photos).length >= MAX_LISTING_PHOTOS) return { ok: false as const, error: "full" };
    const next = applyManagedListingPhotos(photos, [...managedListingPhotos(photos), row.preview]);
    await sql`update daycares set photos = ${next} where id = ${row.daycare_id}`;
    await sql`update photo_checks set status = 'cleared' where id = ${row.id}`;
    return { ok: true as const, action: "allow" as const };
  });
