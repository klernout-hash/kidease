import { randomUUID } from "node:crypto";
import type { Sql } from "../db.ts";

export const CENTRE_LEAD_WORKER_BATCH_SIZE = 20;
const DEFAULT_LEASE_MS = 120_000;
const WORKER_ID = "centre-leads";

export type CentreLeadWorkerBatchResult = {
  ok: boolean;
  skipped: boolean;
  reason?: "busy" | "lease_lost";
  selected: number;
  attempted: number;
  synced: number;
  failed: number;
  failedCentreIds: string[];
  skippedCentres: number;
  sent: number;
};

export type CentreLeadWorkerBatchOptions = {
  processCentre: (daycareId: string) => Promise<void>;
  finish?: () => Promise<number>;
  shouldSkip: (daycareId: string) => boolean;
  batchSize?: number;
  leaseMs?: number;
};

/**
 * Rotate through existing settings only. The cursor survives process restarts.
 * The lease prevents ordinary overlapping workers; it does not fence writes
 * already running when a lease expires, nor serialize page reads or staff edits.
 * A crash between domain effects and a checkpoint can repeat those effects.
 */
export async function withCentreLeadWorkerBatch(
  sql: Sql,
  options: CentreLeadWorkerBatchOptions,
): Promise<CentreLeadWorkerBatchResult> {
  const batchSize = Number.isFinite(options.batchSize)
    ? Math.min(CENTRE_LEAD_WORKER_BATCH_SIZE, Math.max(1, Math.floor(options.batchSize!)))
    : CENTRE_LEAD_WORKER_BATCH_SIZE;
  const leaseMs = Number.isFinite(options.leaseMs)
    ? Math.min(300_000, Math.max(1_000, Math.floor(options.leaseMs!)))
    : DEFAULT_LEASE_MS;
  const token = randomUUID();
  const result: CentreLeadWorkerBatchResult = {
    ok: true,
    skipped: false,
    selected: 0,
    attempted: 0,
    synced: 0,
    failed: 0,
    failedCentreIds: [],
    skippedCentres: 0,
    sent: 0,
  };
  const claimed = await sql<{ after_daycare_id: string }>`
    insert into centre_lead_worker_state (id, lease_token, lease_until, updated_at)
    values (${WORKER_ID}, ${token}, clock_timestamp() + ${leaseMs} * interval '1 millisecond', clock_timestamp())
    on conflict (id) do update
    set lease_token = excluded.lease_token,
        lease_until = clock_timestamp() + ${leaseMs} * interval '1 millisecond',
        updated_at = clock_timestamp()
    where centre_lead_worker_state.lease_until is null
       or centre_lead_worker_state.lease_until <= clock_timestamp()
    returning after_daycare_id
  `;
  if (!claimed[0]) return { ...result, skipped: true, reason: "busy" };

  const lostLease = (): CentreLeadWorkerBatchResult => ({
    ...result,
    ok: false,
    skipped: true,
    reason: "lease_lost",
  });
  const renew = async (): Promise<boolean> => {
    const owned = await sql<{ id: string }>`
      update centre_lead_worker_state
      set lease_until = clock_timestamp() + ${leaseMs} * interval '1 millisecond',
          updated_at = clock_timestamp()
      where id = ${WORKER_ID} and lease_token = ${token} and lease_until > clock_timestamp()
      returning id
    `;
    return Boolean(owned[0]);
  };
  const checkpoint = async (daycareId: string): Promise<boolean> => {
    const owned = await sql<{ id: string }>`
      update centre_lead_worker_state
      set after_daycare_id = ${daycareId},
          lease_until = clock_timestamp() + ${leaseMs} * interval '1 millisecond',
          updated_at = clock_timestamp()
      where id = ${WORKER_ID} and lease_token = ${token} and lease_until > clock_timestamp()
      returning id
    `;
    return Boolean(owned[0]);
  };

  try {
    const cursor = claimed[0].after_daycare_id;
    const centres = await sql<{ daycare_id: string }>`
      select daycare_id from centre_lead_settings
      where daycare_id > ${cursor}
      order by daycare_id asc limit ${batchSize}
    `;
    if (centres.length < batchSize) {
      const wrapped = await sql<{ daycare_id: string }>`
        select daycare_id from centre_lead_settings
        where daycare_id <= ${cursor}
        order by daycare_id asc limit ${batchSize - centres.length}
      `;
      centres.push(...wrapped);
    }
    result.selected = centres.length;

    for (const centre of centres) {
      if (!(await renew())) return lostLease();
      if (options.shouldSkip(centre.daycare_id)) {
        result.skippedCentres += 1;
      } else {
        result.attempted += 1;
        try {
          await options.processCentre(centre.daycare_id);
          result.synced += 1;
        } catch {
          result.failed += 1;
          result.failedCentreIds.push(centre.daycare_id);
          result.ok = false;
        }
      }
      // Failed and hidden centres also advance, so one centre cannot block a cycle.
      if (!(await checkpoint(centre.daycare_id))) return lostLease();
    }

    if (options.finish) {
      if (!(await renew())) return lostLease();
      result.sent = await options.finish();
      if (!(await renew())) return lostLease();
    }
    return result;
  } finally {
    // A stale holder must never clear a replacement worker's lease or cursor.
    await sql`
      update centre_lead_worker_state
      set lease_token = null, lease_until = null, updated_at = clock_timestamp()
      where id = ${WORKER_ID} and lease_token = ${token}
    `;
  }
}
