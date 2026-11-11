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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shortZone(date: Date, timeZone: string): string {
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

/** English uses a.m./p.m. French uses 24-hour. Both use the centre zone and show its short name. */
export function centreClockLabel(value: string, locale: "en" | "fr", timeZone: string | null | undefined): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = zoneOf(timeZone);
  const clock = new Intl.DateTimeFormat(locale === "fr" ? "en-GB" : "en-CA", {
    timeZone: zone,
    hour: locale === "fr" ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle: locale === "fr" ? "h23" : "h12",
  }).format(date);
  const name = shortZone(date, zone);
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
