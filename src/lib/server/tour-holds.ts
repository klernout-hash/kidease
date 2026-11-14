import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { holdExpiresAtIso } from "@/lib/tour-hold";
import { tourStatusBody } from "@/lib/threads";
import { notifyTourParties, syncLeadFromTour } from "@/lib/server/tour-hold-notify";
import type { TourReminderPhaseResult } from "@/lib/server/tour-reminders";

export type TourExpiryPhaseResult = {
  status: "complete" | "dry_run" | "failed";
  due: number;
  claimed: number;
  lostClaims: number;
  messagesWritten: number;
  conversationsUpdated: number;
  leadSyncsCompleted: number;
  notificationsCompleted: number;
  failures: {
    scan: number;
    claim: number;
    message: number;
    conversation: number;
    lead: number;
    notify: number;
  };
};

export type ExpireTourHoldsResult = {
  ok: boolean;
  /** Confirmed transitions; during dry-run only, the legacy projected due count. */
  expired: number;
  dryRun: boolean;
  expiry: TourExpiryPhaseResult;
};

export type TourHoldsJobResult = ExpireTourHoldsResult & {
  reminders: TourReminderPhaseResult;
};

/** Safe for logs/HTTP results: never retain driver text, parameters or recipient data. */
export class TourHoldExpiryError extends Error {
  readonly result: ExpireTourHoldsResult;

  constructor(phase: "scan" | "claim", result: ExpireTourHoldsResult) {
    super(`Tour hold expiry ${phase} failed`);
    this.name = "TourHoldExpiryError";
    this.result = result;
  }
}

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
 * Existing book/list callers remain; only the successful transition owns effects.
 * Claims commit before effects: a process crash or lost acknowledgement can still
 * leave incomplete delivery. This is not a transactional outbox or a replay queue.
 */
export async function expireDueTourHolds(input?: {
  dryRun?: boolean;
  notify?: boolean;
}): Promise<ExpireTourHoldsResult> {
  const dryRun = Boolean(input?.dryRun);
  const notify = input?.notify !== false;
  const expiry: TourExpiryPhaseResult = {
    status: dryRun ? "dry_run" : "complete",
    due: 0,
    claimed: 0,
    lostClaims: 0,
    messagesWritten: 0,
    conversationsUpdated: 0,
    leadSyncsCompleted: 0,
    notificationsCompleted: 0,
    failures: { scan: 0, claim: 0, message: 0, conversation: 0, lead: 0, notify: 0 },
  };
  const result = (): ExpireTourHoldsResult => ({
    ok: !Object.values(expiry.failures).some(Boolean),
    expired: dryRun ? expiry.due : expiry.claimed,
    dryRun,
    expiry,
  });
  let sql: Awaited<ReturnType<typeof getSql>>;
  let due: DueHold[];
  try {
    sql = await getSql();
    due = await sql<DueHold>`
      select t.id, t.conversation_id, t.user_id, t.daycare_id, d.name as daycare_name,
             t.contact_email, t.parent_first_name, t.parent_last_name
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      where t.status = ${"pending"}
        and coalesce(t.hold_expires_at, t.created_at + interval '48 hours') <= now()
    `;
    expiry.due = due.length;
  } catch {
    expiry.failures.scan += 1;
    expiry.status = "failed";
    throw new TourHoldExpiryError("scan", result());
  }

  if (dryRun) return result();

  for (const tour of due) {
    let claimed: { id: string }[];
    try {
      claimed = await sql<{ id: string }>`
        update tour_requests
        set status = ${"expired"},
            centre_note = coalesce(centre_note, ${"Hold expired: slot released"}),
            responded_at = coalesce(responded_at, now())
        where id = ${tour.id} and status = ${"pending"}
          and coalesce(hold_expires_at, created_at + interval '48 hours') <= now()
        returning id
      `;
    } catch {
      expiry.failures.claim += 1;
      expiry.status = "failed";
      throw new TourHoldExpiryError("claim", result());
    }
    if (!claimed[0]) {
      expiry.lostClaims += 1;
      continue;
    }
    expiry.claimed += 1;

    const body = tourStatusBody({ status: "expired", daycareName: tour.daycare_name });
    try {
      const written = await sql<{ id: string }>`
        insert into messages (id, conversation_id, sender, body, kind)
        values (${nid("msg")}, ${tour.conversation_id}, ${"system"}, ${body}, ${"status"})
        returning id
      `;
      if (!written[0]) throw new Error("Message was not confirmed");
      expiry.messagesWritten += 1;
    } catch {
      expiry.failures.message += 1;
    }
    try {
      const updated = await sql<{ id: string }>`
        update conversations set last_at = now() where id = ${tour.conversation_id}
        returning id
      `;
      if (!updated[0]) throw new Error("Conversation update was not confirmed");
      expiry.conversationsUpdated += 1;
    } catch {
      expiry.failures.conversation += 1;
    }
    try {
      const synced = await syncLeadFromTour(sql, tour.id, "expired");
      if (!synced.ok) throw new Error("Lead sync failed");
      expiry.leadSyncsCompleted += 1;
    } catch {
      expiry.failures.lead += 1;
    }

    if (notify) {
      const guestName = `${tour.parent_first_name || ""} ${tour.parent_last_name || ""}`.trim();
      try {
        const notified = await notifyTourParties(sql, {
          conversationId: tour.conversation_id,
          daycareId: tour.daycare_id,
          daycareName: tour.daycare_name,
          parentUserId: tour.user_id,
          parentEmail: tour.contact_email,
          parentName: guestName || null,
          subject: `Tour hold expired: ${tour.daycare_name}`,
          preview: body,
        });
        if (!notified.ok) throw new Error("Tour notification failed");
        // Completed includes intentional channel skips; this is not a delivery count.
        expiry.notificationsCompleted += 1;
      } catch {
        expiry.failures.notify += 1;
      }
    }
  }

  if (Object.values(expiry.failures).some(Boolean)) expiry.status = "failed";
  return result();
}

export function nextHoldExpiresAt(): string {
  return holdExpiresAtIso();
}

export async function runExpireTourHoldsJob(input?: {
  dryRun?: boolean;
}): Promise<TourHoldsJobResult> {
  const result = await expireDueTourHolds({ dryRun: input?.dryRun, notify: true });
  let reminders: TourReminderPhaseResult;
  try {
    const mod = await import("@/lib/server/tour-reminders");
    reminders = await mod.sendDueTourReminders({ dryRun: input?.dryRun });
  } catch {
    // Unexpected module/entry failures are distinct from the reminder's own phases.
    reminders = {
      ok: false,
      status: "failed",
      dryRun: Boolean(input?.dryRun),
      due: 0,
      eligible: 0,
      sent: 0,
      noticesConfirmed: 0,
      markedSent: 0,
      alreadyMarked: 0,
      failures: { scan: 0, notice: 0, mark: 0, entry: 1 },
    };
  }
  return { ...result, ok: result.ok && reminders.ok, reminders };
}
