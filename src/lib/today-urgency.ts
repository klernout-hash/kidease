/**
 * Daycare Today home: urgency rows from tours, unread threads, and listing gaps.
 * Never invents SLA, leads, or next times. Previews stay name-only — no notes.
 */

import { DAYCARE_PRIMARY_NAV_IDS, type DaycarePrimaryNavId } from "@/lib/desk-nav";
import { listingCompleteness } from "@/lib/listing-readiness";
import { listingStatusFromClaim } from "@/lib/listing-status";
import { listingVerifiedCoach } from "@/lib/listing-verified";
import { isClaimVerified, normalizeLicenseStatus, type TrustListing } from "@/lib/trust";
import type { Conversation, Daycare, TourRequest } from "@/lib/types";
import {
  collectConfirmedTodayRows,
  collectPendingTourRows,
  collectUnreadMessageRows,
  previewName,
  type TodayRow,
} from "@/lib/today-sla";

export {
  TODAY_TOUR_SLA_HOURS,
  collectConfirmedTodayRows,
  collectPendingTourRows,
  collectUnreadMessageRows,
  earliestPreferredStart,
  formatSlaCountdown,
  isConfirmedTourToday,
  localDateKey,
  nextConfirmedTourAt,
  preferredSlotStart,
  previewName,
  todayEmptyTruth,
  tourSlaDeadlineMs,
  tourSlaRemainingMs,
} from "@/lib/today-sla";
export type { TodayEmptyTruth, TodayHref, TodayKind, TodayRow, TodayTone } from "@/lib/today-sla";

export const TODAY_PRIMARY_NAV_IDS = DAYCARE_PRIMARY_NAV_IDS;
export type TodayPrimaryNavId = DaycarePrimaryNavId;

export type ScreeningGapCentre = {
  daycareId: string;
  daycareName: string;
  screeningOnFile: boolean;
  people: Array<{
    docs: Array<{ status: string }>;
  }>;
};

const ACTION_DOC = new Set(["missing", "letter_ready", "uploaded", "admin_review", "rejected", "expired"]);

export function isTodayPrimaryNavId(id: string): id is TodayPrimaryNavId {
  return (TODAY_PRIMARY_NAV_IDS as readonly string[]).includes(id);
}

export function listingNeedsVerified(item: TrustListing): boolean {
  return !isClaimVerified(item);
}

export function listingNeedsLicence(
  item: TrustListing &
    Pick<
      Daycare,
      | "id"
      | "hours"
      | "infantMonthly"
      | "toddlerMonthly"
      | "preschoolMonthly"
      | "partTimeMonthly"
      | "province"
      | "ageMinMonths"
      | "ageMaxMonths"
      | "licenseNumber"
      | "photos"
      | "agesKnown"
    >,
): boolean {
  const status = normalizeLicenseStatus(item.licenseStatus);
  if (status === "expired" || status === "suspended") return true;
  const complete = listingCompleteness(item);
  return !complete.hasLicense;
}

export function listingNeedsCompleteness(item: Daycare): boolean {
  const coach = listingVerifiedCoach(item);
  return coach.missingBlockers.some((id) => id !== "screening" && id !== "license");
}

export function centreNeedsScreening(centre: ScreeningGapCentre): boolean {
  if (centre.screeningOnFile) return false;
  if (!centre.people.length) return true;
  return centre.people.some((person) => person.docs.some((doc) => ACTION_DOC.has(doc.status)));
}

export function collectActionRequired(input: {
  listings: Daycare[];
  screening?: ScreeningGapCentre[];
}): TodayRow[] {
  const rows: TodayRow[] = [];
  const seen = new Set<string>();
  for (const listing of input.listings) {
    const name = previewName(listing.name, listing.id);
    if (listingNeedsVerified(listing)) {
      const status = listingStatusFromClaim(listing.claimStatus, { live: listing.live });
      const id = `verified:${listing.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          id,
          kind: "action",
          tone: status === "declined" ? "danger" : "navy",
          title: name,
          detail: "verified",
          href: { to: "/provider", search: { desk: "licence" } },
          sortAt: status === "declined" ? 1 : 2,
        });
      }
    }
    if (listingNeedsLicence(listing)) {
      const id = `licence:${listing.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          id,
          kind: "action",
          tone: "navy",
          title: name,
          detail: "licence",
          href: { to: "/provider", search: { desk: "licence", focus: "license" } },
          sortAt: 3,
        });
      }
    }
    if (listingNeedsCompleteness(listing)) {
      const id = `listing:${listing.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          id,
          kind: "action",
          tone: "navy",
          title: name,
          detail: "listing",
          href: { to: "/provider", search: { desk: "listings", focus: "hours" } },
          sortAt: 4,
        });
      }
    }
  }
  for (const centre of input.screening ?? []) {
    if (!centreNeedsScreening(centre)) continue;
    const id = `screening:${centre.daycareId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      kind: "action",
      tone: "navy",
      title: previewName(centre.daycareName, centre.daycareId),
      detail: "screening",
      href: { to: "/provider", search: { desk: "screening", focus: "screening" } },
      sortAt: 2,
    });
  }
  return rows;
}

export function buildTodayRows(input: {
  tours: TourRequest[];
  threads: Array<Pick<Conversation, "id" | "daycareName" | "unread" | "lastAt">>;
  listings: Daycare[];
  screening?: ScreeningGapCentre[];
  fallbackName: string;
  now?: number;
}): TodayRow[] {
  const now = input.now ?? Date.now();
  const pending = collectPendingTourRows(input.tours, input.fallbackName, now).sort((a, b) => a.sortAt - b.sortAt);
  const unread = collectUnreadMessageRows(input.threads, input.fallbackName).sort((a, b) => b.sortAt - a.sortAt);
  const actions = collectActionRequired({ listings: input.listings, screening: input.screening }).sort(
    (a, b) => a.sortAt - b.sortAt,
  );
  const confirmed = collectConfirmedTodayRows(input.tours, input.fallbackName, now).sort((a, b) => a.sortAt - b.sortAt);
  return [...pending, ...unread, ...actions, ...confirmed];
}
