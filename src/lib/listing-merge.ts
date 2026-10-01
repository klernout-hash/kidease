/**
 * Plan for retiring duplicate catalogue rows.
 * Dry-run by default. Nothing here opens a database or deletes a daycare row.
 * Licence status is not copied. A keeper licence is only normalized.
 */

import { catalogueHoldReason, catalogueLicenceKey, cataloguePostalKey, hasRealStreetAddress, sameCatalogueCentre } from "./catalog-match.ts";
import { HIDDEN_REVIEW_POSSIBLE_SECOND_SITE, LISTING_VISIBILITY } from "./listing-visibility.ts";

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
  address?: string | null;
  city?: string | null;
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
  visibility?: string | null;
  mergedInto?: string | null;
  importFault?: string | null;
  /** Owners, approved claims, or staff links. A claimed listing stays the keeper. */
  ownerCount?: number | null;
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
  waitlistUserIds?: string[];
  /** listing_claims ids to move when the keeper has no claim for that user. */
  claimIds?: string[];
  /** provider_daycares user ids to move when the keeper has no row for that user. */
  ownerUserIds?: string[];
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
  waitlistUserIds: string[];
  claimIds: string[];
  ownerUserIds: string[];
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
  /** Same group, but not the same centre. Left live. */
  unrelatedIds: string[];
  /** Same licence or same name, but the addresses disagree. Hidden, not merged. */
  needsReview: MergeReviewItem[];
  /** Newer or non-street copy hidden. merged_into stays null. */
  hiddenReviews: HiddenReviewAction[];
};

export type HiddenReviewAction = {
  liveId: string;
  hiddenId: string;
  names: string[];
  addresses: string[];
  city: string;
  province: string;
  reason: string;
  flag: typeof HIDDEN_REVIEW_POSSIBLE_SECOND_SITE;
  listingActive: 0;
  visibility: typeof LISTING_VISIBILITY.adminOnly;
};

export type MergeReviewItem = {
  ids: string[];
  names: string[];
  addresses: string[];
  reason: string;
};

export type MergePlan = {
  groups: MergeGroupPlan[];
  skipped: Array<{ ids: string[]; reason: string }>;
  needsReview: MergeReviewItem[];
  hiddenReviews: HiddenReviewAction[];
  keepers: number;
  retired: number;
  fieldsFilled: number;
  childRecordsMoved: number;
  hiddenReview: number;
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
    address: row.address || "",
    city: row.city || "",
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
    importFault: null,
    visibility: LISTING_VISIBILITY.public,
  };
}

/** Claimed, owner-linked, or otherwise not free to retire. */
export function listingOwned(row: MergeListingFacts): boolean {
  if ((row.ownerCount || 0) > 0) return true;
  if (text(row.claimedAt)) return true;
  return CLAIMED.has(text(row.claimStatus).toLowerCase());
}

