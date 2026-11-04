/**
 * Daycare Insights math. Numbers come from rows the server already loaded.
 * Missing rows stay empty. This file does not invent fees, ratings, or spots.
 * Node tests load it. No database.
 */

export const INSIGHT_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

/** Other centres in the same city. Fewer than this and the area average stays hidden. */
export const AREA_MIN_CENTRES = 5;

export const INSIGHT_AGES = ["infant", "toddler", "preschool", "any"] as const;
export type InsightAge = (typeof INSIGHT_AGES)[number];

/** Same even-count rule as demand heat: average of the two middle values. */
function median(values: number[]): number | null {
  const clean = values.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid]!;
  return (clean[mid - 1]! + clean[mid]!) / 2;
}

const BOOKED_TOUR = new Set(["accepted", "completed", "enrolled", "no_show"]);
const SHOWED_TOUR = new Set(["completed", "enrolled"]);
const PRESENT = new Set(["arrived", "present", "attended", "departed"]);

export type InsightPoint = { key: string; value: number };

export type InsightCentreFact = {
  id: string;
  name: string;
  city: string;
  province: string;
  licensedCapacity: number | null;
  spotsInfant: number | null;
  spotsToddler: number | null;
  spotsPreschool: number | null;
  /** Director confirmed the age spots. Zero then means zero, not "unknown". */
  spotsUpdated: boolean;
  confirmedOpenSpots: number | null;
};

export type InsightFacts = {
  range: InsightRange;
  now: string;
  centres: InsightCentreFact[];
  views: { day: string; count: number }[];
  saves: { day: string; count: number }[];
  inquiries: { at: string }[];
  requests: { at: string }[];
  replyHours: number[];
  /** One median per other centre. No ids. */
  areaMedians: number[];
  waitlist: { age: string; joinedAt: string }[];
  enrolledNow: number;
  enrolments: { at: string }[];
  vacancy: {
    at: string;
    infant: number | null;
    toddler: number | null;
    preschool: number | null;
  }[];
  tours: { status: string; at: string }[];
  attendance: { day: string; status: string }[];
  checkIns: { at: string }[];
  ratios: { at: string; children: number; staff: number }[];
  certs: { staffName: string; level: string; expiresOn: string }[];
  reviews: { at: string; rating: number }[];
};

export type ProviderInsightsModel = {
  range: InsightRange;
  from: string;
  to: string;
  centres: { id: string; name: string; city: string }[];
  listing: {
    views: number;
    saves: number;
    inquiries: number;
    requests: number;
    /** Requests per 100 views. Null when there are no views. */
    conversion: number | null;
    viewSeries: InsightPoint[];
    requestSeries: InsightPoint[];
    empty: boolean;
  };
  response: {
    medianHours: number | null;
    sample: number;
    areaMedianHours: number | null;
    areaCentres: number | null;
    areaCity: string | null;
    empty: boolean;
  };
  waitlist: {
    total: number;
    avgWaitDays: number | null;
    groups: { age: InsightAge; count: number; avgWaitDays: number | null }[];
    empty: boolean;
  };
  occupancy: {
    enrolled: number;
    capacity: number | null;
    capacityCentres: number;
    centreCount: number;
    openByAge: { age: "infant" | "toddler" | "preschool"; spots: number }[] | null;
    openTotal: number | null;
    openCentres: number;
    enrolmentSeries: InsightPoint[];
    openSeries: InsightPoint[];
    empty: boolean;
  };
  tours: {
    requested: number;
    booked: number;
    showed: number;
    missed: number;
    enrolled: number;
    showRate: number | null;
    enrolRate: number | null;
    empty: boolean;
  };
  attendance: {
    records: number;
    checkIns: number;
    series: InsightPoint[];
    source: "check_in" | "attendance" | "none";
    empty: boolean;
  };
  staff: {
    ratioSeries: InsightPoint[];
    certs: { staffName: string; level: string; expiresOn: string; daysLeft: number }[];
    certsOnFile: boolean;
    empty: boolean;
  };
  reviews: {
    count: number;
    average: number | null;
    series: InsightPoint[];
    empty: boolean;
  };
};

