import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  reviewFraudReasons,
  scoreClaimMatch,
  type ReviewFraudReason,
  type ReviewSignal,
} from "@/lib/fraud-checks";
import { clientIpFromHeaders } from "@/lib/server-fn-throttle";
import { nid } from "@/lib/utils";

export type FraudFlagRow = {
  id: string;
  kind: string;
  sourceId: string | null;
  daycareId: string | null;
  score: number | null;
  reasons: string;
  createdAt: string;
};

export async function listFraudFlags(): Promise<FraudFlagRow[]> {
  try {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: string;
      source_id: string | null;
      daycare_id: string | null;
      score: number | null;
      reasons: string;
      created_at: string | Date;
    }>`
      select id, kind, source_id, daycare_id, score, reasons, created_at
      from fraud_flags
      order by created_at desc
      limit 80
    `;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      sourceId: row.source_id,
      daycareId: row.daycare_id,
      score: row.score,
      reasons: row.reasons,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  } catch {
    return [];
  }
}

export async function queueClaimReview(input: {
  claimId: string;
  daycareId: string;
  claimantEmail?: string | null;
  claimantPhone?: string | null;
  licenceEmail?: string | null;
  licencePhone?: string | null;
}) {
  const scored = scoreClaimMatch(input);
  if (!scored.needsReview || scored.autoApprove !== false) return scored;
  try {
    const sql = await getSql();
    await sql`
      insert into fraud_flags (id, kind, source_id, daycare_id, score, reasons)
      values (
        ${nid("frd")},
        ${"claim"},
        ${input.claimId},
        ${input.daycareId},
        ${scored.score},
        ${scored.reasons.join(", ") || "low_match"}
      )
    `;
  } catch (err) {
    console.error("[kidease-fraud] claim flag skipped", err instanceof Error ? err.message : "failed");
  }
  return scored;
}

async function signalContext(userId: string): Promise<{ ipHash: string | null; deviceId: string | null }> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const ip = clientIpFromHeaders(getRequest().headers);
    const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
    const { parseCurrentTrustedDevice } = await import("@/lib/server/two-factor.server");
    const device = parseCurrentTrustedDevice(userId);
    return { ipHash, deviceId: device?.deviceId || null };
  } catch {
    return { ipHash: null, deviceId: null };
  }
}

export async function flagReviewAttempt(input: {
  reviewId: string | null;
  daycareId: string;
  userId: string;
  body: string;
  enrolled: boolean;
}) {
  const { ipHash, deviceId } = await signalContext(input.userId);
  const nowMs = Date.now();
  let recent: ReviewSignal[] = [];
  try {
    const sql = await getSql();
    const rows = await sql<{ ip_hash: string | null; device_id: string | null; body_norm: string; created_at: string | Date }>`
      select ip_hash, device_id, body_norm, created_at
      from review_signals
      where created_at > now() - interval '10 minutes'
      order by created_at desc
      limit 40
    `;
    recent = rows.map((row) => ({
      body: row.body_norm || "",
      ipHash: row.ip_hash,
      deviceId: row.device_id,
      atMs: row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(String(row.created_at)),
    }));
    const { normalizeReviewText } = await import("@/lib/fraud-checks");
    await sql`
      insert into review_signals (id, daycare_id, user_id, ip_hash, device_id, body_norm)
      values (
        ${nid("rvs")},
        ${input.daycareId},
        ${input.userId},
        ${ipHash},
        ${deviceId},
        ${normalizeReviewText(input.body).slice(0, 400)}
      )
    `;
  } catch (err) {
    console.error("[kidease-fraud] review signal skipped", err instanceof Error ? err.message : "failed");
  }
  const reasons: ReviewFraudReason[] = reviewFraudReasons({
    enrolled: input.enrolled,
    body: input.body,
    ipHash,
    deviceId,
    nowMs,
    recent,
  });
  if (!reasons.length) return reasons;
  try {
    const sql = await getSql();
    await sql`
      insert into fraud_flags (id, kind, source_id, daycare_id, score, reasons)
      values (
        ${nid("frd")},
        ${"review"},
        ${input.reviewId},
        ${input.daycareId},
        ${null},
        ${reasons.join(", ")}
      )
    `;
  } catch (err) {
    console.error("[kidease-fraud] review flag skipped", err instanceof Error ? err.message : "failed");
  }
  return reasons;
}