function claimed(row: MergeListingFacts): boolean {
  return listingOwned(row);
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

/**
 * Keeper order: a real street address, then claimed, then enquiries/leads/messages,
 * then photos, then completeness, then oldest.
 * A room or civic row is retired into the street row.
 */
export function compareKeeper(a: MergeListingFacts, b: MergeListingFacts): number {
  const streetDelta = Number(hasRealStreetAddress(b.address)) - Number(hasRealStreetAddress(a.address));
  if (streetDelta) return streetDelta;
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

/**
 * Which row stays public when two addresses must not merge.
 * A real street address wins, then the older row. A claim on the newer copy does not.
 */
export function compareLiveReview(a: MergeListingFacts, b: MergeListingFacts): number {
  const streetDelta = Number(hasRealStreetAddress(b.address)) - Number(hasRealStreetAddress(a.address));
  if (streetDelta) return streetDelta;
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
    waitlistUserIds: [],
    claimIds: [],
    ownerUserIds: [],
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
  for (const userId of list(row.waitlistUserIds)) {
    if (state.saved.has(`wait:${userId}`)) continue;
    state.saved.add(`wait:${userId}`);
    moved.waitlistUserIds.push(userId);
  }
  for (const claimId of list(row.claimIds)) {
    moved.claimIds.push(claimId);
  }
  for (const userId of list(row.ownerUserIds)) {
    if (state.users.has(`owner:${userId}`)) continue;
    state.users.add(`owner:${userId}`);
    moved.ownerUserIds.push(userId);
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
  target.waitlistUserIds.push(...(extra.waitlistUserIds || []));
  target.claimIds.push(...(extra.claimIds || []));
  target.ownerUserIds.push(...(extra.ownerUserIds || []));
  if (extra.photosCopied) target.photosCopied = true;
}

function moveChildren(
  keeper: MergeChildInventory | undefined,
  retired: MergeChildInventory[],
): { moved: MergeMovedChildren; retiredMoves: MergeRetiredMove[] } {
  const state: MoveState = {
    saved: new Set([
      ...list(keeper?.savedUserIds),
      ...list(keeper?.waitlistUserIds).map((userId) => `wait:${userId}`),
    ]),
    months: new Set(list(keeper?.availabilityMonths)),
    days: new Set(list(keeper?.viewDays)),
    users: new Set([
      ...(keeper?.conversations || []).map((row) => row.userId).filter(Boolean),
      ...list(keeper?.ownerUserIds).map((userId) => `owner:${userId}`),
    ]),
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
    (moved.waitlistUserIds || []).length +
    (moved.claimIds || []).length +
    (moved.ownerUserIds || []).length +
    (moved.photosCopied ? 1 : 0)
  );
}

function countFills(fills: MergeFieldFill): number {
  return [fills.website, fills.contactEmail, fills.phone, fills.postalCode].filter(Boolean).length;
}

function uniqueLabels(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const label = text(value);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function planHiddenReviews(
  rows: MergeListingFacts[],
  reviews: MergeReviewItem[],
  protectedIds: Set<string>,
): HiddenReviewAction[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const hidden = new Set<string>();
  const actions: HiddenReviewAction[] = [];
  for (const item of reviews) {
    const pair = item.ids.map((id) => byId.get(id)).filter((row): row is MergeListingFacts => Boolean(row));
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (hidden.has(a.id) || hidden.has(b.id)) continue;
    const aProtected = protectedIds.has(a.id);
    const bProtected = protectedIds.has(b.id);
    if (aProtected && bProtected) continue;
    let live: MergeListingFacts;
    let hide: MergeListingFacts;
    if (aProtected && !bProtected) {
      live = a;
      hide = b;
    } else if (bProtected && !aProtected) {
      live = b;
      hide = a;
    } else {
      const ordered = [a, b].sort(compareLiveReview);
      live = ordered[0];
      hide = ordered[1];
    }
    if (protectedIds.has(hide.id)) continue;
    hidden.add(hide.id);
    actions.push({
      liveId: live.id,
      hiddenId: hide.id,
      names: uniqueLabels([live.name, hide.name]),
      addresses: uniqueLabels([live.address, hide.address]),
      city: text(hide.city) || text(live.city),
      province: text(hide.province) || text(live.province),
      reason: item.reason,
      flag: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
      listingActive: 0,
      visibility: LISTING_VISIBILITY.adminOnly,
    });
  }
  return actions;
}

function reviewItems(rows: MergeListingFacts[]): MergeReviewItem[] {
  const items: MergeReviewItem[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const reason = catalogueHoldReason(rows[i], rows[j]);
      if (!reason) continue;
      items.push({
        ids: [rows[i].id, rows[j].id].sort((a, b) => a.localeCompare(b)),
        names: uniqueLabels([rows[i].name, rows[j].name]),
        addresses: uniqueLabels([rows[i].address, rows[j].address]),
        reason,
      });
    }
  }
  return items;
}

/**
 * One group. Already-retired rows that point at the keeper are left alone.
 * A row that already points somewhere else is a conflict and is not moved.
 * Two real streets, or a named venue with a different postal, hide the newer copy.
 * That hide does not set merged_into.
 */
export function planMergeGroup(
  facts: MergeListingFacts[],
  children: Map<string, MergeChildInventory> = new Map(),
): MergeGroupPlan | { skip: string; hiddenReviews?: HiddenReviewAction[] } {
  const unique = new Map<string, MergeListingFacts>();
  for (const row of facts) {
    if (row.id) unique.set(row.id, row);
  }
  const rows = [...unique.values()];
  if (rows.length < 2) return { skip: "fewer than two rows" };
  const open = rows.filter((row) => !text(row.mergedInto) && !text(row.importFault));
  if (open.length < 2) {
    if (rows.some((row) => text(row.importFault))) return { skip: "already hidden" };
    if (rows.some((row) => text(row.mergedInto)) || open.length === 0) return { skip: "already merged" };
    return { skip: "fewer than two rows" };
  }
  const reviews = reviewItems(open);
  const anchors = open.filter((row) => open.some((other) => other.id !== row.id && sameCatalogueCentre(row, other)));
  if (anchors.length === 0) {
    if (reviews.length > 0) return { skip: "hidden review", hiddenReviews: planHiddenReviews(open, reviews, new Set()) };
    return { skip: "not the same centre" };
  }
  const keeper = [...anchors].sort(compareKeeper)[0];
  const others = open.filter((row) => row.id !== keeper.id);
  const retired = others.filter((row) => sameCatalogueCentre(keeper, row));
  const unrelated = others.filter((row) => !sameCatalogueCentre(keeper, row));
  const unrelatedIds = unrelated.map((row) => row.id);
  const mergedIds = new Set([keeper.id, ...retired.map((row) => row.id)]);
  const held = reviews.filter((item) => item.ids.some((id) => !mergedIds.has(id)));
  const hiddenReviews = planHiddenReviews(open, held, mergedIds);
  if (retired.length === 0 && hiddenReviews.length > 0) {
    return { skip: "hidden review", hiddenReviews };
  }
  if (retired.length === 0 && unrelatedIds.length === 0) return { skip: "already merged" };
  if (retired.length === 0) return { skip: "not the same centre" };
  return retireIntoKeeper(keeper, retired, rows, children, unrelatedIds, hiddenReviews);
}

function retireIntoKeeper(
  keeper: MergeListingFacts,
  retired: MergeListingFacts[],
  rows: MergeListingFacts[],
  children: Map<string, MergeChildInventory>,
  unrelatedIds: string[] = [],
  hiddenReviews: HiddenReviewAction[] = [],
): MergeGroupPlan {
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
  if (postalCode && cataloguePostalKey(postalCode) !== "R3K0Z8") fieldFills.postalCode = postalCode;
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
    unrelatedIds,
    needsReview: [],
    hiddenReviews,
  };
}

/** Kids World stays public. A merge must not hide it or rewrite it. */
export const PROTECTED_MERGE_SLUGS = new Set(["kids-world-daycare-kh2t"]);

export type ExplicitDuplicatePair = {
  duplicateId: string;
  keeperId: string;
  duplicateSlug?: string | null;
  keeperSlug?: string | null;
};

export type ExplicitMergeSwap = {
  duplicateId: string;
  keeperId: string;
  duplicateSlug: string;
  keeperSlug: string;
};

export type ExplicitMergeSkip = {
  duplicateId: string;
  keeperId: string;
  reason: string;
};

function protectedListing(id: string, slug: string | null | undefined): boolean {
  const value = text(slug).toLowerCase();
  return PROTECTED_MERGE_SLUGS.has(value) || PROTECTED_MERGE_SLUGS.has(id.toLowerCase());
}

/**
 * Audited duplicate → keeper pairs. Does not re-check the street matcher.
 * A claimed or owner-linked listing stays the keeper. If both are claimed, the pair is skipped.
 * kids-world-daycare-kh2t is never retired and never rewritten.
 */
export function planExplicitDuplicateMerges(
  pairs: ExplicitDuplicatePair[],
  factsById: Map<string, MergeListingFacts> = new Map(),
  children: Map<string, MergeChildInventory> = new Map(),
): { plan: MergePlan; swaps: ExplicitMergeSwap[]; skipped: ExplicitMergeSkip[] } {
  const planned: MergeGroupPlan[] = [];
  const skipped: ExplicitMergeSkip[] = [];
  const swaps: ExplicitMergeSwap[] = [];
  const staying = new Set<string>();
  const retiring = new Set<string>();
  for (const pair of pairs) {
    const duplicateId = text(pair.duplicateId);
    const keeperId = text(pair.keeperId);
    if (!duplicateId || !keeperId || duplicateId === keeperId) {
      skipped.push({ duplicateId, keeperId, reason: "missing id" });
      continue;
    }
    if (
      protectedListing(duplicateId, pair.duplicateSlug) ||
      protectedListing(keeperId, pair.keeperSlug)
    ) {
      skipped.push({ duplicateId, keeperId, reason: "protected listing" });
      continue;
    }
    if (retiring.has(duplicateId) || retiring.has(keeperId) || staying.has(duplicateId)) {
      skipped.push({ duplicateId, keeperId, reason: "id already used in this plan" });
      continue;
    }
    const duplicate = factsById.get(duplicateId);
    const keeper = factsById.get(keeperId);
    const duplicateFacts = duplicate || {
      ...factsFromGroupRow({ id: duplicateId, slug: pair.duplicateSlug || "" }),
    };
    const keeperFacts = keeper || {
      ...factsFromGroupRow({ id: keeperId, slug: pair.keeperSlug || "" }),
    };
    if (protectedListing(duplicateFacts.id, duplicateFacts.slug) || protectedListing(keeperFacts.id, keeperFacts.slug)) {
      skipped.push({ duplicateId, keeperId, reason: "protected listing" });
      continue;
    }
    const duplicateOwned = listingOwned(duplicateFacts);
    const keeperOwned = listingOwned(keeperFacts);
    if (duplicateOwned && keeperOwned) {
      skipped.push({ duplicateId, keeperId, reason: "both claimed" });
      continue;
    }
    let stay = keeperFacts;
    let retire = duplicateFacts;
    if (duplicateOwned && !keeperOwned) {
      stay = duplicateFacts;
      retire = keeperFacts;
      swaps.push({
        duplicateId,
        keeperId: duplicateId,
        duplicateSlug: text(pair.duplicateSlug),
        keeperSlug: text(pair.keeperSlug),
      });
    }
    if (text(retire.mergedInto) === stay.id) {
      skipped.push({ duplicateId, keeperId, reason: "already merged" });
      continue;
    }
    if (text(retire.importFault) && !text(retire.mergedInto)) {
      skipped.push({ duplicateId, keeperId, reason: "already hidden" });
      continue;
    }
    if (retiring.has(stay.id) || staying.has(retire.id)) {
      skipped.push({ duplicateId, keeperId, reason: "id already used in this plan" });
      continue;
    }
    const group = retireIntoKeeper(stay, [retire], [stay, retire], children);
    planned.push(group);
    staying.add(stay.id);
    retiring.add(retire.id);
  }
  const plan: MergePlan = {
    groups: planned,
    skipped: skipped.map((row) => ({ ids: [row.duplicateId, row.keeperId], reason: row.reason })),
    needsReview: [],
    hiddenReviews: [],
    keepers: planned.length,
    retired: planned.reduce((sum, group) => sum + group.retiredIds.length, 0),
    fieldsFilled: planned.reduce((sum, group) => sum + countFills(group.fieldFills), 0),
    childRecordsMoved: planned.reduce((sum, group) => sum + countMoved(group.moved), 0),
    hiddenReview: 0,
  };
  return { plan, swaps, skipped };
}

export type AddressReviewPair = {
  duplicateId: string;
  keeperId: string;
  duplicateSlug?: string | null;
  names?: string[];
  addresses?: string[];
  city?: string | null;
  province?: string | null;
};

/**
 * Possible duplicates whose addresses differ. Hidden for Admin review.
 * Not a merge: merged_into stays null. A claimed duplicate is left public.
 */
export function planAddressReviewHides(
  pairs: AddressReviewPair[],
  factsById: Map<string, MergeListingFacts> = new Map(),
): { hides: HiddenReviewAction[]; skipped: ExplicitMergeSkip[] } {
  const hides: HiddenReviewAction[] = [];
  const skipped: ExplicitMergeSkip[] = [];
  for (const pair of pairs) {
    const duplicateId = text(pair.duplicateId);
    const keeperId = text(pair.keeperId);
    if (!duplicateId || !keeperId) {
      skipped.push({ duplicateId, keeperId, reason: "missing id" });
      continue;
    }
    const duplicate = factsById.get(duplicateId);
    const slug = text(pair.duplicateSlug || duplicate?.slug);
    if (protectedListing(duplicateId, slug) || protectedListing(keeperId, "")) {
      skipped.push({ duplicateId, keeperId, reason: "protected listing" });
      continue;
    }
    if (duplicate && listingOwned(duplicate)) {
      skipped.push({ duplicateId, keeperId, reason: "claimed duplicate left public" });
      continue;
    }
    if (duplicate && (text(duplicate.mergedInto) || text(duplicate.importFault))) {
      skipped.push({ duplicateId, keeperId, reason: "already hidden" });
      continue;
    }
    hides.push({
      liveId: keeperId,
      hiddenId: duplicateId,
      names: uniqueLabels(pair.names || [duplicate?.name]),
      addresses: uniqueLabels(pair.addresses || [duplicate?.address]),
      city: text(pair.city || duplicate?.city),
      province: text(pair.province || duplicate?.province),
      reason: "possible duplicate, addresses differ",
      flag: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
      listingActive: 0,
      visibility: LISTING_VISIBILITY.adminOnly,
    });
  }
  return { hides, skipped };
}

export function planDuplicateMerges(
  groups: DuplicateGroupInput[],
  factsById: Map<string, MergeListingFacts> = new Map(),
  children: Map<string, MergeChildInventory> = new Map(),
): MergePlan {
  const planned: MergeGroupPlan[] = [];
  const skipped: Array<{ ids: string[]; reason: string }> = [];
  const needsReview: MergeReviewItem[] = [];
  const hiddenReviews: HiddenReviewAction[] = [];
  for (const group of groups) {
    const facts = group.rows.map((row) => {
      const base = factsFromGroupRow(row);
      const extra = factsById.get(row.id);
      return extra ? { ...base, ...extra, id: row.id } : base;
    });
    const result = planMergeGroup(facts, children);
    if ("skip" in result) {
      if (result.hiddenReviews && result.hiddenReviews.length > 0) {
        hiddenReviews.push(...result.hiddenReviews);
        continue;
      }
      skipped.push({ ids: group.rows.map((row) => row.id), reason: result.skip });
      continue;
    }
    if (result.retiredIds.length === 0 && result.hiddenReviews.length > 0) {
      hiddenReviews.push(...result.hiddenReviews);
      continue;
    }
    if (result.retiredIds.length === 0) {
      skipped.push({ ids: group.rows.map((row) => row.id), reason: "already merged" });
      continue;
    }
    hiddenReviews.push(...result.hiddenReviews);
    needsReview.push(...result.needsReview);
    planned.push(result);
  }
  return {
    groups: planned,
    skipped,
    needsReview,
    hiddenReviews,
    keepers: planned.length,
    retired: planned.reduce((sum, group) => sum + group.retiredIds.length, 0),
    fieldsFilled: planned.reduce((sum, group) => sum + countFills(group.fieldFills), 0),
    childRecordsMoved: planned.reduce((sum, group) => sum + countMoved(group.moved), 0),
    hiddenReview: hiddenReviews.length,
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
export type HideRollbackInput = {
  hiddenId: string;
  liveId: string;
  listingActive: number;
  visibility: string;
};

export function hideRollbackInputs(
  plan: MergePlan,
  factsById: Map<string, MergeListingFacts>,
): HideRollbackInput[] {
  return plan.hiddenReviews.map((action) => {
    const retired = factsById.get(action.hiddenId);
    const active = retired?.listingActive;
    return {
      hiddenId: action.hiddenId,
      liveId: action.liveId,
      listingActive: active == null ? 1 : Number(active) ? 1 : 0,
      visibility: text(retired?.visibility) || LISTING_VISIBILITY.public,
    };
  });
}

export function buildRollbackSql(rows: MergeRollbackInput[], hides: HideRollbackInput[] = []): string {
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
    for (const userId of row.moved.waitlistUserIds || []) {
      lines.push(
        `update waitlist_interests set daycare_id = ${sqlLiteral(row.retiredId)} where user_id = ${sqlLiteral(userId)} and daycare_id = ${sqlLiteral(row.keeperId)};`,
      );
    }
    for (const claimId of row.moved.claimIds || []) {
      lines.push(
        `update listing_claims set daycare_id = ${sqlLiteral(row.retiredId)} where id = ${sqlLiteral(claimId)} and daycare_id = ${sqlLiteral(row.keeperId)};`,
      );
    }
    for (const userId of row.moved.ownerUserIds || []) {
      lines.push(
        `update provider_daycares set daycare_id = ${sqlLiteral(row.retiredId)} where user_id = ${sqlLiteral(userId)} and daycare_id = ${sqlLiteral(row.keeperId)};`,
      );
    }
  }
  for (const row of hides) {
    lines.push(
      `update daycares set listing_active = ${row.listingActive ? 1 : 0}, visibility = ${sqlLiteral(row.visibility || LISTING_VISIBILITY.public)}, import_fault = null, review_of = null where id = ${sqlLiteral(row.hiddenId)} and import_fault = ${sqlLiteral(HIDDEN_REVIEW_POSSIBLE_SECOND_SITE)} and review_of = ${sqlLiteral(row.liveId)} and merged_into is null;`,
    );
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
