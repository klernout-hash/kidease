/**
 * Weekly open-spots check-in. A tap is 0, 1, 2, or 3+.
 * 3 means three or more. Age columns change only when the listing
 * serves one age group, or when the tap is 0. Never invent a split.
 */

export const OPEN_SPOTS_BANDS = [0, 1, 2, 3] as const;
export type OpenSpotsBand = (typeof OPEN_SPOTS_BANDS)[number];
export type SpotAge = "infant" | "toddler" | "preschool";
export type SpotCounts = Record<SpotAge, number>;

export const OPEN_SPOTS_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function isOpenSpotsBand(value: number): value is OpenSpotsBand {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function bandLabel(band: OpenSpotsBand): string {
  return band === 3 ? "3+" : String(band);
}

export function checkinWeekKey(now = Date.now()): string {
  const d = new Date(now);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Inclusive start day (YYYY-MM-DD) for the last 7 days. */
export function viewsWindowStart(now = Date.now()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}

export function ageGroupsInRange(minMonths: number | null, maxMonths: number | null): SpotAge[] {
  if (minMonths == null || maxMonths == null || !Number.isFinite(minMonths) || !Number.isFinite(maxMonths)) {
    return ["infant", "toddler", "preschool"];
  }
  const min = Math.max(0, Math.round(minMonths));
  const max = Math.max(min, Math.round(maxMonths));
  const groups: SpotAge[] = [];
  if (min < 18) groups.push("infant");
  if (max >= 18 && min < 36) groups.push("toddler");
  if (max >= 36) groups.push("preschool");
  return groups.length ? groups : ["infant", "toddler", "preschool"];
}

export function applyOpenSpotsBand(
  current: SpotCounts,
  groups: readonly SpotAge[],
  band: OpenSpotsBand,
): { spots: SpotCounts; confirmedOpenSpots: OpenSpotsBand; splitKnown: boolean } {
  if (band === 0) {
    return {
      spots: { infant: 0, toddler: 0, preschool: 0 },
      confirmedOpenSpots: 0,
      splitKnown: true,
    };
  }
  if (groups.length === 1) {
    const spots: SpotCounts = { infant: 0, toddler: 0, preschool: 0 };
    spots[groups[0]] = band;
    return { spots, confirmedOpenSpots: band, splitKnown: true };
  }
  const sum = current.infant + current.toddler + current.preschool;
  const matches = band === 3 ? sum >= 3 : sum === band;
  return { spots: { ...current }, confirmedOpenSpots: band, splitKnown: matches };
}

export function checkinDispatchPlan(mailEnabled: boolean, smsEnabled: boolean) {
  return {
    email: mailEnabled,
    sms: smsEnabled,
    skipped: !mailEnabled && !smsEnabled,
    reason: !mailEnabled && !smsEnabled ? ("flags-off" as const) : null,
  };
}

export function checkinEmailText(input: {
  name: string;
  views: number;
  links: Record<OpenSpotsBand, string>;
}): { subject: string; text: string } {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80) || "your daycare";
  const views = Math.max(0, Math.round(input.views));
  const viewLine =
    views === 1
      ? "Parents viewed your listing 1 time in the last 7 days."
      : `Parents viewed your listing ${views} times in the last 7 days.`;
  const text = [
    `Any open spots at ${name}?`,
    "",
    viewLine,
    "",
    "Tap one number. No login. 3+ means three or more.",
    `0: ${input.links[0]}`,
    `1: ${input.links[1]}`,
    `2: ${input.links[2]}`,
    `3+: ${input.links[3]}`,
    "",
    "KidEase. This check-in is included on every plan.",
  ].join("\n");
  return { subject: `Any open spots at ${name}?`, text };
}

export function checkinSmsText(input: { name: string; views: number; pageUrl: string }): string {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 40) || "your daycare";
  const views = Math.max(0, Math.round(input.views));
  return `KidEase: Any open spots at ${name}? ${views} parent views this week. Tap: ${input.pageUrl} Reply STOP to opt out.`;
}