export function isInsightRange(value: string): value is InsightRange {
  return (INSIGHT_RANGES as readonly string[]).includes(value);
}

export function scopeCentreIds(
  accessible: readonly string[],
  centreId: string | null | undefined,
): { ok: true; ids: string[] } | { ok: false } {
  const allowed = [...new Set(accessible.map((id) => id.trim()).filter(Boolean))];
  const wanted = String(centreId || "").trim();
  if (!wanted || wanted === "all") return { ok: true, ids: allowed };
  if (!allowed.includes(wanted)) return { ok: false };
  return { ok: true, ids: [wanted] };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function insightWindow(
  range: InsightRange,
  now = new Date(),
): { start: Date; end: Date; startDay: string; endDay: string } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "7d") start.setUTCDate(start.getUTCDate() - 6);
  else if (range === "30d") start.setUTCDate(start.getUTCDate() - 29);
  else if (range === "90d") start.setUTCDate(start.getUTCDate() - 89);
  else {
    start.setUTCMonth(start.getUTCMonth() - 11);
    start.setUTCDate(1);
  }
  return { start, end, startDay: utcDay(start), endDay: utcDay(end) };
}

function weekKey(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day.slice(0, 10);
  const dow = date.getUTCDay();
  const delta = dow === 0 ? 6 : dow - 1;
  date.setUTCDate(date.getUTCDate() - delta);
  return utcDay(date);
}

