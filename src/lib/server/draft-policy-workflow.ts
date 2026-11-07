import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import {
  acceptanceSnapshot,
  buildDraftPolicy,
  canReadDispute,
  canSaveDraftPolicy,
  nextDisputeStatus,
  openDispute,
  type DisputeStatus,
  type StoredDraftPolicy,
} from "@/lib/draft-policy-workflow";
import { shadowCommitmentRate, type ShadowEvent } from "@/lib/ranking-shadow";

async function ownsCentre(userId: string, daycareId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ ok: number }>`
    select 1 as ok from provider_daycares where user_id = ${userId} and daycare_id = ${daycareId}
    union
    select 1 as ok from centre_members where user_id = ${userId} and daycare_id = ${daycareId} and status = 'active'
    limit 1
  `;
  return Boolean(rows[0]);
}

async function isStaff(userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ role: string | null }>`select role from profiles where user_id = ${userId} limit 1`;
  const role = String(rows[0]?.role || "");
  return role === "admin" || role === "support" || role === "support_lead";
}

export const saveDraftPolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    daycareId?: string;
    topic?: string;
    province?: string;
    setting?: string;
    program?: string;
    fundedProgram?: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    if (!canSaveDraftPolicy({ ownsCentre: await ownsCentre(context.userId, daycareId) })) {
      return { ok: false as const, error: "You cannot save a policy for this centre." };
    }
    const sql = await getSql();
    const prior = await sql<{ version: number }>`
      select version from draft_cancellation_policies where daycare_id = ${daycareId} order by version desc limit 1
    `;
    const built = buildDraftPolicy({
      id: nid(),
      daycareId,
      topic: String(data.topic || ""),
      province: data.province,
      setting: data.setting,
      program: data.program,
      fundedProgram: data.fundedProgram === true,
      version: (prior[0]?.version || 0) + 1,
    });
    if ("error" in built) return { ok: false as const, error: built.error };
    await sql`
      insert into draft_cancellation_policies
        (id, daycare_id, province, program, topic, body, status, in_force, version, created_by)
      values
        (${built.id}, ${built.daycareId}, ${built.province}, ${built.program}, ${built.topic}, ${built.body}, 'counsel-review', false, ${built.version}, ${context.userId})
    `;
    return { ok: true as const, policy: built };
  });

export const acceptDraftSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { policyId?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const policyId = String(data.policyId || "").trim();
    const rows = await sql<StoredDraftPolicy & { body: string; version: number }>`
      select id, daycare_id as "daycareId", province, program, topic, body, status, in_force as "inForce", version
      from draft_cancellation_policies where id = ${policyId} limit 1
    `;
    const row = rows[0];
    if (!row || row.inForce !== false || row.status !== "counsel-review") {
      return { ok: false as const, error: "Draft not found." };
    }
    const existing = await sql<{ body_snapshot: string; policy_version: number }>`
      select body_snapshot, policy_version from draft_policy_acceptances
      where policy_id = ${policyId} and user_id = ${context.userId} and policy_version = ${row.version}
      limit 1
    `;
    if (existing[0]) {
      return {
        ok: true as const,
        snapshot: {
          policyId,
          policyVersion: existing[0].policy_version,
          bodySnapshot: existing[0].body_snapshot,
          userId: context.userId,
          placeStatus: "draft" as const,
          immutable: true as const,
          confirmsPlacement: false as const,
          bindingConsent: false as const,
        },
      };
    }
    const policy = buildDraftPolicy({
      id: row.id,
      daycareId: row.daycareId,
      topic: row.topic,
      province: row.province,
      program: row.program,
      version: row.version,
    });
    if ("error" in policy) return { ok: false as const, error: policy.error };
    const snap = acceptanceSnapshot({ ...policy, body: row.body }, context.userId);
    await sql`
      insert into draft_policy_acceptances (id, policy_id, policy_version, body_snapshot, user_id, place_status)
      values (${nid()}, ${snap.policyId}, ${snap.policyVersion}, ${row.body}, ${context.userId}, 'draft')
    `;
    return { ok: true as const, snapshot: { ...snap, bodySnapshot: row.body } };
  });

export const fileDraftDispute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId?: string; evidenceNote?: string }) => input)
  .handler(async ({ context, data }) => {
    const filed = openDispute({
      conversationId: String(data.conversationId || ""),
      userId: context.userId,
      evidenceNote: String(data.evidenceNote || ""),
    });
    if ("error" in filed) return { ok: false as const, error: filed.error };
    const sql = await getSql();
    const id = nid();
    await sql`
      insert into draft_disputes (id, support_reference, user_id, status, evidence_note)
      values (${id}, ${filed.supportReference}, ${context.userId}, 'open', ${filed.evidenceNote})
    `;
    return { ok: true as const, dispute: { id, ...filed } };
  });

export const readDraftDispute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = String(data.id || "").trim();
    const rows = await sql<{ id: string; user_id: string; status: DisputeStatus; support_reference: string; evidence_note: string }>`
      select id, user_id, status, support_reference, evidence_note from draft_disputes where id = ${id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "Not found." };
    const staff = await isStaff(context.userId);
    if (!canReadDispute({ actorId: context.userId, ownerId: row.user_id, staff })) {
      return { ok: false as const, error: "You cannot open this dispute." };
    }
    return { ok: true as const, dispute: row };
  });

export const reviewDraftDispute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; status?: string }) => input)
  .handler(async ({ context, data }) => {
    const staff = await isStaff(context.userId);
    const sql = await getSql();
    const id = String(data.id || "").trim();
    const rows = await sql<{ status: DisputeStatus }>`select status from draft_disputes where id = ${id} limit 1`;
    const from = rows[0]?.status;
    if (!from) return { ok: false as const, error: "Not found." };
    const next = nextDisputeStatus({ staff, from, to: String(data.status || "") as DisputeStatus });
    if (typeof next !== "string") return { ok: false as const, error: next.error };
    await sql`update draft_disputes set status = ${next} where id = ${id}`;
    return { ok: true as const, status: next };
  });

export const recordFrozenShadow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; events?: ShadowEvent[]; confirmedCommitments?: number }) => input)
  .handler(async ({ context, data }) => {
    if (!(await isStaff(context.userId))) return { ok: false as const, error: "Staff only." };
    const shadow = shadowCommitmentRate({
      events: Array.isArray(data.events) ? data.events : [],
      confirmedCommitments: Number(data.confirmedCommitments) || 0,
    });
    if (shadow.apply !== false || shadow.frozen !== true) return { ok: false as const, error: "Shadow scores stay frozen." };
    const sql = await getSql();
    await sql`
      insert into draft_shadow_ranks (id, daycare_id, rate, frozen)
      values (${nid()}, ${String(data.daycareId || "")}, ${shadow.rate}, true)
    `;
    return { ok: true as const, shadow };
  });
