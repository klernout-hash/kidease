/**
 * Centre-desk action queue: vacancy confirm + reply / fill-risk cues.
 * Built from demand-heat, vacancy freshness, and photo freshness only.
 * Missing samples stay hidden — never invent parents waiting.
 */

import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { photoFreshness, photoTimestamp } from "@/lib/listing-readiness";
import type { DemandSnapshot } from "@/lib/demand-heat";
import type { Daycare } from "@/lib/types";

export type DirectorNudgeKind =
  | "vacancy_missing"
  | "vacancy_stale"
  | "fill_risk"
  | "reply_slow"
  | "tours_waiting"
  | "threads_waiting"
  | "photo_stale"
  | "photo_missing";

export type DirectorNudgeCta = "confirm_spots" | "inbox" | "requests" | "edit_photo";

export type DirectorNudge = {
  id: string;
  kind: DirectorNudgeKind;
  cta: DirectorNudgeCta;
  daycareId: string;
  daycareName: string;
  count?: number;
};

export type NudgeListing = Pick<Daycare, "id" | "name" | "nameFr" | "lastVacancyUpdatedAt" | "spotsUpdatedAt"> &
  Partial<Pick<Daycare, "photos" | "lastPhotoUpdatedAt">>;

function vacancyNeedsConfirm(item: NudgeListing): "missing" | "stale" | null {
  const state = vacancyFreshness(vacancyTimestamp(item));
  if (state.kind === "unknown") return "missing";
  if (state.kind === "stale") return "stale";
  return null;
}

export function directorNudgesForListing(
  item: NudgeListing,
  demand?: DemandSnapshot | null,
): DirectorNudge[] {
  const name = item.name || item.nameFr || item.id;
  const out: DirectorNudge[] = [];
  const vacancy = vacancyNeedsConfirm(item);
  if (vacancy === "missing") {
    out.push({
      id: `${item.id}:vacancy_missing`,
      kind: "vacancy_missing",
      cta: "confirm_spots",
      daycareId: item.id,
      daycareName: name,
    });
  } else if (vacancy === "stale") {
    out.push({
      id: `${item.id}:vacancy_stale`,
      kind: "vacancy_stale",
      cta: "confirm_spots",
      daycareId: item.id,
      daycareName: name,
    });
  }
  if (demand?.fillRisk === "high") {
    out.push({
      id: `${item.id}:fill_risk`,
      kind: "fill_risk",
      cta: "confirm_spots",
      daycareId: item.id,
      daycareName: name,
    });
  }
  if (demand?.sla === "slow") {
    out.push({
      id: `${item.id}:reply_slow`,
      kind: "reply_slow",
      cta: "inbox",
      daycareId: item.id,
      daycareName: name,
    });
  }
  if ((demand?.pendingTourOverdue ?? 0) > 0) {
    out.push({
      id: `${item.id}:tours_waiting`,
      kind: "tours_waiting",
      cta: "requests",
      daycareId: item.id,
      daycareName: name,
      count: demand!.pendingTourOverdue,
    });
  }
  if ((demand?.unrepliedThreads ?? 0) > 0) {
    out.push({
      id: `${item.id}:threads_waiting`,
      kind: "threads_waiting",
      cta: "inbox",
      daycareId: item.id,
      daycareName: name,
      count: demand!.unrepliedThreads,
    });
  }
  const photos = item.photos ?? [];
  const hasPhoto = photos.some((p) => p && !p.includes("placeholder") && !p.includes("-logo"));
  const photo = photoFreshness(photoTimestamp(item));
  if (!hasPhoto) {
    out.push({
      id: `${item.id}:photo_missing`,
      kind: "photo_missing",
      cta: "edit_photo",
      daycareId: item.id,
      daycareName: name,
    });
  } else if (photo.kind === "stale") {
    out.push({
      id: `${item.id}:photo_stale`,
      kind: "photo_stale",
      cta: "edit_photo",
      daycareId: item.id,
      daycareName: name,
    });
  }
  return out;
}

export function collectDirectorNudges(
  listings: NudgeListing[],
  stats: Array<{ daycareId: string; demand?: DemandSnapshot | null }>,
): DirectorNudge[] {
  const byId = new Map(stats.map((s) => [s.daycareId, s.demand ?? null]));
  const out: DirectorNudge[] = [];
  for (const item of listings) {
    out.push(...directorNudgesForListing(item, byId.get(item.id)));
  }
  const order: DirectorNudgeKind[] = [
    "tours_waiting",
    "threads_waiting",
    "reply_slow",
    "vacancy_stale",
    "vacancy_missing",
    "fill_risk",
    "photo_stale",
    "photo_missing",
  ];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** Listings that should sit at the top of the confirm loop. */
export function vacancyConfirmPriority(listings: NudgeListing[]): NudgeListing[] {
  return [...listings].sort((a, b) => {
    const rank = (item: NudgeListing) => {
      const v = vacancyNeedsConfirm(item);
      if (v === "stale") return 0;
      if (v === "missing") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
}