export function bucketKeys(range: InsightRange, now = new Date()): string[] {
  const { start, end } = insightWindow(range, now);
  const keys: string[] = [];
  if (range === "12m") {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const last = end.getUTCFullYear() * 12 + end.getUTCMonth();
    while (cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() <= last) {
      keys.push(utcDay(cursor).slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return keys;
  }
  if (range === "90d") {
    const seen = new Set<string>();
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const key = weekKey(utcDay(cursor));
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(utcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function dayFromStamp(value: string): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return utcDay(date);
}

export function bucketKeyFor(day: string, range: InsightRange): string {
  const clean = day.slice(0, 10);
  if (range === "12m") return clean.slice(0, 7);
  if (range === "90d") return weekKey(clean);
  return clean;
}

export function seriesFromCounts(
  keys: readonly string[],
  counts: Map<string, number>,
): InsightPoint[] {
  return keys.map((key) => ({ key, value: counts.get(key) ?? 0 }));
}

function addCount(map: Map<string, number>, key: string, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function conversionPercent(views: number, requests: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  const safeRequests = Number.isFinite(requests) && requests > 0 ? requests : 0;
  return Math.round((safeRequests / views) * 1000) / 10;
}

/** Drops the caller's own centres, then one median per remaining centre. */
export function anonymousAreaMedians(
  rows: readonly { daycareId: string; hours: number }[],
  ownIds: readonly string[],
): number[] {
  const own = new Set(ownIds);
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const id = row.daycareId.trim();
    if (!id || own.has(id)) continue;
    if (!Number.isFinite(row.hours) || row.hours < 0) continue;
    const list = grouped.get(id) ?? [];
    list.push(row.hours);
    grouped.set(id, list);
  }
  const medians: number[] = [];
  for (const hours of grouped.values()) {
    const mid = median(hours);
    if (mid != null) medians.push(mid);
  }
  return medians;
}

export function areaAverageHours(
  medians: readonly number[],
  min = AREA_MIN_CENTRES,
): { hours: number | null; centres: number | null } {
  const clean = medians.filter((n) => Number.isFinite(n) && n >= 0);
  if (clean.length < min) return { hours: null, centres: null };
  const avg = clean.reduce((sum, n) => sum + n, 0) / clean.length;
  return { hours: Math.round(avg * 10) / 10, centres: clean.length };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function daysBetween(startIso: string, end: Date): number | null {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return null;
  return days;
}

function asAge(value: string): InsightAge | null {
  return (INSIGHT_AGES as readonly string[]).includes(value) ? (value as InsightAge) : null;
}

function sharedCity(
  centres: readonly InsightCentreFact[],
): { city: string; province: string } | null {
  if (!centres.length) return null;
  const city = centres[0]!.city.trim().toLowerCase();
  const province = centres[0]!.province.trim().toUpperCase();
  if (!city || !province) return null;
  for (const centre of centres) {
    if (centre.city.trim().toLowerCase() !== city) return null;
    if (centre.province.trim().toUpperCase() !== province) return null;
  }
  return { city: centres[0]!.city.trim(), province };
}

function sumSpots(value: number | null): number {
  return value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value));
}

export function assembleProviderInsights(facts: InsightFacts): ProviderInsightsModel {
  const now = new Date(facts.now);
  const when = Number.isNaN(now.getTime()) ? new Date() : now;
  const range = facts.range;
  const window = insightWindow(range, when);
  const keys = bucketKeys(range, when);
  const inWindow = (day: string) => day >= window.startDay && day <= window.endDay;

  const viewCounts = new Map<string, number>();
  let views = 0;
  for (const row of facts.views) {
    const day = dayFromStamp(row.day);
    if (!inWindow(day)) continue;
    const count = Math.max(0, Math.floor(row.count) || 0);
    views += count;
    addCount(viewCounts, bucketKeyFor(day, range), count);
  }

  let saves = 0;
  for (const row of facts.saves) {
    const day = dayFromStamp(row.day);
    if (!inWindow(day)) continue;
    saves += Math.max(0, Math.floor(row.count) || 0);
  }

  const requestCounts = new Map<string, number>();
  let requests = 0;
  for (const row of facts.requests) {
    const day = dayFromStamp(row.at);
    if (!inWindow(day)) continue;
    requests += 1;
    addCount(requestCounts, bucketKeyFor(day, range));
  }

  let inquiries = 0;
  for (const row of facts.inquiries) {
    const day = dayFromStamp(row.at);
    if (inWindow(day)) inquiries += 1;
  }

  const replyHours = facts.replyHours.filter((n) => Number.isFinite(n) && n >= 0);
  const ownMedian = median(replyHours);
  const area = areaAverageHours(facts.areaMedians);
  const city = sharedCity(facts.centres);

  const waitGroups = new Map<InsightAge, number[]>();
  for (const row of facts.waitlist) {
    const age = asAge(row.age);
    const days = daysBetween(row.joinedAt, when);
    if (!age || days == null) continue;
    const list = waitGroups.get(age) ?? [];
    list.push(days);
    waitGroups.set(age, list);
  }
  const groups = INSIGHT_AGES.filter((age) => waitGroups.has(age)).map((age) => {
    const days = waitGroups.get(age) ?? [];
    const avg = days.length ? days.reduce((sum, n) => sum + n, 0) / days.length : null;
    return { age, count: days.length, avgWaitDays: avg == null ? null : round1(avg) };
  });
  const allWaitDays = groups.flatMap((group) => waitGroups.get(group.age) ?? []);
  const waitAvg = allWaitDays.length
    ? round1(allWaitDays.reduce((sum, n) => sum + n, 0) / allWaitDays.length)
    : null;

  const enrolCounts = new Map<string, number>();
  for (const row of facts.enrolments) {
    const day = dayFromStamp(row.at);
    if (!inWindow(day)) continue;
    addCount(enrolCounts, bucketKeyFor(day, range));
  }

  let capacity: number | null = null;
  let capacityCentres = 0;
  for (const centre of facts.centres) {
    if (centre.licensedCapacity == null || !Number.isFinite(centre.licensedCapacity)) continue;
    capacity = (capacity ?? 0) + Math.max(0, Math.floor(centre.licensedCapacity));
    capacityCentres += 1;
  }

  let openByAge: ProviderInsightsModel["occupancy"]["openByAge"] = null;
  let openTotal: number | null = null;
  let openCentres = 0;
  let ageInfant = 0;
  let ageToddler = 0;
  let agePreschool = 0;
  let ageCentres = 0;
  for (const centre of facts.centres) {
    if (centre.spotsUpdated) {
      ageInfant += sumSpots(centre.spotsInfant);
      ageToddler += sumSpots(centre.spotsToddler);
      agePreschool += sumSpots(centre.spotsPreschool);
      ageCentres += 1;
      openCentres += 1;
      continue;
    }
    if (centre.confirmedOpenSpots != null && Number.isFinite(centre.confirmedOpenSpots)) {
      openTotal = (openTotal ?? 0) + Math.max(0, Math.floor(centre.confirmedOpenSpots));
      openCentres += 1;
    }
  }
  if (ageCentres > 0) {
    openByAge = [
      { age: "infant", spots: ageInfant },
      { age: "toddler", spots: ageToddler },
      { age: "preschool", spots: agePreschool },
    ];
    openTotal = (openTotal ?? 0) + ageInfant + ageToddler + agePreschool;
  }

  const openCounts = new Map<string, number>();
  const openLast = new Map<string, number>();
  for (const row of facts.vacancy) {
    const day = dayFromStamp(row.at);
    if (!inWindow(day)) continue;
    if (row.infant == null && row.toddler == null && row.preschool == null) continue;
    const total = sumSpots(row.infant) + sumSpots(row.toddler) + sumSpots(row.preschool);
    openLast.set(bucketKeyFor(day, range), total);
  }
  for (const [key, total] of openLast) openCounts.set(key, total);

  let booked = 0;
  let showed = 0;
  let missed = 0;
  let tourEnrolled = 0;
  let requested = 0;
  for (const tour of facts.tours) {
    const day = dayFromStamp(tour.at);
    if (!inWindow(day)) continue;
    requested += 1;
    const status = tour.status.trim();
    if (!BOOKED_TOUR.has(status)) continue;
    booked += 1;
    if (SHOWED_TOUR.has(status)) showed += 1;
    if (status === "no_show") missed += 1;
    if (status === "enrolled") tourEnrolled += 1;
  }
  const finished = showed + missed;
  const showRate = finished > 0 ? round1((showed / finished) * 100) : null;
  const enrolRate = booked > 0 ? round1((tourEnrolled / booked) * 100) : null;

  const attendCounts = new Map<string, number>();
  let records = 0;
  for (const row of facts.attendance) {
    if (!PRESENT.has(row.status.trim())) continue;
    const day = dayFromStamp(row.day);
    if (!inWindow(day)) continue;
    records += 1;
    addCount(attendCounts, bucketKeyFor(day, range));
  }
  const checkCounts = new Map<string, number>();
  let checkIns = 0;
  for (const row of facts.checkIns) {
    const day = dayFromStamp(row.at);
    if (!inWindow(day)) continue;
    checkIns += 1;
    addCount(checkCounts, bucketKeyFor(day, range));
  }
  const attendanceSource = checkIns > 0 ? "check_in" : records > 0 ? "attendance" : "none";

  const ratioBuckets = new Map<string, number[]>();
  for (const row of facts.ratios) {
    if (!Number.isFinite(row.staff) || row.staff <= 0) continue;
    if (!Number.isFinite(row.children) || row.children < 0) continue;
    const day = dayFromStamp(row.at);
    if (!inWindow(day)) continue;
    const key = bucketKeyFor(day, range);
    const list = ratioBuckets.get(key) ?? [];
    list.push(row.children / row.staff);
    ratioBuckets.set(key, list);
  }
  const ratioSeries = keys
    .filter((key) => ratioBuckets.has(key))
    .map((key) => {
      const list = ratioBuckets.get(key) ?? [];
      const avg = list.reduce((sum, n) => sum + n, 0) / list.length;
      return { key, value: round1(avg) };
    });

  const today = window.endDay;
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 90);
  const horizonDay = utcDay(horizon);
  const certs = facts.certs
    .map((cert) => {
      const expiresOn = dayFromStamp(cert.expiresOn);
      if (!expiresOn) return null;
      const daysLeft = daysBetween(`${today}T00:00:00Z`, new Date(`${expiresOn}T00:00:00Z`));
      if (daysLeft == null) return null;
      return {
        staffName: cert.staffName.replace(/\s+/g, " ").trim().slice(0, 80),
        level: cert.level.replace(/\s+/g, " ").trim().slice(0, 40),
        expiresOn,
        daysLeft: Math.round(daysLeft),
      };
    })
    .filter((cert): cert is NonNullable<typeof cert> =>
      Boolean(cert && cert.staffName && cert.expiresOn >= today && cert.expiresOn <= horizonDay),
    )
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));

  const reviewBuckets = new Map<string, number[]>();
  const ratings: number[] = [];
  for (const row of facts.reviews) {
    if (!Number.isFinite(row.rating) || row.rating < 1 || row.rating > 5) continue;
    const day = dayFromStamp(row.at);
    if (!inWindow(day)) continue;
    ratings.push(row.rating);
    const key = bucketKeyFor(day, range);
    const list = reviewBuckets.get(key) ?? [];
    list.push(row.rating);
    reviewBuckets.set(key, list);
  }
  const reviewSeries = keys
    .filter((key) => reviewBuckets.has(key))
    .map((key) => {
      const list = reviewBuckets.get(key) ?? [];
      return { key, value: round1(list.reduce((sum, n) => sum + n, 0) / list.length) };
    });

  const enrolled = Math.max(0, Math.floor(facts.enrolledNow) || 0);
  const enrolmentSeries = seriesFromCounts(keys, enrolCounts);

  return {
    range,
    from: window.startDay,
    to: window.endDay,
    centres: facts.centres.map((centre) => ({
      id: centre.id,
      name: centre.name.trim() || "Centre",
      city: centre.city.trim(),
    })),
    listing: {
      views,
      saves,
      inquiries,
      requests,
      conversion: conversionPercent(views, requests),
      viewSeries: seriesFromCounts(keys, viewCounts),
      requestSeries: seriesFromCounts(keys, requestCounts),
      empty: views + saves + inquiries + requests === 0,
    },
    response: {
      medianHours: ownMedian == null ? null : round1(ownMedian),
      sample: replyHours.length,
      areaMedianHours: city ? area.hours : null,
      areaCentres: city ? area.centres : null,
      areaCity: city && area.hours != null ? city.city : null,
      empty: replyHours.length === 0 && area.hours == null,
    },
    waitlist: {
      total: allWaitDays.length,
      avgWaitDays: waitAvg,
      groups,
      empty: allWaitDays.length === 0,
    },
    occupancy: {
      enrolled,
      capacity,
      capacityCentres,
      centreCount: facts.centres.length,
      openByAge,
      openTotal,
      openCentres,
      enrolmentSeries,
      openSeries: seriesFromCounts(keys, openCounts).filter((point) => openLast.has(point.key)),
      empty:
        enrolled === 0 &&
        capacity == null &&
        openTotal == null &&
        enrolmentSeries.every((point) => point.value === 0),
    },
    tours: {
      requested,
      booked,
      showed,
      missed,
      enrolled: tourEnrolled,
      showRate,
      enrolRate,
      empty: requested === 0,
    },
    attendance: {
      records,
      checkIns,
      series: seriesFromCounts(keys, attendanceSource === "check_in" ? checkCounts : attendCounts),
      source: attendanceSource,
      empty: attendanceSource === "none",
    },
    staff: {
      ratioSeries,
      certs,
      certsOnFile: facts.certs.some(
        (cert) => cert.staffName.trim() && dayFromStamp(cert.expiresOn),
      ),
      empty: ratioSeries.length === 0 && facts.certs.length === 0,
    },
    reviews: {
      count: ratings.length,
      average: ratings.length
        ? round1(ratings.reduce((sum, n) => sum + n, 0) / ratings.length)
        : null,
      series: reviewSeries,
      empty: ratings.length === 0,
    },
  };
}
