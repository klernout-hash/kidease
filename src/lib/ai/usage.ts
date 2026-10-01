export type AiCallRow = {
  feature: string;
  ok: boolean;
  costMicros: number;
};

export type AiFeatureUsage = {
  feature: string;
  calls: number;
  failures: number;
  failureRate: number;
  costMicros: number;
};

export function summarizeAiCalls(rows: AiCallRow[]): AiFeatureUsage[] {
  const by = new Map<string, AiFeatureUsage>();
  for (const row of rows) {
    const feature = row.feature.trim() || "unknown";
    const current = by.get(feature) ?? {
      feature,
      calls: 0,
      failures: 0,
      failureRate: 0,
      costMicros: 0,
    };
    current.calls += 1;
    if (!row.ok) current.failures += 1;
    current.costMicros += Math.max(0, row.costMicros);
    current.failureRate = current.calls ? current.failures / current.calls : 0;
    by.set(feature, current);
  }
  return [...by.values()].sort((a, b) => b.calls - a.calls || a.feature.localeCompare(b.feature));
}
