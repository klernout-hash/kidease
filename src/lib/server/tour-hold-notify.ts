import { tourStatusToLead } from "@/lib/lead-requests";
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

  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  if (input.parentUserId && !input.parentUserId.startsWith("guest:")) {
    await dispatchCustomerAlert({
      userId: input.parentUserId,
      category: "tour",
      vars: { name: input.daycareName },
      href: `/inbox/${input.conversationId}`,
      dedupeKey: `tour:${input.conversationId}:${input.parentUserId}:${input.subject}`.slice(0, 180),
      emailFallback: false,
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
      await dispatchCustomerAlert({
        userId: owner.userId,
        category: "enquiry",
        vars: { name: input.daycareName },
        href: `/inbox/${input.conversationId}?view=centre&detail=1`,
        dedupeKey: `tour:${input.conversationId}:${owner.userId}:${input.subject}`.slice(0, 180),
        emailFallback: false,
      }).catch(() => undefined);
    }
  }
}
