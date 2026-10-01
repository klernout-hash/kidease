/**
 * Demand vs supply by city and age group. No names, emails, phones, or messages.
 * Searches come from anonymous facts. Saves are saved listings (not a child's age).
 * Spot requests use the age on the request. Supply is the live licensed list.
 */

export const RANKING_AGE_GROUPS = ["any", "infant", "toddler", "preschool", "school-age"] as const;
export type RankingAgeGroup = (typeof RANKING_AGE_GROUPS)[number];

export type SupplyListing = {
  city: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  agesKnown: boolean;
  spotsInfant: number;
  spotsToddler: number;
  spotsPreschool: number;
  vacancyUpdatedAt?: string | null;
};

export type DemandCount = { city: string; ageGroup: string; n: number };

export type MarketRow = {
  city: string;
  ageGroup: RankingAgeGroup;
  asOf: string;
  searches: number;
  saves: number;
  spotRequests: number;
  listings: number;
  confirmedOpenings: number;
};

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

export function rankingCity(raw?: string | null): string | null {
  const first = String(raw ?? "").split(",")[0]?.trim().replace(/\s+/g, " ") ?? "";
  if (!first || first.length > 80) return null;
  if (/\d/.test(first)) return null;
  return first;
}

export function rankingAgeGroup(raw?: string | null): RankingAgeGroup {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "infant" || value === "toddler" || value === "preschool" || value === "school-age") return value;
  return "any";
}

export function winnipegDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The finished day the nightly job should snapshot. */
export function previousWinnipegDay(now = new Date()): string {
  const today = winnipegDay(now);
  const noon = new Date(`${today}T18:00:00.000Z`);
  noon.setUTCDate(noon.getUTCDate() - 1);
  return winnipegDay(noon);
}

function serves(listing: SupplyListing, age: RankingAgeGroup) {
  if (age === "any") return true;
  if (!listing.agesKnown) return false;
  if (age === "infant") return listing.ageMinMonths <= 18;
  if (age === "toddler") return listing.ageMinMonths < 36 && listing.ageMaxMonths >= 18;
  if (age === "school-age") return listing.ageMaxMonths >= 60;
  return listing.ageMaxMonths >= 30 && listing.ageMinMonths < 72;
}

function spotsFor(listing: SupplyListing, age: RankingAgeGroup) {
  if (age === "infant") return listing.spotsInfant;
  if (age === "toddler") return listing.spotsToddler;
  if (age === "preschool" || age === "school-age") return listing.spotsPreschool;
  return listing.spotsInfant + listing.spotsToddler + listing.spotsPreschool;
}

function confirmed(listing: SupplyListing, age: RankingAgeGroup, now: number) {
  if (!serves(listing, age)) return false;
  if (spotsFor(listing, age) <= 0) return false;
  const ts = Date.parse(listing.vacancyUpdatedAt || "");
  if (!Number.isFinite(ts)) return false;
  return now - ts <= STALE_MS;
}

function addCount(map: Map<string, number>, city: string, age: string, n: number) {
  const cleanCity = rankingCity(city);
  if (!cleanCity || !Number.isFinite(n) || n <= 0) return;
  const key = `${cleanCity}\t${rankingAgeGroup(age)}`;
  map.set(key, (map.get(key) ?? 0) + Math.floor(n));
}

function readCount(map: Map<string, number>, city: string, age: RankingAgeGroup) {
  return map.get(`${city}\t${age}`) ?? 0;
}

export function buildMarketRows(input: {
  asOf: string;
  listings: SupplyListing[];
  searches: DemandCount[];
  saves: DemandCount[];
  spotRequests: DemandCount[];
  now?: number;
}): MarketRow[] {
  const now = input.now ?? Date.now();
  const searches = new Map<string, number>();
  const saves = new Map<string, number>();
  const spots = new Map<string, number>();
  for (const row of input.searches) addCount(searches, row.city, row.ageGroup, row.n);
  for (const row of input.saves) addCount(saves, row.city, row.ageGroup, row.n);
  for (const row of input.spotRequests) addCount(spots, row.city, row.ageGroup, row.n);

  const cities = new Set<string>();
  for (const listing of input.listings) {
    const city = rankingCity(listing.city);
    if (city) cities.add(city);
  }
  for (const key of searches.keys()) cities.add(key.split("\t")[0] || "");
  for (const key of saves.keys()) cities.add(key.split("\t")[0] || "");
  for (const key of spots.keys()) cities.add(key.split("\t")[0] || "");
  cities.delete("");

  const rows: MarketRow[] = [];
  for (const city of cities) {
    const inCity = input.listings.filter((listing) => rankingCity(listing.city) === city);
    for (const age of RANKING_AGE_GROUPS) {
      const listings = inCity.filter((listing) => serves(listing, age)).length;
      const confirmedOpenings = inCity.filter((listing) => confirmed(listing, age, now)).length;
      const row: MarketRow = {
        city,
        ageGroup: age,
        asOf: input.asOf,
        searches: readCount(searches, city, age),
        saves: readCount(saves, city, age),
        spotRequests: readCount(spots, city, age),
        listings,
        confirmedOpenings,
      };
      if (row.searches || row.saves || row.spotRequests || row.listings || row.confirmedOpenings) rows.push(row);
    }
  }
  rows.sort((a, b) => a.city.localeCompare(b.city) || a.ageGroup.localeCompare(b.ageGroup));
  return rows;
}

export function rankingMarketCsv(rows: MarketRow[]): string {
  const header = ["city", "age_group", "as_of", "searches", "saves", "spot_requests", "listings", "confirmed_openings"];
  const lines = rows.map((row) =>
    [row.city, row.ageGroup, row.asOf, row.searches, row.saves, row.spotRequests, row.listings, row.confirmedOpenings]
      .map((value) => `"${String(value).replace(/"/g, "")}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
