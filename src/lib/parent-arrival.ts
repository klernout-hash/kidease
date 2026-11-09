/** Parent arrival lines from saved check-in events. No time is invented. */

export type ArrivalEvent = {
  childName: string;
  daycareName: string;
  action: "check_in" | "check_out";
  at: string;
};

function winnipegDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function winnipegTime(value: string, locale: "en" | "fr"): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Winnipeg",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function parentArrivalSentences(
  events: readonly ArrivalEvent[],
  now = new Date(),
  locale: "en" | "fr" = "en",
): string[] {
  const today = winnipegDay(now.toISOString());
  if (!today) return [];
  const latest = new Map<string, { inAt?: string; outAt?: string; child: string; centre: string }>();
  for (const event of events) {
    if (winnipegDay(event.at) !== today) continue;
    const key = `${event.childName}|${event.daycareName}`;
    const row = latest.get(key) ?? { child: event.childName, centre: event.daycareName };
    if (event.action === "check_in") row.inAt = event.at;
    if (event.action === "check_out") row.outAt = event.at;
    latest.set(key, row);
  }
  const lines: string[] = [];
  for (const row of latest.values()) {
    const arrived = row.inAt ? winnipegTime(row.inAt, locale) : null;
    const left = row.outAt ? winnipegTime(row.outAt, locale) : null;
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
