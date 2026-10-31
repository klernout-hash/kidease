/**
 * Schedule and send a tour reminder. Email always when we have an address.
 * SMS only through the existing consent check. Push uses the tour preference.
 */

import { getSql } from "@/lib/db";
import { tourPipelineEnabled } from "@/lib/features";
import {
  tourCalendarFile,
  tourCalendarLinks,
  tourCalendarMailText,
  tourInviteCopy,
  tourReminderAt,
  tourReminderLetter,
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
      ? tourSlotInstants({ startAt: input.startAt, startTime: input.startTime, endTime: input.endTime })
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
  await sendTransactionalMail({
    purpose: "customer_alert",
    to: input.email,
    subject: letter.subject,
    text,
    html: `<p>${letter.text}</p>${links ? `<p><a href="${links.google}">Google</a> · <a href="${links.outlook}">Outlook</a></p>` : ""}`,
  }).catch(() => undefined);
}

/** Move an unsent or already-sent reminder when the visit time changes. Flag off: no-op. */
export async function moveTourReminder(tourId: string, now = new Date()): Promise<{ moved: boolean }> {
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

export async function sendDueTourReminders(input?: { dryRun?: boolean; now?: Date }) {
  const now = input?.now ?? new Date();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    tour_id: string;
    user_id: string;
    daycare_name: string;
    locale: string;
    email: string | null;
    status: string | null;
  }>`
    select r.id, r.tour_id, r.user_id, r.daycare_name, r.locale, r.email, t.status
    from tour_reminders r
    left join tour_requests t on t.id = r.tour_id
    where r.sent_at is null and r.remind_at <= ${now.toISOString()}
    order by r.remind_at
    limit 40
  `.catch(() => []);
  if (input?.dryRun) return { due: rows.length, sent: 0 };
  let sent = 0;
  for (const row of rows) {
    const open = row.status === "pending" || row.status === "accepted";
    if (open) {
      const locale = row.locale === "fr" ? "fr" : "en";
      const letter = tourPipelineEnabled()
        ? tourReminderLetter(locale, row.daycare_name, row.status === "accepted" ? "accepted" : "pending")
        : tourInviteCopy(locale, row.daycare_name);
      if (row.email) {
        const { sendTransactionalMail } = await import("@/lib/transactional-mail");
        await sendTransactionalMail({
          purpose: "customer_alert",
          to: row.email,
          subject: letter.subject,
          text: letter.reminder,
          html: `<p>${letter.reminder}</p>`,
        }).catch(() => undefined);
      }
      if (row.user_id && !row.user_id.startsWith("guest:")) {
        const { notifyConsentedUserSms } = await import("@/lib/server/sms-notify");
        await notifyConsentedUserSms({ userId: row.user_id, body: letter.sms }).catch(() => undefined);
        const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
        await dispatchCustomerAlert({
          userId: row.user_id,
          category: "tour",
          vars: { name: row.daycare_name },
          href: "/parent",
          dedupeKey: `tour-reminder:${row.tour_id}`,
          emailFallback: false,
          now,
        }).catch(() => undefined);
      }
      sent += 1;
    }
    await sql`update tour_reminders set sent_at = now() where id = ${row.id}`.catch(() => undefined);
  }
  return { due: rows.length, sent };
}
