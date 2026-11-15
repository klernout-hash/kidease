/** Group door events by the centre's calendar day. Newest day first. */

export function checkHistoryDay(at: string, timeZone: string | null | undefined): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "America/Winnipeg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return at.slice(0, 10);
  }
}

export function groupCheckHistory<T extends { at: string; timeZone?: string | null }>(
  events: readonly T[],
): { day: string; events: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const day = checkHistoryDay(event.at, event.timeZone);
    if (!day) continue;
    const list = groups.get(day) ?? [];
    list.push(event);
    groups.set(day, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, rows]) => ({ day, events: rows }));
}
