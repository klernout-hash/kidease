/** Family clock. Quiet hours follow this zone. Never a single city default. */

export function isValidTimeZone(value: string | null | undefined): value is string {
  const zone = (value || "").trim();
  if (!zone || zone.length > 64 || /[^A-Za-z0-9_+\-/]/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour) || hour === 24) return 0;
  return hour;
}

export function dayKeyInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 21:00–08:00 in the zone the family actually lives in. Unknown zone is not quiet. */
export function quietHourInZone(now: Date, timeZone: string | null | undefined): boolean {
  if (!isValidTimeZone(timeZone)) return false;
  const hour = hourInTimeZone(now, timeZone);
  return hour >= 21 || hour < 8;
}

function shortZoneName(now: Date, zone: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      hour: "numeric",
      timeZoneName: "short",
    }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

/** dateStyle cannot be combined with timeZoneName in this runtime. */
function formatZoned(
  now: Date,
  timeZone: string | null | undefined,
  locale: string,
  dateStyle: "full" | "medium",
): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  try {
    const clock = now.toLocaleString(locale, {
      timeZone: zone,
      dateStyle,
      timeStyle: "short",
    });
    const name = shortZoneName(now, zone, locale);
    return name ? `${clock} ${name}` : clock;
  } catch {
    return now.toISOString();
  }
}

export function formatInTimeZone(now: Date, timeZone: string | null | undefined, locale = "en-CA"): string {
  return formatZoned(now, timeZone, locale, "full");
}

export function formatStamp(now: Date, timeZone?: string | null, locale = "en-CA"): string {
  return formatZoned(now, timeZone, locale, "medium");
}

export function formatClockShort(now: Date, timeZone?: string | null, locale = "en-CA"): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  try {
    const clock = now.toLocaleString(locale, {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
    });
    const name = shortZoneName(now, zone, locale);
    return name ? `${clock} ${name}` : clock;
  } catch {
    return now.toISOString();
  }
}
