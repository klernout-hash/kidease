/**
 * A message number is the existing conversation id, written so a person can
 * read it aloud. It does not confirm a spot, a payment, or who is signed in.
 */

import { inboxRelationshipKey, type InboxStatusKey } from "./inbox-thread-ui.ts";

const BODY = /^[A-Z0-9]{8,16}$/;

export function threadReferenceFromId(id: string | null | undefined): string | null {
  const match = /^cv_([a-z0-9]{8,16})$/i.exec(String(id || "").trim());
  if (!match) return null;
  const body = match[1].toUpperCase();
  const groups = body.match(/.{1,4}/g);
  return groups ? `KE-${groups.join("-")}` : null;
}

export function conversationIdFromReference(input: string | null | undefined): string | null {
  const compact = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact.startsWith("KE")) return null;
  const body = compact.slice(2);
  if (!BODY.test(body)) return null;
  return `cv_${body.toLowerCase()}`;
}

export type ThreadReferenceCard = {
  reference: string;
  relationship: InboxStatusKey | "inboxRelationshipMessage";
  daycareName: string;
  city: string | null;
  parentName: string;
  ownerName: string | null;
  when: string | null;
};

/** Keep lookup results to the fields support may see. Drop anything else. */
export function threadReferenceCard(input: {
  reference: string;
  status?: string | null;
  tourStatus?: string | null;
  daycareName?: string | null;
  city?: string | null;
  parentName?: string | null;
  ownerName?: string | null;
  when?: string | null;
}): ThreadReferenceCard {
  const when = String(input.when || "").trim();
  return {
    reference: input.reference,
    relationship: inboxRelationshipKey({ status: input.status, tourStatus: input.tourStatus }),
    daycareName: String(input.daycareName || "").trim().slice(0, 120),
    city: String(input.city || "").trim().slice(0, 80) || null,
    parentName: String(input.parentName || "").trim().slice(0, 80),
    ownerName: String(input.ownerName || "").trim().slice(0, 80) || null,
    when: when ? when.slice(0, 40) : null,
  };
}

const lookups = new Map<string, number[]>();

export function resetThreadReferenceLookups(): void {
  lookups.clear();
}

/** Exact lookups only. A burst gets the same "try again" as a miss, not a hint. */
export function allowThreadReferenceLookup(userId: string, now: number, windowMs = 60_000, max = 12): boolean {
  const id = String(userId || "").trim();
  if (!id) return false;
  const recent = (lookups.get(id) || []).filter((at) => now - at < windowMs);
  if (recent.length >= max) {
    lookups.set(id, recent);
    return false;
  }
  recent.push(now);
  lookups.set(id, recent);
  return true;
}
