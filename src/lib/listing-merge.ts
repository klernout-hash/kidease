/**
 * Plan for retiring duplicate catalogue rows.
 * Dry-run by default. Nothing here opens a database or deletes a daycare row.
 * Licence status is not copied. A keeper licence is only normalized.
 */

import { catalogueLicenceKey } from "./catalog-match.ts";

export type DuplicateGroupInput = {
  basis?: string[];
  rows: Array<{
    id: string;
    slug?: string | null;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    postalCode?: string | null;
    license_number?: string | null;
    licenseNumber?: string | null;
    claim_status?: string | null;
    claimStatus?: string | null;
    created_at?: string | null;
    createdAt?: string | null;
  }>;
};

export type MergeListingFacts = {
  id: string;
  slug?: string | null;
  name?: string | null;
  province?: string | null;
  claimedAt?: string | null;
  claimStatus?: string | null;
  createdAt?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  description?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  photoCount?: number | null;
  photos?: string | null;
  enquiryCount?: number | null;
  leadCount?: number | null;
  messageCount?: number | null;
  listingActive?: number | boolean | null;
  mergedInto?: string | null;
};

export type MergeConversation = { id: string; userId: string };

export type MergeChildInventory = {
  daycareId: string;
  enquiryIds?: string[];
  tourIds?: string[];
  leadIds?: string[];
  savedUserIds?: string[];
  reviewIds?: string[];
  availabilityMonths?: string[];
  viewDays?: string[];
  conversations?: MergeConversation[];
  photos?: string | null;
  photoCount?: number | null;
};

export type MergeFieldFill = {
  website?: string;
  contactEmail?: string;
  phone?: string;
  postalCode?: string;
};

export type MergeMovedChildren = {
  enquiryIds: string[];
  tourIds: string[];
  leadIds: string[];
  savedUserIds: string[];
  reviewIds: string[];
  availabilityMonths: string[];
  viewDays: string[];
  conversationIds: string[];
  photosCopied: boolean;
};

export type MergeRetiredMove = {
  retiredId: string;
  moved: MergeMovedChildren;
  /** Photo text copied onto the keeper, when this retired row supplied it. */
  photos: string | null;
};

export type MergeGroupPlan = {
  keeperId: string;
  retiredIds: string[];
  alreadyRetiredIds: string[];
  conflictIds: string[];
  fieldFills: MergeFieldFill;
  keeperLicence: string | null;
  moved: MergeMovedChildren;
  retiredMoves: MergeRetiredMove[];
};

export type MergePlan = {
  groups: MergeGroupPlan[];
  skipped: Array<{ ids: string[]; reason: string }>;
  keepers: number;
  retired: number;
  fieldsFilled: number;
  childRecordsMoved: number;
};

const CLAIMED = new Set(["approved", "live", "active", "published", "pending", "waiting", "verified"]);

function blank(value: string | null | undefined): boolean {
  return !(value || "").trim();
}

function text(value: string | null | undefined): string {
  return (value || "").trim();
}

export function factsFromGroupRow(row: DuplicateGroupInput["rows"][number]): MergeListingFacts {
  const claimStatus = text(row.claimStatus || row.claim_status || "unclaimed") || "unclaimed";
  return {
    id: row.id,
    slug: row.slug || "",
    name: row.name || "",
    province: row.province || "",
    claimStatus,
    claimedAt: null,
    createdAt: row.createdAt || row.created_at || "",
    postalCode: row.postalCode || row.postal_code || "",
    licenseNumber: row.licenseNumber || row.license_number || "",
    website: "",
    contactEmail: "",
    phone: "",
    photoCount: 0,
    enquiryCount: 0,
    leadCount: 0,
    messageCount: 0,
    mergedInto: null,
  };
}

function claimed(row: MergeListingFacts): boolean {
  if (text(row.claimedAt)) return true;
  return CLAIMED.has(text(row.claimStatus).toLowerCase());
}

function activity(row: MergeListingFacts): number {
  return (row.enquiryCount || 0) + (row.leadCount || 0) + (row.messageCount || 0);
}

