import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { holdExpiresAtIso } from "@/lib/tour-hold";
import { tourStatusBody } from "@/lib/threads";
import { notifyTourParties, syncLeadFromTour } from "@/lib/server/tour-hold-notify";

export type ExpireTourHoldsResult = {
  ok: true;
  expired: number;
  dryRun: boolean;
};

type DueHold = {
  id: string;
  conversation_id: string;
  user_id: string;
  daycare_id: string;
  daycare_name: string;
  contact_email: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
};

/**
 * Expire overdue pending soft-holds and free the seat.
 * Scheduled worker only. Reads project expiry without persisting or notifying.
 */
export async function expireDueTourHolds(input?: { dryRun?: boolean; notify?: boolean }): Promise<ExpireTourHoldsResult> {
  const dryRun = Boolean(input?.dryRun);
  const notify = input?.notify !== false;
  const sql = await getSql();
  const due = await sql<DueHold>`
    select t.id, t.conversation_id, t.user_id, t.daycare_id, d.name as daycare_name,
           t.contact_email, t.parent_first_name, t.parent_last_name
    from tour_requests t
    join daycares d on d.id = t.daycare_id
    where t.status = ${"pending"}
      and coalesce(t.hold_expires_at, t.created_at + interval '48 hours') <= now()
  `;

  if (dryRun) return { ok: true as const, expired: due.length, dryRun: true };

  let expired = 0;
  for (const tour of due) {
    // Another worker or a centre response may have changed this hold since the scan.
    // Only the successful transition owns the status message, lead sync and notices.
    const claimed = await sql<{ id: string }>`
      update tour_requests
      set status = ${"expired"},
          centre_note = coalesce(centre_note, ${"Hold expired: slot released"}),
          responded_at = coalesce(responded_at, now())
      where id = ${tour.id} and status = ${"pending"}
        and coalesce(hold_expires_at, created_at + interval '48 hours') <= now()
      returning id
    `;
    if (!claimed[0]) continue;
    expired += 1;

    const body = tourStatusBody({ status: "expired", daycareName: tour.daycare_name });
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${tour.conversation_id}, ${"system"}, ${body}, ${"status"})
    `.catch(() => undefined);
    await sql`update conversations set last_at = now() where id = ${tour.conversation_id}`.catch(() => undefined);
    await syncLeadFromTour(sql, tour.id, "expired");

    if (notify) {
      const guestName = `${tour.parent_first_name || ""} ${tour.parent_last_name || ""}`.trim();
      await notifyTourParties(sql, {
        conversationId: tour.conversation_id,
        daycareId: tour.daycare_id,
        daycareName: tour.daycare_name,
        parentUserId: tour.user_id,
        parentEmail: tour.contact_email,
        parentName: guestName || null,
        subject: `Tour hold expired: ${tour.daycare_name}`,
        preview: body,
      }).catch(() => undefined);
    }
  }

  return { ok: true as const, expired, dryRun: false };
}

export function nextHoldExpiresAt(): string {
  return holdExpiresAtIso();
}

export async function runExpireTourHoldsJob(input?: { dryRun?: boolean }): Promise<ExpireTourHoldsResult> {
  const result = await expireDueTourHolds({ dryRun: input?.dryRun, notify: true });
  await import("@/lib/server/tour-reminders")
    .then((mod) => mod.sendDueTourReminders({ dryRun: input?.dryRun }))
    .catch((err) => {
      console.error("[kidease-tour] reminders skipped", err);
    });
  return result;
}
