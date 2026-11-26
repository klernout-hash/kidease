/**
 * B04: a parent's absence report has to reach the centre's Today desk and
 * bell, and the parent has to be able to take it back. Pure copy and keys.
 */
import type { ParentAbsenceStatus } from "./daily-care.ts";

type Locale = "en" | "fr";

function reasonWord(status: ParentAbsenceStatus, locale: Locale): string {
  const fr = locale === "fr";
  if (status === "sick") return fr ? "malade" : "sick";
  if (status === "vacation") return fr ? "en vacances" : "on vacation";
  return fr ? "absent(e)" : "away";
}

/** One bell line for centre staff. */
export function centreAbsenceNotice(input: {
  status: ParentAbsenceStatus;
  childName: string;
  localDay: string;
  locale: Locale;
}): string {
  const name = input.childName.trim() || (input.locale === "fr" ? "Un enfant" : "A child");
  return input.locale === "fr"
    ? `${name} sera ${reasonWord(input.status, "fr")} le ${input.localDay} (avis du parent).`
    : `${name} will be ${reasonWord(input.status, "en")} on ${input.localDay} (parent report).`;
}

export function centreAbsenceCancelledNotice(input: { childName: string; localDay: string; locale: Locale }): string {
  const name = input.childName.trim() || (input.locale === "fr" ? "Un enfant" : "A child");
  return input.locale === "fr"
    ? `Absence annulée : ${name} est attendu(e) le ${input.localDay}.`
    : `Absence cancelled: ${name} is expected on ${input.localDay}.`;
}

/** Thread line when the parent takes the report back. */
export function parentAbsenceCancelledBody(input: {
  childName: string;
  daycareName: string;
  localDay: string;
  locale?: string;
}): string {
  return input.locale === "fr"
    ? `Avis du parent pour le ${input.localDay} : absence annulée. ${input.childName} viendra à ${input.daycareName}.`
    : `Parent report for ${input.localDay}: absence cancelled. ${input.childName} will come to ${input.daycareName}.`;
}

/** Stable per child, day and status so a repeat tap does not stack alerts. */
export function absenceNoticeKey(input: { bookingId: string; localDay: string; status: string }): string {
  return `absence:${input.bookingId}:${input.localDay}:${input.status}`.slice(0, 180);
}

export function absenceReportKey(daycareId: string, childName: string, day: string): string {
  return `${daycareId}:${childName}:${day}`;
}
