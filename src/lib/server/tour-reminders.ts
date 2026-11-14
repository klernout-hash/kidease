/**
 * Tour reminders. FEATURE_TOUR_CALENDAR defaults off.
 * The due job writes an in-app notice only. It does not email, text, or push.
 */

import { getSql } from "@/lib/db";
import { tourCalendarEnabled, tourPipelineEnabled } from "@/lib/features";
import {
  tourCalendarFile,
  tourCalendarLinks,
  tourCalendarMailText,
  tourInviteCopy,
  tourReminderAt,
  tourSlotInstants,
} from "@/lib/tour-ics";
import { nid } from "@/lib/utils";

export async function scheduleTourReminder(input: {
  tourId: string;
  userId: string;
  daycareName: string;
  startAt: string;
  email?: string | null;
  locale?: "en" | "fr";
  now?: Date;
}) {
  const when = tourReminderAt(input.startAt, input.now ?? new Date());
  if (!when) return { scheduled: false as const };
  const sql = await getSql();
  const locale = input.locale === "fr" ? "fr" : "en";
  await sql`
    insert into tour_reminders (id, tour_id, user_id, daycare_name, locale, email, remind_at)
    values (
      ${nid("trm")}, ${input.tourId}, ${input.userId}, ${input.daycareName.slice(0, 120)},
      ${locale}, ${input.email || null}, ${when.toISOString()}
    )
    on conflict (tour_id) do nothing
  `.catch(() => undefined);
  return { scheduled: true as const };
}

export async function sendTourBookedMail(input: {
  email: string;
  centre: string;
  locale: "en" | "fr";
  province?: string | null;
  uid?: string;
  tourId?: string;
  startAt?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  cancelled?: boolean;
  sequence?: number;
}) {
  const letter = tourInviteCopy(input.locale, input.centre);
  const range =
    input.startAt && input.startTime && input.endTime
      ? tourSlotInstants({
          startAt: input.startAt,
          startTime: input.startTime,
          endTime: input.endTime,
        })
      : null;
  const links = range
    ? tourCalendarLinks({
        uid: input.uid || input.tourId || "tour",
        title: input.locale === "fr" ? `Visite : ${input.centre}` : `Tour: ${input.centre}`,
        start: range.start,
        end: range.end,
        location: input.location || "",
        description: letter.text,
        method: input.cancelled ? "CANCEL" : "REQUEST",
        sequence: input.sequence,
      })
    : null;
  const pipelineFile =
    !links && tourPipelineEnabled() && (input.tourId || input.uid) && input.startAt
      ? tourCalendarFile({
          uid: input.tourId || input.uid || "tour",
          centre: input.centre,
          startAt: input.startAt,
          location: input.location,
        })
      : null;
  const extra = links
    ? `\n\n${tourCalendarMailText(links, input.locale, Boolean(input.cancelled))}`
    : pipelineFile
      ? `\n\n${pipelineFile}`
      : "";
  const text = `${letter.text}${extra}`;
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  const { brandedNotice, emailLocaleFor } = await import("@/lib/email-layout");
  const { isAdminOnlyListing } = await import("@/lib/listing-visibility");
  const locale = emailLocaleFor(input.locale, input.province);
  const frLetter = tourInviteCopy("fr", input.centre);
  const enLetter = tourInviteCopy("en", input.centre);
  await sendTransactionalMail({
    purpose: "customer_alert",
    to: input.email,
    subject: letter.subject,
    text,
    html: `<p>${letter.text}</p>${links ? `<p><a href="${links.google}">Google</a> · <a href="${links.outlook}">Outlook</a></p>` : ""}`,
    aboutTestListing: isAdminOnlyListing({ name: input.centre }),
    branded: brandedNotice({
      locale,
      heading: locale === "en" ? enLetter.subject : frLetter.subject,
      text: locale === "en" ? text : `${frLetter.text}${extra}`,
      en:
        locale === "fr-qc"
          ? { heading: enLetter.subject, blocks: [{ kind: "p", text: enLetter.text }] }
          : undefined,
      cta:
        links?.google && /^https:\/\//i.test(links.google)
          ? {
              label: locale === "en" ? "Add to calendar" : "Ajouter au calendrier",
              href: links.google,
            }
          : undefined,
      reason:
        locale === "en"
          ? "You get this because a tour is booked on KidEase."
          : "Vous recevez ce courriel parce qu'une visite est prévue sur KidEase.",
    }),
  }).catch(() => undefined);
}

