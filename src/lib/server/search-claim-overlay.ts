import { dbSource, getSqlWithin } from "@/lib/db";
import { searchEvidence, type SearchBatch, type SearchEvidenceReason } from "@/lib/search-evidence";
import { CITY_TYPE_LIST_CAP } from "./catalog-neon";
import { mapDaycare, type DaycareRow } from "./map-row";

export const CLAIM_OVERLAY_BATCH_SIZE = 192;
export const CLAIM_OVERLAY_BUDGET_MS = 2000;

type ReadOutcome<T> = { kind: "result"; value: T } | { kind: "error" | "timeout" };

/** Bound the wait, not the underlying SQL execution; a late read cannot publish. */
function readBeforeDeadline<T>(read: () => Promise<T>, deadline: number): Promise<ReadOutcome<T>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve({ kind: "timeout" });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ReadOutcome<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "timeout" }), remaining);
    void Promise.resolve().then(read).then(
      (value) => finish({ kind: "result", value }),
      () => finish({ kind: "error" }),
    );
  });
}

/**
 * Search-only claimed data read. Keep every candidate and its position, even
 * when enrichment cannot finish. Coverage then stays unverified: missing claim
 * data can cause both false positives and false negatives in public predicates.
 * No memo here; the candidate memo owns successful generations and fresh retry.
 */
export async function overlayClaimedSearchResult<T extends { id: string }>(
  items: T[],
  merge: (item: T, row: ReturnType<typeof mapDaycare>) => T,
): Promise<SearchBatch<T>> {
  const observedAt = Date.now();
  const deadline = observedAt + CLAIM_OVERLAY_BUDGET_MS;
  const rows = [...items];
  const reasons = new Set<SearchEvidenceReason>();
  const positions = new Map<string, number[]>();
  for (const [index, item] of items.entries()) {
    if (typeof item?.id !== "string" || !item.id.trim()) {
      reasons.add("supplement-unavailable");
      continue;
    }
    const indexes = positions.get(item.id);
    if (indexes) indexes.push(index);
    else positions.set(item.id, [index]);
  }
  const allIds = [...positions.keys()];
  const ids = allIds.slice(0, CITY_TYPE_LIST_CAP);
  if (ids.length < allIds.length) reasons.add("enrichment-limit");
  const result = (): SearchBatch<T> => ({
    rows,
    evidence: searchEvidence({
      status: reasons.size ? "unverified" : "complete", source: "primary",
      reasons: [...reasons], retryable: [...reasons].some((reason) => reason !== "enrichment-limit"), observedAt,
    }),
  });
  if (!ids.length) return result();
  if (dbSource === "none") {
    reasons.add("source-unavailable");
    return result();
  }
  const acquired = await readBeforeDeadline(() => getSqlWithin(Math.max(1, deadline - Date.now())), deadline);
  if (acquired.kind !== "result") {
    reasons.add(acquired.kind === "timeout" ? "search-timeout" : "supplement-unavailable");
    return result();
  }
  for (let start = 0; start < ids.length; start += CLAIM_OVERLAY_BATCH_SIZE) {
    const batch = ids.slice(start, start + CLAIM_OVERLAY_BATCH_SIZE);
    const read = await readBeforeDeadline(() => acquired.value.query<DaycareRow>(
      "select * from daycares where claimed_at is not null and id = any($1::text[])",
      [batch],
    ), deadline);
    if (read.kind !== "result" || Date.now() >= deadline) {
      reasons.add(read.kind === "error" ? "supplement-unavailable" : "search-timeout");
      break;
    }
    try {
      const requested = new Set(batch);
      const seen = new Set<string>();
      const updates: [number, T][] = [];
      if (!Array.isArray(read.value)) throw new Error("Invalid claimed search rows");
      for (const row of read.value) {
        if (!row?.id || !row.claimed_at || !requested.has(row.id) || seen.has(row.id)) {
          throw new Error("Invalid claimed search row");
        }
        seen.add(row.id);
        const claimed = mapDaycare(row);
        if (claimed.id !== row.id) throw new Error("Invalid claimed search identity");
        for (const index of positions.get(row.id) ?? []) {
          const merged = merge(rows[index], claimed);
          if (merged?.id !== row.id) throw new Error("Invalid merged search identity");
          updates.push([index, merged]);
        }
      }
      if (Date.now() >= deadline) {
        reasons.add("search-timeout");
        break;
      }
      // Publish a batch atomically; mapping/merge faults keep prior batches only.
      for (const [index, merged] of updates) rows[index] = merged;
    } catch {
      reasons.add("supplement-unavailable");
      break;
    }
  }
  return result();
}
