/** Evidence describes retrieval coverage, not real-world listing accuracy. */
export const SEARCH_EVIDENCE_REASONS = [
  "candidate-limit", "search-timeout", "source-fallback", "source-unavailable",
  "supplement-unavailable", "enrichment-limit", "legacy-unknown",
] as const;
export type SearchEvidenceReason = (typeof SEARCH_EVIDENCE_REASONS)[number];
export type SearchEvidence = {
  version: 1;
  status: "complete" | "partial" | "unverified";
  /** `available` is a snapshot count, never a current-catalogue lower bound. */
  totalKind: "exact" | "at-least" | "available";
  source: "primary" | "snapshot" | "mixed" | "unknown";
  reasons: SearchEvidenceReason[];
  retryable: boolean;
  /** When the oldest contributing source was read, preserved on cache hits. */
  observedAt: number;
};
export type SearchBatch<T> = { rows: T[]; evidence: SearchEvidence };
export type SearchReadOptions = { refresh?: boolean };

const REASONS = new Set<string>(SEARCH_EVIDENCE_REASONS);
type EvidenceInput = Partial<Omit<SearchEvidence, "version" | "totalKind">>;

/** Safe default: absent coverage is unknown, never an exact total. */
export function searchEvidence(input: EvidenceInput = {}): SearchEvidence {
  const source = input.source ?? "unknown";
  const reasons = [...new Set(input.reasons ?? (input.status ? [] : ["legacy-unknown" as const]))];
  let status = input.status ?? "unverified";
  if (source !== "primary" || reasons.includes("source-fallback") || reasons.includes("legacy-unknown")) status = "unverified";
  else if (status === "complete" && reasons.length) status = reasons.every((reason) => reason === "candidate-limit") ? "partial" : "unverified";
  return {
    version: 1, status,
    totalKind: status === "complete" ? "exact" : status === "partial" ? "at-least" : "available",
    source, reasons,
    retryable: input.retryable ?? reasons.some((reason) => reason !== "candidate-limit"),
    observedAt: Number.isFinite(input.observedAt) && Number(input.observedAt) >= 0 ? Number(input.observedAt) : Date.now(),
  };
}

/** Validate persisted/wire evidence. Legacy or malformed envelopes stay unknown. */
export function readSearchEvidence(value: unknown): SearchEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return searchEvidence();
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !["complete", "partial", "unverified"].includes(String(row.status)) ||
      !["primary", "snapshot", "mixed", "unknown"].includes(String(row.source)) ||
      !Array.isArray(row.reasons) || row.reasons.some((reason) => typeof reason !== "string" || !REASONS.has(reason)) ||
      typeof row.observedAt !== "number" || !Number.isFinite(row.observedAt) || row.observedAt < 0 ||
      typeof row.retryable !== "boolean") return searchEvidence();
  const expectedKind = row.status === "complete" ? "exact" : row.status === "partial" ? "at-least" : "available";
  if (row.totalKind !== expectedKind || (row.status === "complete" && row.reasons.length > 0)) {
    return searchEvidence({ status: "unverified", source: row.source as SearchEvidence["source"],
      reasons: [...row.reasons as SearchEvidenceReason[], "legacy-unknown"], observedAt: row.observedAt, retryable: true });
  }
  return searchEvidence({
    status: row.status as SearchEvidence["status"], source: row.source as SearchEvidence["source"],
    reasons: row.reasons as SearchEvidenceReason[], observedAt: row.observedAt, retryable: row.retryable,
  });
}

/** A missing contributor can only weaken coverage; filtering never improves it. */
export function mergeSearchEvidence(...values: SearchEvidence[]): SearchEvidence {
  if (!values.length) return searchEvidence();
  const rows = values.map(readSearchEvidence);
  const source = rows.every((row) => row.source === rows[0].source) ? rows[0].source : "mixed";
  const status = rows.some((row) => row.status === "unverified") ? "unverified"
    : rows.some((row) => row.status === "partial") ? "partial" : "complete";
  return searchEvidence({
    status, source, reasons: rows.flatMap((row) => row.reasons),
    retryable: rows.some((row) => row.retryable), observedAt: Math.min(...rows.map((row) => row.observedAt)),
  });
}

export function withSearchRows<T, U>(batch: SearchBatch<T>, rows: U[]): SearchBatch<U> {
  return { rows, evidence: batch.evidence };
}
