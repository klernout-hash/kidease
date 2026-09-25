import { postGhlCrmSignup } from "@/lib/ghl-api";
import { postGhlSignupIntake, type GhlIntakeResult, type GhlIntakeTrigger } from "@/lib/ghl-intake";
import { lookupUser } from "@/lib/server/notify";
import { getSql } from "@/lib/db";

function listingIsTest(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

async function lookupProviderListing(userId: string): Promise<{ name: string; testListing: boolean }> {
  const sql = await getSql();
  const rows = await sql<{ name: string | null; is_test: number | boolean | null }>`
    select d.name, d.is_test
    from provider_daycares p
    join daycares d on d.id = p.daycare_id
    where p.user_id = ${userId}
    order by d.created_at desc
    limit 1
  `.catch(() => []);
  return {
    name: (rows[0]?.name || "").trim(),
    testListing: listingIsTest(rows[0]?.is_test),
  };
}

function logSkip(reason: string) {
  console.info("[kidease-ghl]", reason);
}

function logError(err: unknown) {
  console.error("[kidease-ghl]", err instanceof Error ? err.message : err);
}

/**
 * Webhook URL (optional) and LeadConnector API (when GHL_API_TOKEN is set).
 * Either path can no-op. Neither failure is thrown. Stage on the API path is
 * Signed up only. Never Approved.
 */
async function deliverSignup(input: {
  trigger: GhlIntakeTrigger;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  eventId?: string | null;
  testListing?: boolean;
}): Promise<GhlIntakeResult> {
  let webhook: GhlIntakeResult = { ok: false, error: "ghl-failed" };
  try {
    webhook = await postGhlSignupIntake({
      ...input,
      onSkip: logSkip,
      onError: logError,
    });
  } catch (err) {
    logError(err);
  }
  try {
    const api = await postGhlCrmSignup({
      ...input,
      onSkip: logSkip,
      onError: logError,
    });
    if (api.ok && !api.skipped) {
      console.info(
        `[kidease-ghl] ok trigger=${input.trigger} contact=${api.contactId} opportunity=${api.opportunity}`,
      );
    }
  } catch (err) {
    logError(err);
  }
  return webhook;
}

/**
 * Best-effort CRM intake after parent/provider signup or claim verify.
 * Independent of Resend / SMS. Failures are logged and never thrown to the caller.
 * API opportunity stage is Signed up only. Never Approved. Auto-Approved is forbidden.
 */
export async function captureSignupIntakeFromUser(input: {
  userId: string;
  role: "parent" | "provider";
  trigger: GhlIntakeTrigger;
  eventId?: string | null;
  company?: string | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  testListing?: boolean;
}) {
  try {
    const actor = await lookupUser(input.userId).catch(() => ({
      email: null as string | null,
      name: null as string | null,
      phone: null as string | null,
    }));
    let company = (input.company || "").trim();
    let testListing = Boolean(input.testListing);
    if (input.role === "provider") {
      const listing = await lookupProviderListing(input.userId).catch(() => ({
        name: "",
        testListing: false,
      }));
      if (!company) company = listing.name;
      if (listing.testListing) testListing = true;
    }
    return await deliverSignup({
      trigger: input.trigger,
      email: input.email ?? actor.email,
      name: input.name ?? actor.name,
      phone: input.phone ?? actor.phone,
      company,
      testListing,
      eventId: (input.eventId || "").trim() || `${input.trigger}:${input.userId}`,
    });
  } catch (err) {
    logError(err);
    return { ok: false as const, error: err instanceof Error ? err.message : "ghl-failed" };
  }
}

/**
 * Unauthenticated Enroll Now (`/claim#enroll`). Same daycare signup path as a
 * provider. Does not require a user id. Never throws.
 * API opportunity stage is Signed up only. Never Approved. Auto-Approved is forbidden.
 */
export async function captureEnrollIntake(input: {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  eventId?: string | null;
  testListing?: boolean;
}) {
  try {
    const email = (input.email || "").trim().toLowerCase();
    return await deliverSignup({
      trigger: "enroll",
      email: input.email,
      name: input.name,
      phone: input.phone,
      company: input.company,
      testListing: input.testListing,
      eventId: (input.eventId || "").trim() || (email ? `enroll:${email}` : ""),
    });
  } catch (err) {
    logError(err);
    return { ok: false as const, error: err instanceof Error ? err.message : "ghl-failed" };
  }
}