function completeness(row: MergeListingFacts): number {
  let score = 0;
  const min = row.ageMinMonths || 0;
  const max = row.ageMaxMonths || 0;
  if (max > min && max > 0) score += 2;
  else if (max > 0 || min > 0) score += 1;
  if (row.infantMonthly != null) score += 1;
  if (row.toddlerMonthly != null) score += 1;
  if (row.preschoolMonthly != null) score += 1;
  if (row.partTimeMonthly != null) score += 1;
  if (text(row.description).length >= 40) score += 2;
  else if (text(row.description)) score += 1;
  return score;
}

function createdMs(row: MergeListingFacts): number {
  const ms = Date.parse(row.createdAt || "");
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** Keeper order: claimed, then enquiries/leads/messages, then photos, then completeness, then oldest. */
export function compareKeeper(a: MergeListingFacts, b: MergeListingFacts): number {
  const claimDelta = Number(claimed(b)) - Number(claimed(a));
  if (claimDelta) return claimDelta;
  const activityDelta = activity(b) - activity(a);
  if (activityDelta) return activityDelta;
  const photoDelta = Number((b.photoCount || 0) > 0) - Number((a.photoCount || 0) > 0);
  if (photoDelta) return photoDelta;
  const completeDelta = completeness(b) - completeness(a);
  if (completeDelta) return completeDelta;
  const ageDelta = createdMs(a) - createdMs(b);
  if (ageDelta) return ageDelta;
  return a.id.localeCompare(b.id);
}

function fillFrom(keeper: MergeListingFacts, retired: MergeListingFacts[], key: keyof MergeFieldFill, factKey: keyof MergeListingFacts): string | undefined {
  if (!blank(keeper[factKey] as string | null | undefined)) return undefined;
  const ordered = [...retired].sort((a, b) => createdMs(a) - createdMs(b) || a.id.localeCompare(b.id));
  for (const row of ordered) {
    const value = text(row[factKey] as string | null | undefined);
    if (value) return value;
  }
  return undefined;
}

function list(values: string[] | undefined): string[] {
  return (values || []).map((value) => value.trim()).filter(Boolean);
}

function emptyMoved(): MergeMovedChildren {
  return {
    enquiryIds: [],
    tourIds: [],
    leadIds: [],
    savedUserIds: [],
    reviewIds: [],
    availabilityMonths: [],
    viewDays: [],
    conversationIds: [],
    photosCopied: false,
  };
}

type MoveState = {
  saved: Set<string>;
  months: Set<string>;
  days: Set<string>;
  users: Set<string>;
  photosTaken: boolean;
};

function absorbRetired(state: MoveState, row: MergeChildInventory): { moved: MergeMovedChildren; photos: string | null } {
  const moved = emptyMoved();
  moved.enquiryIds.push(...list(row.enquiryIds));
  moved.tourIds.push(...list(row.tourIds));
  moved.leadIds.push(...list(row.leadIds));
  moved.reviewIds.push(...list(row.reviewIds));
  for (const userId of list(row.savedUserIds)) {
    if (state.saved.has(userId)) continue;
    state.saved.add(userId);
    moved.savedUserIds.push(userId);
  }
  for (const month of list(row.availabilityMonths)) {
    if (state.months.has(month)) continue;
    state.months.add(month);
    moved.availabilityMonths.push(month);
  }
  for (const day of list(row.viewDays)) {
    if (state.days.has(day)) continue;
    state.days.add(day);
    moved.viewDays.push(day);
  }
  for (const conversation of row.conversations || []) {
    const userId = text(conversation.userId);
    const id = text(conversation.id);
    if (!id || !userId || state.users.has(userId)) continue;
    state.users.add(userId);
    moved.conversationIds.push(id);
  }
  let photos: string | null = null;
  if (!state.photosTaken && !blank(row.photos)) {
    moved.photosCopied = true;
    state.photosTaken = true;
    photos = text(row.photos);
  }
  return { moved, photos };
}

function concatMoved(target: MergeMovedChildren, extra: MergeMovedChildren) {
  target.enquiryIds.push(...extra.enquiryIds);
  target.tourIds.push(...extra.tourIds);
  target.leadIds.push(...extra.leadIds);
  target.savedUserIds.push(...extra.savedUserIds);
  target.reviewIds.push(...extra.reviewIds);
  target.availabilityMonths.push(...extra.availabilityMonths);
  target.viewDays.push(...extra.viewDays);
  target.conversationIds.push(...extra.conversationIds);
  if (extra.photosCopied) target.photosCopied = true;
}

function moveChildren(
  keeper: MergeChildInventory | undefined,
  retired: MergeChildInventory[],
): { moved: MergeMovedChildren; retiredMoves: MergeRetiredMove[] } {
  const state: MoveState = {
    saved: new Set(list(keeper?.savedUserIds)),
    months: new Set(list(keeper?.availabilityMonths)),
    days: new Set(list(keeper?.viewDays)),
    users: new Set((keeper?.conversations || []).map((row) => row.userId).filter(Boolean)),
    photosTaken: (keeper?.photoCount || 0) > 0 || !blank(keeper?.photos),
  };
  const moved = emptyMoved();
  const retiredMoves: MergeRetiredMove[] = [];
  for (const row of retired) {
    const one = absorbRetired(state, row);
    concatMoved(moved, one.moved);
    retiredMoves.push({ retiredId: row.daycareId, moved: one.moved, photos: one.photos });
  }
  return { moved, retiredMoves };
}

export function countMoved(moved: MergeMovedChildren): number {
  return (
    moved.enquiryIds.length +
    moved.tourIds.length +
    moved.leadIds.length +
    moved.savedUserIds.length +
    moved.reviewIds.length +
    moved.availabilityMonths.length +
    moved.viewDays.length +
    moved.conversationIds.length +
    (moved.photosCopied ? 1 : 0)
  );
}

function countFills(fills: MergeFieldFill): number {
  return [fills.website, fills.contactEmail, fills.phone, fills.postalCode].filter(Boolean).length;
}

/**
 * One group. Already-retired rows that point at the keeper are left alone.
 * A row that already points somewhere else is a conflict and is not moved.
 */
export function planMergeGroup(
  facts: MergeListingFacts[],
  children: Map<string, MergeChildInventory> = new Map(),
): MergeGroupPlan | { skip: string } {
  const unique = new Map<string, MergeListingFacts>();
  for (const row of facts) {
    if (row.id) unique.set(row.id, row);
  }
  const rows = [...unique.values()];
  if (rows.length < 2) return { skip: "fewer than two rows" };
  const open = rows.filter((row) => !text(row.mergedInto));
  if (open.length === 0) return { skip: "already merged" };
  const keeper = [...open].sort(compareKeeper)[0];
  const retired = open.filter((row) => row.id !== keeper.id);
  const alreadyRetiredIds = rows.filter((row) => text(row.mergedInto) === keeper.id).map((row) => row.id);
  const conflictIds = rows
    .filter((row) => text(row.mergedInto) && text(row.mergedInto) !== keeper.id)
    .map((row) => row.id);
  const fieldFills: MergeFieldFill = {};
  const website = fillFrom(keeper, retired, "website", "website");
  const contactEmail = fillFrom(keeper, retired, "contactEmail", "contactEmail");
  const phone = fillFrom(keeper, retired, "phone", "phone");
  const postalCode = fillFrom(keeper, retired, "postalCode", "postalCode");
  if (website) fieldFills.website = website;
  if (contactEmail) fieldFills.contactEmail = contactEmail;
  if (phone) fieldFills.phone = phone;
  if (postalCode) fieldFills.postalCode = postalCode;
  const normalized = catalogueLicenceKey(keeper.licenseNumber);
  const keeperLicence = normalized && normalized !== text(keeper.licenseNumber) ? normalized : null;
  const { moved, retiredMoves } = moveChildren(
    children.get(keeper.id),
    retired.map((row) => children.get(row.id) || { daycareId: row.id }),
  );
  return {
    keeperId: keeper.id,
    retiredIds: retired.map((row) => row.id),
    alreadyRetiredIds,
    conflictIds,
    fieldFills,
    keeperLicence,
    moved,
    retiredMoves,
  };
}

export function planDuplicateMerges(
  groups: DuplicateGroupInput[],
  factsById: Map<string, MergeListingFacts> = new Map(),
  children: Map<string, MergeChildInventory> = new Map(),
): MergePlan {
  const planned: MergeGroupPlan[] = [];
  const skipped: Array<{ ids: string[]; reason: string }> = [];
  for (const group of groups) {
    const facts = group.rows.map((row) => {
      const base = factsFromGroupRow(row);
      const extra = factsById.get(row.id);
      return extra ? { ...base, ...extra, id: row.id } : base;
    });
    const result = planMergeGroup(facts, children);
    if ("skip" in result) {
      skipped.push({ ids: group.rows.map((row) => row.id), reason: result.skip });
      continue;
    }
    if (result.retiredIds.length === 0) {
      skipped.push({ ids: group.rows.map((row) => row.id), reason: "already merged" });
      continue;
    }
    planned.push(result);
  }
  return {
    groups: planned,
    skipped,
    keepers: planned.length,
    retired: planned.reduce((sum, group) => sum + group.retiredIds.length, 0),
    fieldsFilled: planned.reduce((sum, group) => sum + countFills(group.fieldFills), 0),
    childRecordsMoved: planned.reduce((sum, group) => sum + countMoved(group.moved), 0),
  };
}

function sqlLiteral(value: string | null): string {
  if (value === null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

export type MergeRollbackInput = {
  keeperId: string;
  retiredId: string;
  retiredClaimStatus: string;
  retiredListingActive: number;
  fills: MergeFieldFill;
  keeperBefore: MergeFieldFill & { photos?: string | null; licenseNumber?: string | null };
  keeperLicence: string | null;
  moved: MergeMovedChildren;
  retiredPhotos?: string | null;
};

/**
 * Guarded undo. Each statement checks the value this merge wrote.
 * It never deletes a daycare row.
 */
export function buildRollbackSql(rows: MergeRollbackInput[]): string {
  const lines = [
    "-- Guarded rollback for a KidEase duplicate merge.",
    "-- Each update matches the keeper or retired id AND the value this merge wrote.",
    "-- Do not run this against a database that has since edited those fields.",
    "begin;",
  ];
  for (const row of rows) {
    lines.push(
      `update daycares set merged_into = null, listing_active = ${Number(row.retiredListingActive) === 0 ? 0 : 1}, claim_status = ${sqlLiteral(row.retiredClaimStatus || "unclaimed")} where id = ${sqlLiteral(row.retiredId)} and merged_into = ${sqlLiteral(row.keeperId)};`,
    );
    for (const key of ["website", "contactEmail", "phone", "postalCode"] as const) {
      const column = key === "contactEmail" ? "contact_email" : key === "postalCode" ? "postal_code" : key;
      const written = row.fills[key];
      if (!written) continue;
      const before = row.keeperBefore[key] ?? null;
      lines.push(
        `update daycares set ${column} = ${sqlLiteral(before)} where id = ${sqlLiteral(row.keeperId)} and ${column} is not distinct from ${sqlLiteral(written)};`,
      );
    }
    if (row.keeperLicence) {
      lines.push(
        `update daycares set license_number = ${sqlLiteral(row.keeperBefore.licenseNumber ?? null)} where id = ${sqlLiteral(row.keeperId)} and license_number is not distinct from ${sqlLiteral(row.keeperLicence)};`,
      );
    }
    if (row.moved.photosCopied) {
      lines.push(
        `update daycares set photos = ${sqlLiteral(row.keeperBefore.photos ?? null)} where id = ${sqlLiteral(row.keeperId)} and photos is not distinct from ${sqlLiteral(row.retiredPhotos ?? null)};`,
      );
    }
    const moves: Array<[string, string, string[]]> = [
      ["bookings", "id", row.moved.enquiryIds],
      ["tour_requests", "id", row.moved.tourIds],
      ["lead_requests", "id", row.moved.leadIds],
      ["reviews", "id", row.moved.reviewIds],
      ["conversations", "id", row.moved.conversationIds],
    ];
    for (const [table, column, ids] of moves) {
      if (ids.length === 0) continue;
      const listSql = ids.map((id) => sqlLiteral(id)).join(", ");
      lines.push(
        `update ${table} set daycare_id = ${sqlLiteral(row.retiredId)} where ${column} in (${listSql}) and daycare_id = ${sqlLiteral(row.keeperId)};`,
      );
    }
    for (const userId of row.moved.savedUserIds) {
      lines.push(
        `update saved_daycares set daycare_id = ${sqlLiteral(row.retiredId)} where user_id = ${sqlLiteral(userId)} and daycare_id = ${sqlLiteral(row.keeperId)};`,
      );
    }
    for (const month of row.moved.availabilityMonths) {
      lines.push(
        `update availability set daycare_id = ${sqlLiteral(row.retiredId)} where daycare_id = ${sqlLiteral(row.keeperId)} and month = ${sqlLiteral(month)} and not exists (select 1 from availability existing where existing.daycare_id = ${sqlLiteral(row.retiredId)} and existing.month = ${sqlLiteral(month)});`,
      );
    }
    for (const day of row.moved.viewDays) {
      lines.push(
        `update daycare_views set daycare_id = ${sqlLiteral(row.retiredId)} where daycare_id = ${sqlLiteral(row.keeperId)} and viewed_on = ${sqlLiteral(day)} and not exists (select 1 from daycare_views existing where existing.daycare_id = ${sqlLiteral(row.retiredId)} and existing.viewed_on = ${sqlLiteral(day)});`,
      );
    }
  }
  lines.push("commit;");
  return `${lines.join("\n")}\n`;
}

/** One guarded undo row per retired listing. Keeper field restores are attached once. */
export function rollbackInputsForPlan(
  plan: MergePlan,
  factsById: Map<string, MergeListingFacts>,
): MergeRollbackInput[] {
  const inputs: MergeRollbackInput[] = [];
  for (const group of plan.groups) {
    const keeper = factsById.get(group.keeperId);
    group.retiredMoves.forEach((move, index) => {
      const retired = factsById.get(move.retiredId);
      const active = retired?.listingActive;
      const listingActive = active == null ? 1 : Number(active) ? 1 : 0;
      inputs.push({
        keeperId: group.keeperId,
        retiredId: move.retiredId,
        retiredClaimStatus: text(retired?.claimStatus) || "unclaimed",
        retiredListingActive: listingActive,
        fills: index === 0 ? group.fieldFills : {},
        keeperBefore: {
          website: text(keeper?.website) || undefined,
          contactEmail: text(keeper?.contactEmail) || undefined,
          phone: text(keeper?.phone) || undefined,
          postalCode: text(keeper?.postalCode) || undefined,
          photos: text(keeper?.photos) || null,
          licenseNumber: text(keeper?.licenseNumber) || null,
        },
        keeperLicence: index === 0 ? group.keeperLicence : null,
        moved: move.moved,
        retiredPhotos: move.photos,
      });
    });
  }
  return inputs;
}

export type MergedHop = {
  id: string;
  mergedInto?: string | null;
  importFault?: string | null;
};

/** Follow merged_into. Cycles and a missing keeper resolve to nothing. Import faults stay hidden. */
export function followMergedListing<T extends MergedHop>(
  start: T,
  lookup: (id: string) => T | undefined,
  maxHops = 4,
): T | null {
  let current = start;
  const seen = new Set<string>();
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (!current.id || seen.has(current.id)) return null;
    seen.add(current.id);
    const nextId = text(current.mergedInto);
    if (!nextId) {
      if (text(current.importFault)) return null;
      return current;
    }
    const next = lookup(nextId);
    if (!next) return null;
    current = next;
  }
  return null;
}
