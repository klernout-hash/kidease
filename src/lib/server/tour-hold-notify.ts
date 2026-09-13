import { tourStatusToLead } from "@/lib/lead-requests";
import { sendPushNotification } from "@/lib/server/push.server";
import { lookupUser, notifyThreadParty } from "@/lib/server/notify";
import { listCentreOwnerEmails } from "@/lib/server/thread-access";
import type { getSql } from "@/lib/db";

type Sql = Awaited<ReturnType<typeof getSql>>;

function appOrigin() {
  return process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
}

export async function syncLeadFromTour(sql: Sql, tourId: string, status: string) {
  const next = tourStatusToLead(status);
  await sql`
    update lead_requests
    set status = ${next},
        updated_at = now(),
        responded_at = coalesce(responded_at, now())
    where source_kind = ${"tour_request"} and source_id = ${tourId}
  `.catch(() => undefined);
}

/** Resend (notifyThreadParty) + existing push path when FEATURE_PUSH is on. */
export async function notifyTourParties(
  sql: Sql,
  input: {
    conversationId: string;
    daycareId: string;
    daycareName: string;
    parentUserId: string;
    parentEmail?: string | null;
    parentName?: string | null;
    subject: string;
    preview: string;
  },
) {
  const threadUrl = `${appOrigin()}/inbox/${input.conversationId}`;
  const parent = input.parentUserId.startsWith("guest:")
    ? { email: input.parentEmail ?? null, name: input.parentName ?? null }
    : await lookupUser(input.parentUserId);
  const parentEmail = parent.email || input.parentEmail;
  const parentName = parent.name || input.parentName;
  const owners = await listCentreOwnerEmails(sql, input.daycareId);

  await notifyThreadParty({
    to: parentEmail,
    name: parentName,
    subject: input.subject,
    preview: input.preview,
    threadUrl,
    daycareName: input.daycareName,
  }).catch(() => undefined);

  if (input.parentUserId && !input.parentUserId.startsWith("guest:")) {
    await sendPushNotification({
      userId: input.parentUserId,
      title: input.subject,
      body: input.preview,
    }).catch(() => undefined);
  }

  for (const owner of owners) {
    await notifyThreadParty({
      to: owner.email,
      name: owner.name,
      subject: input.subject,
      preview: input.preview,
      threadUrl,
      daycareName: input.daycareName,
    }).catch(() => undefined);
    if (owner.userId) {
      await sendPushNotification({
        userId: owner.userId,
        title: input.subject,
        body: input.preview,
      }).catch(() => undefined);
    }
  }
}
