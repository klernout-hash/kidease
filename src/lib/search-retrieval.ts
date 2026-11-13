import { mergeSearchEvidence, searchEvidence, type SearchBatch } from "./search-evidence.ts";

export type SearchReadOutcome<T> =
  | { kind: "result"; batch: SearchBatch<T> }
  | { kind: "timeout" | "error" };

/** Settle a read without converting its failure into a successful empty set. */
export function settleSearchRead<T>(read: Promise<SearchBatch<T>>, milliseconds: number): Promise<SearchReadOutcome<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: SearchReadOutcome<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "timeout" }), milliseconds);
    read.then((batch) => finish({ kind: "result", batch }), () => finish({ kind: "error" }));
  });
}

/** Same existing live-first union, carrying missing-source evidence alongside it. */
export function combineSearchReads<T extends { id: string }>(full: SearchReadOutcome<T>, live: SearchReadOutcome<T>): SearchBatch<T> {
  if (full.kind !== "result" && live.kind !== "result") throw new Error("Search results could not be loaded");
  const primary = full.kind === "result" ? full.batch.rows : [];
  const extra = live.kind === "result" ? live.batch.rows : [];
  const seen = new Set(primary.map((row) => row.id));
  const rows = primary.length ? [...extra.filter((row) => !seen.has(row.id)), ...primary] : [...extra];
  const evidence = [full, live].map((outcome) => outcome.kind === "result" ? outcome.batch.evidence : searchEvidence({
    status: "partial", source: "primary",
    reasons: [outcome.kind === "timeout" ? "search-timeout" : "source-unavailable"], retryable: true,
  }));
  return { rows, evidence: mergeSearchEvidence(...evidence) };
}
