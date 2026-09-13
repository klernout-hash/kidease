/**
 * Provider Listing Verified coach — Canada blockers vs nice-to-have.
 * Listing Verified is a desk readiness state, not a public Superhost score.
 * KidEase is not the regulator and does not issue licences or VSCs.
 */

const CA_PROVINCE_CODES = [
  "BC",
  "AB",
  "SK",
  "MB",
  "ON",
  "QC",
  "NB",
  "NS",
  "PE",
  "NL",
  "YT",
  "NT",
  "NU",
] as const;

export const VERIFIED_BLOCKERS = [
  "license",
  "province",
  "hours",
  "ages",
  "capacity",
  "fees",
  "photo",
  "screening",
] as const;
export type VerifiedBlocker = (typeof VERIFIED_BLOCKERS)[number];

export const VERIFIED_NICE = ["subsidy", "policies", "vacancy"] as const;
export type VerifiedNice = (typeof VERIFIED_NICE)[number];

export type ListingCoachFocus =
  | "license"
  | "province"
  | "hours"
  | "ages"
  | "capacity"
  | "fees"
  | "photo"
  | "screening"
  | "subsidy"
  | "policies"
  | "vacancy";

export type ListingCoachDesk = "listings" | "licence" | "screening";

export type ListingCoachHref = {
  desk: ListingCoachDesk;
  focus?: ListingCoachFocus;
};

/** Fee-program provinces — same set as listing-readiness / licensing. */
const FEE_PROGRAM = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU", "QC", "AB"]);
const CA_PROVINCE = new Set<string>(CA_PROVINCE_CODES);

export const COACH_FOCUS_ANCHOR: Record<ListingCoachFocus, string> = {
  license: "listing-health-license",
  province: "listing-health-province",
  hours: "listing-health-hours",
  ages: "listing-health-ages",
  capacity: "listing-health-capacity",
  fees: "listing-health-fees",
  photo: "listing-health-photo",
  screening: "listing-coach-screening",
  subsidy: "listing-health-subsidy",
  policies: "listing-health-policies",
  vacancy: "listing-health-vacancy",
};

export const COACH_ITEM_HREF: Record<VerifiedBlocker | VerifiedNice, ListingCoachHref> = {
  license: { desk: "licence", focus: "license" },
  province: { desk: "listings", focus: "province" },
  hours: { desk: "listings", focus: "hours" },
  ages: { desk: "listings", focus: "ages" },
  capacity: { desk: "licence", focus: "capacity" },
  fees: { desk: "listings", focus: "fees" },
  photo: { desk: "listings", focus: "photo" },
  screening: { desk: "screening", focus: "screening" },
  subsidy: { desk: "listings", focus: "subsidy" },
  policies: { desk: "listings", focus: "policies" },
  vacancy: { desk: "listings", focus: "vacancy" },
};

export type ListingVerifiedInput = {
  id?: string | null;
  province?: string | null;
  hours?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  licensedCapacity?: number | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  photos?: string[] | null;
  screeningOnFile?: boolean | null;
  lastVacancyUpdatedAt?: string | null;
  spotsUpdatedAt?: string | null;
  financial?: { subsidy?: boolean; sliding?: boolean; sibling?: boolean; meals?: boolean } | null;
  safetyFeatures?: string[] | null;
};

export type ListingCoachItem = {
  id: VerifiedBlocker | VerifiedNice;
  kind: "blocker" | "nice";
  done: boolean;
  href: ListingCoachHref;
};

export type ListingVerifiedCoach = {
  verified: boolean;
  blockers: ListingCoachItem[];
  nice: ListingCoachItem[];
  missingBlockers: VerifiedBlocker[];
  missingNice: VerifiedNice[];
  next: ListingCoachItem | null;
};

function officialLicenceNumber(raw?: string | null, id?: string | null): string | null {
  const n = (raw || "").trim();
  if (!n || n === "—" || n.toLowerCase() === "unknown") return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}

function isRealListingPhoto(src?: string | null): boolean {
  const p = (src || "").trim();
  if (!p) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("-logo")) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

export function hasListedProvince(province?: string | null): boolean {
  const code = (province || "").trim().toUpperCase();
  return CA_PROVINCE.has(code);
}

export function hasVerifiedLicense(item: Pick<ListingVerifiedInput, "licenseNumber" | "id" | "licenseStatus">): boolean {
  const status = (item.licenseStatus || "").trim().toLowerCase();
  if (status === "expired" || status === "suspended") return false;
  const n = officialLicenceNumber(item.licenseNumber, item.id);
  if (!n) return false;
  if (n === item.id || n === (item.id || "").split("-").pop()) return false;
  return true;
}

