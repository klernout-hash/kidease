import type { GovDashboard } from "./aggregate.ts";

function cell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function line(values: Array<string | number | null | undefined>): string {
  return values.map(cell).join(",");
}

/** UTF-8 CSV. Suppressed cells are blank. No personal fields. */
export function dashboardCsv(data: GovDashboard): string {
  const rows: string[] = [];
  rows.push(line(["section", "label", "value", "note"]));
  rows.push(line(["place", data.placeLabel, "", data.generatedAt]));
  rows.push(line(["k", "minimum group", data.k, "smaller groups are blank"]));
  const kpis = data.kpis;
  const pairs: Array<[string, number | null]> = [
    ["licensed_centres", kpis.licensedCentres],
    ["directory_centres", kpis.directoryCentres],
    ["capacity", kpis.capacity],
    ["vacancy_reporters", kpis.vacancyReporters],
    ["vacancy_fresh_30_days", kpis.vacancyFresh30],
    ["open_spots", kpis.openSpots],
    ["avg_days_to_fill", kpis.avgFillDays],
    ["fee_program_known", kpis.cwelccKnown],
    ["fee_program_unknown", kpis.cwelccUnknown],
    ["french", kpis.frenchCentres],
    ["english", kpis.englishCentres],
    ["inclusion_mentioned", kpis.inclusionCentres],
    ["job_posts", kpis.jobPosts],
    ["fees_confirmed", kpis.feesConfirmedCentres],
    ["fees_uncited", kpis.feesUncitedCentres],
    ["fees_none", kpis.feesNoneCentres],
  ];
  for (const [label, value] of pairs) rows.push(line(["kpi", label, value, ""]));
  if (data.desert.perSpace != null) {
    rows.push(line(["desert", "population_per_licensed_space", data.desert.perSpace, data.desert.source]));
  }
  for (const row of data.cities) {
    if (row.suppressed) continue;
    rows.push(line(["city", row.label, row.centres, ""]));
  }
  for (const row of data.fees) {
    if (row.suppressed) continue;
    rows.push(line(["fee", `${row.kind}:${row.bucket}`, row.centres, ""]));
  }
  for (const row of data.waitlist) {
    if (row.suppressed) continue;
    rows.push(line(["waitlist", `${row.age} ${row.start}`.trim(), row.n, ""]));
  }
  for (const row of data.trends) {
    rows.push(line(["trend_listings", row.month, row.listings, ""]));
    rows.push(line(["trend_vacancy_updates", row.month, row.vacancyUpdates, ""]));
    rows.push(line(["trend_jobs", row.month, row.jobs, ""]));
  }
  for (const note of data.coverage) rows.push(line(["coverage", "", "", note]));
  return `\uFEFF${rows.join("\n")}\n`;
}
