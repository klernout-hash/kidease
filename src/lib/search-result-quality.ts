/**
 * Search result hygiene. Demote junk and collapse adjacent duplicate rows.
 * Never deletes catalogue rows. The 37,024-row master stays intact.
 */

import { haversineKm } from "./geo.ts";
import { normalizeCentreName } from "./listing-identity.ts";
import { normalizePlace } from "./listing-match.ts";

const ADJACENT_KM = 0.5;

const GENERIC_NAME =
  /\b(the|daycare|daycares|day care|child care|childcare|early learning|centre|center|program|programs|office|inc|ltd)\b/gi;

const POSTAL_FSA = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]$/;
const POSTAL_FULL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

const COORDINATING =
  /\bco-?ordinat(?:ing|ion)\s+office\b|\bbureau\s+de\s+coordination\b|\bservice\s+system\s+manager\b/i;

const SUMMER =
  /\bsummer\s+(?:day[\s-]*)?(?:program|camp)s?\b|\bprogramme\s+d['’]?été\b|\bcamp\s+d['’]?été\b|\bsummer\s+only\b/i;

export type JunkCard = {
  name?: string | null;
  amenities?: string | null;
  facilityType?: string | null;
};

export type DuplicateCard = JunkCard & {
  id?: string | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  live?: boolean | null;
  claimed?: boolean | null;
  licenseNumber?: string | null;
  photos?: readonly string[] | null;
  description?: string | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
};

export function isPostalCodeName(name: string): boolean {
  const stripped = name.replace(GENERIC_NAME, " ").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!stripped) return false;
  return POSTAL_FSA.test(stripped) || POSTAL_FULL.test(stripped);
}

export function isCoordinatingOffice(name: string): boolean {
  return COORDINATING.test(name);
}

export function isSummerProgram(card: JunkCard): boolean {
  return SUMMER.test(`${card.name || ""} ${card.amenities || ""}`);
}

/** 0 stays in the normal rank. 1 sinks below real centres. */
export function junkRank(card: JunkCard): 0 | 1 {
  const name = card.name || "";
  if (isPostalCodeName(name) || isCoordinatingOffice(name) || isSummerProgram(card)) return 1;
  return 0;
}

export function withJunkLast<T extends JunkCard>(compare: (a: T, b: T) => number): (a: T, b: T) => number {
  return (a, b) => {
    const junk = junkRank(a) - junkRank(b);
    if (junk !== 0) return junk;
    return compare(a, b);
  };
}

function finiteCoord(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function duplicateNameKey(card: DuplicateCard): string | null {
  const name = normalizeCentreName(card.name || "");
  if (name.length < 4) return null;
  const city = normalizePlace(card.city || "");
  if (!city) return null;
  return `${name}|${city}|${normalizePlace(card.province || "")}`;
}

function sameSite(a: DuplicateCard, b: DuplicateCard): boolean {
  if (finiteCoord(a.lat) && finiteCoord(a.lng) && finiteCoord(b.lat) && finiteCoord(b.lng)) {
    if (haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= ADJACENT_KM) return true;
  }
  const left = normalizePlace(a.address || "");
  const right = normalizePlace(b.address || "");
  return left.length >= 8 && left === right;
}

function richness(card: DuplicateCard): number {
  let score = 0;
  if (card.live || card.claimed) score += 100;
  if ((card.licenseNumber || "").trim()) score += 30;
  score += Math.min(20, (card.photos?.length ?? 0) * 5);
  if ((card.address || "").trim().length >= 8) score += 10;
  if ((card.description || "").trim().length >= 40) score += 5;
  const fees = [card.infantMonthly, card.toddlerMonthly, card.preschoolMonthly];
  if (fees.some((fee) => typeof fee === "number" && fee > 0)) score += 8;
  return score;
}

function keeperBetter(candidate: DuplicateCard, current: DuplicateCard): boolean {
  const delta = richness(candidate) - richness(current);
  if (delta !== 0) return delta > 0;
  const nameDelta = (candidate.name || "").length - (current.name || "").length;
  if (nameDelta !== 0) return nameDelta > 0;
  return (candidate.id || "") < (current.id || "");
}

/**
 * Collapse same-name, same-city rows that sit on the same block or share an address.
 * A chain with two sites stays as two rows.
 */
export function collapseAdjacentDuplicates<T extends DuplicateCard>(cards: T[]): T[] {
  const parent = cards.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]!]!;
      cursor = parent[cursor]!;
    }
    return cursor;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  const buckets = new Map<string, number[]>();
  cards.forEach((card, index) => {
    const key = duplicateNameKey(card);
    if (!key) return;
    const list = buckets.get(key);
    if (list) list.push(index);
    else buckets.set(key, [index]);
  });
  for (const indexes of buckets.values()) {
    for (let a = 0; a < indexes.length; a += 1) {
      for (let b = a + 1; b < indexes.length; b += 1) {
        const left = indexes[a]!;
        const right = indexes[b]!;
        if (sameSite(cards[left]!, cards[right]!)) union(left, right);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let index = 0; index < cards.length; index += 1) {
    const root = find(index);
    const list = groups.get(root);
    if (list) list.push(index);
    else groups.set(root, [index]);
  }
  const drop = new Set<number>();
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    let best = indexes[0]!;
    for (const index of indexes) {
      if (keeperBetter(cards[index]!, cards[best]!)) best = index;
    }
    for (const index of indexes) {
      if (index !== best) drop.add(index);
    }
  }
  if (!drop.size) return cards;
  return cards.filter((_, index) => !drop.has(index));
}
