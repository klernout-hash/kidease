/**
 * Calendar file and reminder time for a tour the parent just booked.
 * Pure: scripts/tour-ics.test.mjs loads this in Node. No database.
 * The file names the centre and the time. It does not name the child.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function tourSlotInstants(input: {
  startAt: string;
  startTime: string;
  endTime: string;
}): { start: Date; end: Date } | null {
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) return null;
  const startMin = clockMinutes(input.startTime);
  const endMin = clockMinutes(input.endTime);
  if (startMin == null || endMin == null) return null;
  const span = endMin - startMin;
  const minutes = span > 0 && span <= 8 * 60 ? span : 30;
  return { start, end: new Date(start.getTime() + minutes * 60 * 1000) };
}

function clockMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Day before, or two hours before when the visit is sooner. Null when it is too soon to remind. */
export function tourReminderAt(startAt: string, now = new Date()): Date | null {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return null;
  const earliest = now.getTime() + 15 * 60 * 1000;
  const dayBefore = start.getTime() - DAY_MS;
  if (dayBefore > earliest) return new Date(dayBefore);
  const soon = start.getTime() - TWO_HOURS_MS;
  if (soon > earliest) return new Date(soon);
  return null;
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function buildTourIcs(input: {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KidEase//Tour//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(input.uid)}@kidease.ca`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(input.start)}`,
    `DTEND:${icsStamp(input.end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    `LOCATION:${icsEscape(input.location)}`,
    `DESCRIPTION:${icsEscape(input.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return lines.join("\r\n");
}

/** Reminder wording after the centre has confirmed, or while it is still pending. */
export function tourReminderLetter(
  locale: "en" | "fr",
  centre: string,
  status: "pending" | "accepted",
): { subject: string; text: string; reminder: string; sms: string } {
  const base = tourInviteCopy(locale, centre);
  if (status !== "accepted") return base;
  if (locale === "fr") {
    return {
      ...base,
      subject: `Visite confirmée : ${centre}`,
      reminder: `Rappel : votre visite à ${centre} est confirmée. KidEase ne donne pas la place.`,
      sms: `KidEase : rappel, votre visite à ${centre} est confirmée.`,
    };
  }
  return {
    ...base,
    subject: `Tour confirmed: ${centre}`,
    reminder: `Reminder: your visit at ${centre} is confirmed. KidEase does not give out the spot.`,
    sms: `KidEase: reminder, your visit at ${centre} is confirmed.`,
  };
}

/** Calendar file for the booking email. Does not name a child. */
export function tourCalendarFile(input: { uid: string; centre: string; startAt: string; location?: string }): string | null {
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return buildTourIcs({
    uid: input.uid,
    title: `Tour at ${input.centre}`,
    start,
    end,
    location: input.location || input.centre,
    description: "KidEase tour. The centre confirms the visit. This does not hold a spot.",
  });
}

export function tourInviteCopy(locale: "en" | "fr", centre: string): { subject: string; text: string; reminder: string; sms: string } {
  if (locale === "fr") {
    return {
      subject: `Visite demandée : ${centre}`,
      text: `Vous avez demandé une visite à ${centre}. Le centre doit encore confirmer. KidEase ne donne pas la place. Ajoutez l'heure à votre calendrier depuis la confirmation.`,
      reminder: `Rappel : votre visite à ${centre} approche. Le centre confirme l'heure. KidEase ne donne pas la place.`,
      sms: `KidEase : rappel, votre visite à ${centre} approche. Le centre confirme l'heure.`,
    };
  }
  return {
    subject: `Tour requested: ${centre}`,
    text: `You asked to visit ${centre}. The centre still has to confirm. KidEase does not give out the spot. Add the time to your calendar from the confirmation.`,
    reminder: `Reminder: your visit at ${centre} is coming up. The centre confirms the time. KidEase does not give out the spot.`,
    sms: `KidEase: reminder, your visit at ${centre} is coming up. The centre confirms the time.`,
  };
}
