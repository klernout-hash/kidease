/** Parent arrival lines from saved check-in events. No time is invented. */

export type ArrivalEvent = {
  childName: string;
  daycareName: string;
  action: "check_in" | "check_out";
  at: string;
  /** IANA zone for the centre. Missing uses Winnipeg. */
  timeZone?: string | null;
};

function zoneOf(value: string | null | undefined): string {
  const zone = String(value || "").trim();
  try {
    if (zone) {
      new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
      return zone;
    }
  } catch {
    /* fall through */
  }
  return "America/Winnipeg";
}

function centreDay(value: string, timeZone: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (timeZone === "America/Winnipeg") return winnipegDayKey(date);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function intlShortZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "numeric",
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function nthSunday(year: number, monthIndex: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
}

/**
 * Winnipeg keeps daylight time from 02:00 on the second Sunday in March
 * until 02:00 on the first Sunday in November. This runtime's ICU data
 * still says CDT after that November change, so the label cannot be copied
 * from Intl when it disagrees with the date.
 */
export function winnipegZoneName(date: Date): "CST" | "CDT" {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 8, 0, 0);
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 7, 0, 0);
  const time = date.getTime();
  return time >= start && time < end ? "CDT" : "CST";
}

function winnipegClock(date: Date, locale: "en" | "fr"): string {
  const name = winnipegZoneName(date);
  const shift = (name === "CDT" ? -5 : -6) * 60 * 60 * 1000;
  const local = new Date(date.getTime() + shift);
  const hour24 = local.getUTCHours();
  const minute = String(local.getUTCMinutes()).padStart(2, "0");
  if (locale === "fr") return `${String(hour24).padStart(2, "0")}:${minute} ${name}`;
  const period = hour24 >= 12 ? "p.m." : "a.m.";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${period} ${name}`;
}

function winnipegDayKey(date: Date): string {
  const name = winnipegZoneName(date);
  const shift = (name === "CDT" ? -5 : -6) * 60 * 60 * 1000;
  const local = new Date(date.getTime() + shift);
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${local.getUTCFullYear()}-${month}-${day}`;
}

/** English uses a.m./p.m. French uses 24-hour. Both use the centre zone and show its short name. */
export function centreClockLabel(value: string, locale: "en" | "fr", timeZone: string | null | undefined): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = zoneOf(timeZone);
  if (zone === "America/Winnipeg") {
    const fromIntl = intlShortZone(date, zone);
    const expected = winnipegZoneName(date);
    if (fromIntl === expected) {
      const clock = new Intl.DateTimeFormat(locale === "fr" ? "en-GB" : "en-CA", {
        timeZone: zone,
        hour: locale === "fr" ? "2-digit" : "numeric",
        minute: "2-digit",
        hourCycle: locale === "fr" ? "h23" : "h12",
      }).format(date);
      return `${clock} ${expected}`;
    }
    return winnipegClock(date, locale);
  }
  const clock = new Intl.DateTimeFormat(locale === "fr" ? "en-GB" : "en-CA", {
    timeZone: zone,
    hour: locale === "fr" ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle: locale === "fr" ? "h23" : "h12",
  }).format(date);
  const name = intlShortZone(date, zone);
  return name ? `${clock} ${name}` : clock;
}

function centreTime(value: string, locale: "en" | "fr", timeZone: string): string | null {
  const label = centreClockLabel(value, locale, timeZone);
  return label || null;
}

export function parentArrivalSentences(
  events: readonly ArrivalEvent[],
  now = new Date(),
  locale: "en" | "fr" = "en",
): string[] {
  const latest = new Map<string, { inAt?: string; outAt?: string; child: string; centre: string; timeZone?: string | null }>();
  for (const event of events) {
    const timeZone = zoneOf(event.timeZone);
    const today = centreDay(now.toISOString(), timeZone);
    if (!today || centreDay(event.at, timeZone) !== today) continue;
    const key = `${event.childName}|${event.daycareName}|${timeZone}`;
    const row = latest.get(key) ?? { child: event.childName, centre: event.daycareName, timeZone };
    if (event.action === "check_in") row.inAt = event.at;
    if (event.action === "check_out") row.outAt = event.at;
    latest.set(key, row);
  }
  const lines: string[] = [];
  for (const row of latest.values()) {
    const timeZone = zoneOf(row.timeZone);
    const arrived = row.inAt ? centreTime(row.inAt, locale, timeZone) : null;
    const left = row.outAt ? centreTime(row.outAt, locale, timeZone) : null;
    if (!arrived && !left) continue;
    if (locale === "fr") {
      const parts = [`${row.child} à ${row.centre}.`];
      if (arrived) parts.push(`Arrivée à ${arrived}.`);
      if (left) parts.push(`Départ à ${left}.`);
      lines.push(parts.join(" "));
    } else {
      const parts = [`${row.child} at ${row.centre}.`];
      if (arrived) parts.push(`Arrived at ${arrived}.`);
      if (left) parts.push(`Left at ${left}.`);
      lines.push(parts.join(" "));
    }
  }
  return lines;
}
