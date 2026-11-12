import { matchesGovScope, type CityFact, type FeeBucketFact, type FillFact, type GovRaw, type GovScope, type TrendFact, type WaitlistFact } from "./aggregate.ts";

type Place = { province: string; city: string };

/** Keep city attribution until the requested scope is applied, before suppression. */
export type GovBundle = {
  cities: CityFact[];
  fees: Array<FeeBucketFact & Place>;
  waitlist: Array<WaitlistFact & { province: string }>;
  trends: Array<TrendFact & Place>;
  fill: Array<FillFact & Place>;
  jobCounts: Array<Place & { n: number }>;
  generatedAt: string;
};

export function bundleForScope(bundle: GovBundle, scope: GovScope): GovRaw {
  // Keep the province's city choices. buildGovDashboard scopes their displayed counts.
  const inProvince = (row: { province: string }) => scope.province === "ALL" || row.province.trim().toUpperCase() === scope.province;
  const inScope = (row: Place) => matchesGovScope(row, scope);
  const feeMap = new Map<string, FeeBucketFact>();
  for (const row of bundle.fees.filter(inScope)) {
    const key = `${row.kind}|${row.bucket}`;
    const found = feeMap.get(key) ?? { bucket: row.bucket, kind: row.kind, n: 0 };
    found.n += row.n;
    feeMap.set(key, found);
  }
  const waitMap = new Map<string, WaitlistFact>();
  for (const row of bundle.waitlist.filter(inProvince)) {
    const key = `${row.age}|${row.start}`;
    const found = waitMap.get(key) ?? { age: row.age, start: row.start, n: 0 };
    found.n += row.n;
    waitMap.set(key, found);
  }
  const trendMap = new Map<string, TrendFact>();
  for (const row of bundle.trends.filter(inScope)) {
    const found = trendMap.get(row.month) ?? { month: row.month, listings: 0, vacancyUpdates: 0, jobs: 0 };
    found.listings += row.listings;
    found.vacancyUpdates += row.vacancyUpdates;
    found.jobs += row.jobs;
    trendMap.set(row.month, found);
  }
  let fillN = 0;
  let weighted = 0;
  for (const row of bundle.fill.filter(inScope)) {
    if (row.avgDays == null) continue;
    fillN += row.n;
    weighted += row.avgDays * row.n;
  }
  return {
    cities: bundle.cities.filter(inProvince),
    fees: [...feeMap.values()],
    waitlist: [...waitMap.values()],
    waitlistProvinceContext: scope.city !== "ALL" || scope.region !== "ALL",
    trends: [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    fill: { n: fillN, avgDays: fillN > 0 ? weighted / fillN : null },
    jobs: bundle.jobCounts.filter(inScope).reduce((total, row) => total + row.n, 0),
    generatedAt: bundle.generatedAt,
  };
}
