/**
 * Nightly demand vs supply rows. Pure so tests do not need a database.
 * No personal data. A listing can count in more than one age group.
 */

export const DEMAND_AGE_GROUPS = ["infant", "toddler", "preschool", "school-age", "unknown", "any"] as const;

export type DemandAgeGroup = (typeof DEMAND_AGE_GROUPS)[number];

export type DemandEvent = {
  name: string;
  city: string;
  ageGroup: string;
};

export type SupplyListing = {
  city: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  spotsInfant: number;
  spotsToddler: number;
  spotsPreschool: number;
  vacancyAt: string | null;
};

export type DemandSupplyRow = {
  day: string;
  city: string;
  ageGroup: string;
  searches: number;
  saves: number;
  spotRequests: number;
  listings: number;
  confirmedOpenings: number;
};

const FRESH_MS = 14 * 24 * 60 * 60 * 1000;

export function winnipegDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The finished Winnipeg day before `now`. */
export function previousWinnipegDay(now = new Date()): string {
  const today = winnipegDate(now);
  const probe = new Date(`${today}T18:00:00Z`);
  probe.setUTCDate(probe.getUTCDate() - 1);
  return winnipegDate(probe);
}

export function ageBuckets(min: number, max: number): DemandAgeGroup[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || max <= 0) return ["unknown"];
  const out: DemandAgeGroup[] = [];
  if (min <= 18 && max > 0) out.push("infant");
  if (min < 36 && max >= 18) out.push("toddler");
  if (max >= 30 && min < 72) out.push("preschool");
  if (max >= 60) out.push("school-age");
  return out.length ? out : ["unknown"];
}

function fresh(vacancyAt: string | null, now: number) {
  if (!vacancyAt) return false;
  const ts = Date.parse(vacancyAt);
  if (!Number.isFinite(ts)) return false;
  const age = now - ts;
  return age >= 0 && age <= FRESH_MS;
}

function key(city: string, age: string) {
  return `${city}\u0000${age}`;
}

export function buildDemandSupplyRows(input: {
  day: string;
  events: DemandEvent[];
  listings: SupplyListing[];
  now?: number;
}): DemandSupplyRow[] {
  const now = input.now ?? Date.now();
  const map = new Map<string, DemandSupplyRow>();
  const row = (city: string, ageGroup: string) => {
    const id = key(city, ageGroup);
    let cur = map.get(id);
    if (!cur) {
      cur = {
        day: input.day,
        city,
        ageGroup,
        searches: 0,
        saves: 0,
        spotRequests: 0,
        listings: 0,
        confirmedOpenings: 0,
      };
      map.set(id, cur);
    }
    return cur;
  };

  for (const event of input.events) {
    const city = event.city.trim().slice(0, 80);
    if (!city) continue;
    const age = event.ageGroup || "any";
    const cur = row(city, age);
    if (event.name === "search_performed") cur.searches += 1;
    else if (event.name === "listing_saved") cur.saves += 1;
    else if (event.name === "spot_requested") cur.spotRequests += 1;
  }

  for (const listing of input.listings) {
    const city = listing.city.trim().slice(0, 80);
    if (!city) continue;
    const open = fresh(listing.vacancyAt, now);
    for (const age of ageBuckets(listing.ageMinMonths, listing.ageMaxMonths)) {
      const cur = row(city, age);
      cur.listings += 1;
      if (!open) continue;
      const spots =
        age === "infant"
          ? listing.spotsInfant
          : age === "toddler"
            ? listing.spotsToddler
            : age === "preschool"
              ? listing.spotsPreschool
              : 0;
      if (spots > 0) cur.confirmedOpenings += 1;
    }
  }

  return [...map.values()].sort((a, b) => b.searches - a.searches || b.spotRequests - a.spotRequests || a.city.localeCompare(b.city) || a.ageGroup.localeCompare(b.ageGroup));
}

export function demandSupplyCsv(rows: DemandSupplyRow[]) {
  const header = "day,city,age_group,searches,saves,spot_requests,listings,confirmed_openings";
  const lines = rows.map((row) =>
    [
      row.day,
      `"${row.city.replace(/"/g, "")}"`,
      row.ageGroup,
      row.searches,
      row.saves,
      row.spotRequests,
      row.listings,
      row.confirmedOpenings,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