/** Move an unsent or already-sent reminder when the visit time changes. Flag off: no-op. */
export async function moveTourReminder(
  tourId: string,
  now = new Date(),
): Promise<{ moved: boolean }> {
  if (!tourPipelineEnabled()) return { moved: false };
  try {
    const sql = await getSql();
    const rows = await sql<{ start_at: string | Date }>`
      select w.start_at
      from tour_requests t
      join tour_windows w on w.id = t.window_id
      where t.id = ${tourId}
      limit 1
    `;
    const start = rows[0]?.start_at;
    if (!start) return { moved: false };
    const iso = start instanceof Date ? start.toISOString() : String(start);
    const when = tourReminderAt(iso, now);
    if (!when) return { moved: false };
    const wrote = await sql<{ id: string }>`
      update tour_reminders
      set remind_at = ${when.toISOString()}, sent_at = null
      where tour_id = ${tourId}
      returning id
    `;
    return { moved: Boolean(wrote[0]) };
  } catch {
    return { moved: false };
  }
}

export type TourReminderPhaseResult = {
  ok: boolean;
  status: "complete" | "flag_off" | "dry_run" | "failed";
  dryRun: boolean;
  due: number;
  eligible: number;
  /** Legacy count of confirmed in-app notice intents, not email/push delivery. */
  sent: number;
  noticesConfirmed: number;
  markedSent: number;
  alreadyMarked: number;
  failures: { scan: number; notice: number; mark: number; entry: number };
};

export async function sendDueTourReminders(input?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<TourReminderPhaseResult> {
  const dryRun = Boolean(input?.dryRun);
  const result: TourReminderPhaseResult = {
    ok: true,
    status: dryRun ? "dry_run" : "complete",
    dryRun,
    due: 0,
    eligible: 0,
    sent: 0,
    noticesConfirmed: 0,
    markedSent: 0,
    alreadyMarked: 0,
    failures: { scan: 0, notice: 0, mark: 0, entry: 0 },
  };
  if (!tourCalendarEnabled()) return { ...result, status: "flag_off" };
  const now = input?.now ?? new Date();
  type DueReminder = {
    id: string;
    tour_id: string;
    user_id: string;
    daycare_name: string;
    locale: string;
    email: string | null;
    status: string | null;
  };
  let sql: Awaited<ReturnType<typeof getSql>>;
  let rows: DueReminder[];
  try {
    sql = await getSql();
    rows = await sql<DueReminder>`
      select r.id, r.tour_id, r.user_id, r.daycare_name, r.locale, r.email, t.status
      from tour_reminders r
      left join tour_requests t on t.id = r.tour_id
      where r.sent_at is null and r.remind_at <= ${now.toISOString()}
      order by r.remind_at
      limit 40
    `;
    result.due = rows.length;
  } catch {
    result.ok = false;
    result.status = "failed";
    result.failures.scan += 1;
    return result;
  }
  result.eligible = rows.filter(
    (row) =>
      (row.status === "pending" || row.status === "accepted") &&
      row.user_id &&
      !row.user_id.startsWith("guest:"),
  ).length;
  if (dryRun) return result;
  for (const row of rows) {
    const open = row.status === "pending" || row.status === "accepted";
    if (open && row.user_id && !row.user_id.startsWith("guest:")) {
      try {
        const { saveParentInAppNotice } = await import("@/lib/server/parent-notice");
        await saveParentInAppNotice(
          sql,
          {
            userId: row.user_id,
            kind: "tour",
            titleKey: "notifTourUpdated",
            href: "/parent?tab=tours",
            sourceKey: `tour-reminder:${row.tour_id}`,
            daycareName: row.daycare_name,
            status: "reminder",
          },
          { strict: true },
        );
        // The stable source key also confirms a notice that a previous run wrote.
        result.noticesConfirmed += 1;
        result.sent += 1;
      } catch {
        result.failures.notice += 1;
        // Keep this reminder due if its notice was not confirmed.
        continue;
      }
    }
    try {
      const marked = await sql<{ id: string }>`
        update tour_reminders set sent_at = now()
        where id = ${row.id} and sent_at is null
        returning id
      `;
      if (marked[0]) result.markedSent += 1;
      else result.alreadyMarked += 1;
    } catch {
      result.failures.mark += 1;
    }
  }
  result.ok = !Object.values(result.failures).some(Boolean);
  if (!result.ok) result.status = "failed";
  return result;
}
