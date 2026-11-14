import { tourStatusToLead } from "@/lib/lead-requests";
import { notifyThreadParty } from "@/lib/server/notify";
import { listCentreOwnerEmails } from "@/lib/server/thread-access";
import type { getSql } from "@/lib/db";
import type { AlertDispatchResult } from "@/lib/server/alert-dispatch";

type Sql = Awaited<ReturnType<typeof getSql>>;

export type TourEffectResult = { ok: boolean; errors: string[] };

function appOrigin() {
  return process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
}

/** Legacy callers can ignore the result; scheduled work must check it. */
export async function syncLeadFromTour(
  sql: Sql,
  tourId: string,
  status: string,
): Promise<TourEffectResult> {
  const errors: string[] = [];
  const next = tourStatusToLead(status);
  const tours = await sql<{
    user_id: string;
    daycare_id: string;
    child_id: string | null;
    child_name: string | null;
  }>`
    select user_id, daycare_id, child_id, child_name from tour_requests where id = ${tourId} limit 1
  `.catch(() => {
    errors.push("tour_lead_lookup_failed");
    return [];
  });
  if (tours[0] && status !== "cancelled" && status !== "declined" && status !== "expired") {
    const { rememberCentreLead } = await import("@/lib/server/lead-intake-write");
    const done = status === "completed" || status === "attended";
    const result = await rememberCentreLead(sql, {
      entry: done ? "tour_completed" : "tour_request",
      daycareId: tours[0].daycare_id,
      parentUserId: tours[0].user_id,
      childId: tours[0].child_id,
      childLabel: tours[0].child_name,
    });
    if (!result.ok) errors.push("tour_lead_intake_failed");
  }
  await sql`
    update lead_requests
    set status = ${next},
        updated_at = now(),
        responded_at = coalesce(responded_at, now())
    where source_kind = ${"tour_request"} and source_id = ${tourId}
  `.catch(() => {
    errors.push("tour_lead_update_failed");
  });
  return { ok: errors.length === 0, errors };
}

/** The same email/display-name precedence as lookupUser, with visible read failures. */
async function tourParent(sql: Sql, userId: string, errors: string[]) {
  const users = await sql
    .query<{ email: string | null; name: string | null }>(
      `select email, name, "emailVerified" from "user" where id = $1 limit 1`,
      [userId],
    )
    .catch(() => {
      errors.push("tour_parent_lookup_failed");
      return [];
    });
  const profiles = await sql
    .query<{ display_name: string | null }>(
      `select display_name, phone, city from profiles where user_id = $1 limit 1`,
      [userId],
    )
    .catch(() => {
      errors.push("tour_parent_profile_failed");
      return [];
    });
  return {
    email: users[0]?.email ?? null,
    name: (profiles[0]?.display_name || "").trim() || (users[0]?.name || "").trim() || null,
  };
}

/** Resend/SendGrid and existing push gates. Only this tour's alert is dispatched. */
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
    now?: Date;
  },
): Promise<TourEffectResult & { mail: string[]; alerts: AlertDispatchResult[] }> {
  const errors: string[] = [];
  const mail: string[] = [];
  const alerts: AlertDispatchResult[] = [];
  const threadUrl = `${appOrigin()}/inbox/${input.conversationId}`;
  const parent = input.parentUserId.startsWith("guest:")
    ? { email: input.parentEmail ?? null, name: input.parentName ?? null }
    : await tourParent(sql, input.parentUserId, errors);
  // Keep the shared owner recipient policy, but observe failures it otherwise hides.
  const ownerSql = ((parts: TemplateStringsArray, ...values: unknown[]) =>
    sql(parts, ...values).catch((error: unknown) => {
      errors.push("tour_owner_lookup_failed");
      throw error;
    })) as Sql;
  const owners = await listCentreOwnerEmails(ownerSql, input.daycareId).catch(() => {
    errors.push("tour_owner_lookup_failed");
    return [];
  });

  const sendMail = async (to: string | null | undefined, name: string | null | undefined) => {
    try {
      const result = await notifyThreadParty({
        to,
        name,
        subject: input.subject,
        preview: input.preview,
        threadUrl,
        daycareName: input.daycareName,
      });
      mail.push(result.status);
      if (result.status === "failed") errors.push("tour_mail_failed");
    } catch {
      mail.push("failed");
      errors.push("tour_mail_failed");
    }
  };
  const sendAlert = async (userId: string, category: "tour" | "enquiry", href: string) => {
    try {
      const { dispatchTourCustomerAlert } = await import("@/lib/server/alert-dispatch");
      const result = await dispatchTourCustomerAlert({
        userId,
        category,
        vars: { name: input.daycareName },
        href,
        dedupeKey: `tour:${input.conversationId}:${userId}:${input.subject}`.slice(0, 180),
        emailFallback: false,
        now: input.now,
      });
      alerts.push(result);
      if (!result.ok) errors.push(...result.errors);
    } catch {
      alerts.push({ status: "skipped", reason: "error", pushed: false, emailed: false });
      errors.push("tour_alert_failed");
    }
  };

  await sendMail(parent.email || input.parentEmail, parent.name || input.parentName);
  if (input.parentUserId && !input.parentUserId.startsWith("guest:")) {
    await sendAlert(input.parentUserId, "tour", `/inbox/${input.conversationId}`);
  }
  for (const owner of owners) {
    await sendMail(owner.email, owner.name);
    if (owner.userId)
      await sendAlert(
        owner.userId,
        "enquiry",
        `/inbox/${input.conversationId}?view=centre&detail=1`,
      );
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], mail, alerts };
}