export function hasListedHours(hours?: string | null): boolean {
  const v = (hours || "").trim();
  if (!v || v === "—" || v === "-") return false;
  if (/^hours not/i.test(v) || /^see (the )?centre/i.test(v) || /^tbd$/i.test(v)) return false;
  return v.length >= 4;
}

export function hasConfirmedAges(item: Pick<ListingVerifiedInput, "agesKnown" | "ageMinMonths" | "ageMaxMonths">): boolean {
  if (item.agesKnown === false) return false;
  if (item.agesKnown) return true;
  const min = item.ageMinMonths ?? 0;
  const max = item.ageMaxMonths ?? 0;
  return max > min && max > 0;
}

export function hasListedCapacity(capacity?: number | null): boolean {
  return typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0;
}

export function hasFeeOrProgram(
  item: Pick<
    ListingVerifiedInput,
    "province" | "infantMonthly" | "toddlerMonthly" | "preschoolMonthly" | "partTimeMonthly"
  >,
): boolean {
  if (FEE_PROGRAM.has((item.province || "").trim().toUpperCase())) return true;
  return [item.infantMonthly, item.toddlerMonthly, item.preschoolMonthly, item.partTimeMonthly].some(
    (n) => n != null && n > 0,
  );
}

export function hasRealPhoto(photos?: string[] | null): boolean {
  return (photos ?? []).some((p) => isRealListingPhoto(p));
}

export function hasScreeningOnFile(onFile?: boolean | null): boolean {
  return Boolean(onFile);
}

export function hasSubsidyNotes(
  item: Pick<ListingVerifiedInput, "province" | "financial">,
): boolean {
  if (FEE_PROGRAM.has((item.province || "").trim().toUpperCase())) return true;
  const financial = item.financial;
  if (!financial) return false;
  return Boolean(financial.subsidy || financial.sliding || financial.sibling || financial.meals);
}

export function hasPolicyNotes(safetyFeatures?: string[] | null): boolean {
  return (safetyFeatures ?? []).some((key) => Boolean(key && key.trim()));
}

export function hasVacancyConfirm(item: Pick<ListingVerifiedInput, "lastVacancyUpdatedAt" | "spotsUpdatedAt">): boolean {
  return Boolean(item.lastVacancyUpdatedAt || item.spotsUpdatedAt);
}

function item(id: VerifiedBlocker, done: boolean): ListingCoachItem {
  return { id, kind: "blocker", done, href: COACH_ITEM_HREF[id] };
}

function nice(id: VerifiedNice, done: boolean): ListingCoachItem {
  return { id, kind: "nice", done, href: COACH_ITEM_HREF[id] };
}

export function listingVerifiedCoach(input: ListingVerifiedInput): ListingVerifiedCoach {
  const blockers: ListingCoachItem[] = [
    item("license", hasVerifiedLicense(input)),
    item("province", hasListedProvince(input.province)),
    item("hours", hasListedHours(input.hours)),
    item("ages", hasConfirmedAges(input)),
    item("capacity", hasListedCapacity(input.licensedCapacity)),
    item("fees", hasFeeOrProgram(input)),
    item("photo", hasRealPhoto(input.photos)),
    item("screening", hasScreeningOnFile(input.screeningOnFile)),
  ];
  const niceItems: ListingCoachItem[] = [
    nice("subsidy", hasSubsidyNotes(input)),
    nice("policies", hasPolicyNotes(input.safetyFeatures)),
    nice("vacancy", hasVacancyConfirm(input)),
  ];
  const missingBlockers = blockers.filter((row) => !row.done).map((row) => row.id as VerifiedBlocker);
  const missingNice = niceItems.filter((row) => !row.done).map((row) => row.id as VerifiedNice);
  return {
    verified: missingBlockers.length === 0,
    blockers,
    nice: niceItems,
    missingBlockers,
    missingNice,
    next: blockers.find((row) => !row.done) ?? niceItems.find((row) => !row.done) ?? null,
  };
}

export function isListingVerified(input: ListingVerifiedInput): boolean {
  return listingVerifiedCoach(input).verified;
}

export function listingCoachDesks(coach: ListingVerifiedCoach): ListingCoachHref[] {
  const seen = new Set<string>();
  const hrefs: ListingCoachHref[] = [];
  for (const row of coach.blockers) {
    if (row.done) continue;
    if (seen.has(row.href.desk)) continue;
    seen.add(row.href.desk);
    hrefs.push(row.href);
  }
  return hrefs;
}

export function listingCoachDesksForListings(listings: ListingVerifiedInput[]): ListingCoachHref[] {
  const seen = new Set<string>();
  const hrefs: ListingCoachHref[] = [];
  for (const listing of listings) {
    for (const href of listingCoachDesks(listingVerifiedCoach(listing))) {
      if (seen.has(href.desk)) continue;
      seen.add(href.desk);
      hrefs.push(href);
    }
  }
  return hrefs;
}
