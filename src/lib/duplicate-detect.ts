/**
 * Dry-run duplicate groups for listings.
 * Nothing here opens a database, writes a row, or retires a claimed listing.
 * d_d85jtifbkh2t and kids-world-daycare-kh2t are left out of every group.
 */

import { listingOwned, PROTECTED_MERGE_SLUGS, type MergeListingFacts } from "./listing-merge.ts";

export const PROTECTED_DUPLICATE_ID = "d_d85jtifbkh2t";

export type DetectListing = {
  id: string;
  slug?: string | null;
  name?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  claimed?: boolean;
  ownerCount?: number;
  claimStatus?: string | null;
  claimedAt?: string | null;
  createdAt?: string | null;
};

export type DuplicatePlan = {
  reason: "licence" | "phone" | "name_postal";
  key: string;
  keeperId: string;
  retiredIds: string[];
  redirectTo: string;
};

export type DuplicateSkip = {
  reason: "licence" | "phone" | "name_postal";
  key: string;
  ids: string[];
  skip: "both_claimed" | "protected" | "too_small";
};

function fold(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function licenceKey(value: string | null | undefined) {
  const key = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key.length >= 4 ? key : "";
}

function phoneKey(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

function postalKey(value: string | null | undefined) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function listingProtected(row: Pick<DetectListing, "id" | "slug">) {
  if (row.id === PROTECTED_DUPLICATE_ID) return true;
  const slug = String(row.slug || "").trim().toLowerCase();
  if (!slug) return false;
  return PROTECTED_MERGE_SLUGS.has(slug) || slug === "kids-world-daycare-kh2t";
}

function owned(row: DetectListing) {
  const facts = {
    id: row.id,
    ownerCount: row.ownerCount || 0,
    claimedAt: row.claimed ? row.claimedAt || "set" : row.claimedAt || "",
    claimStatus: row.claimStatus || "",
  } as MergeListingFacts;
  return listingOwned(facts);
}

function clusters(rows: DetectListing[], reason: DuplicatePlan["reason"], keyOf: (row: DetectListing) => string) {
  const groups = new Map<string, DetectListing[]>();
  for (const row of rows) {
    if (listingProtected(row)) continue;
    const key = keyOf(row);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, members]) => ({ reason, key, members }));
}

function planCluster(reason: DuplicatePlan["reason"], key: string, members: DetectListing[]): DuplicatePlan | DuplicateSkip {
  const unique = new Map<string, DetectListing>();
  for (const row of members) unique.set(row.id, row);
  const rows = [...unique.values()];
  if (rows.length < 2) return { reason, key, ids: rows.map((row) => row.id), skip: "too_small" };
  const claimed = rows.filter(owned);
  if (claimed.length >= 2) return { reason, key, ids: rows.map((row) => row.id), skip: "both_claimed" };
  const keeper = claimed[0] ?? rows.slice().sort((a, b) => {
    const created = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if (created !== 0) return created;
    return a.id.localeCompare(b.id);
  })[0]!;
  const retiredIds = rows.filter((row) => row.id !== keeper.id && !owned(row)).map((row) => row.id);
  if (!retiredIds.length) return { reason, key, ids: rows.map((row) => row.id), skip: "both_claimed" };
  return { reason, key, keeperId: keeper.id, retiredIds, redirectTo: keeper.id };
}

/**
 * Groups by licence, then phone, then name plus postal.
 * A protected listing is never in a group. A claimed listing is never retired.
 * Retired ids are the ones that should 301 to the keeper. This function does not write that.
 */
export function planSafeDuplicateGroups(rows: DetectListing[]): { plans: DuplicatePlan[]; skipped: DuplicateSkip[] } {
  const open = rows.filter((row) => row.id && !listingProtected(row));
  const used = new Set<string>();
  const plans: DuplicatePlan[] = [];
  const skipped: DuplicateSkip[] = [];
  const passes = [
    clusters(open, "licence", (row) => licenceKey(row.licenseNumber)),
    clusters(open, "phone", (row) => phoneKey(row.phone)),
    clusters(open, "name_postal", (row) => {
      const name = fold(row.name);
      const postal = postalKey(row.postalCode);
      if (!name || postal.length < 6) return "";
      return `${name}|${postal}`;
    }),
  ];
  for (const pass of passes) {
    for (const cluster of pass) {
      const members = cluster.members.filter((row) => !used.has(row.id));
      const result = planCluster(cluster.reason, cluster.key, members);
      if ("skip" in result) {
        if (result.skip !== "too_small") skipped.push(result);
        continue;
      }
      plans.push(result);
      used.add(result.keeperId);
      for (const id of result.retiredIds) used.add(id);
    }
  }
  return { plans, skipped };
}
