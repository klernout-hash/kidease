/**
 * Server side of src/lib/ghl-form-lead.ts. Fills the contact from the account
 * when a signed-in user sent the form, files a default-role parent on Parent
 * Onboard when the form is a parent action, and never throws into the form.
 * Logs skip reasons and the form key only, never the email address.
 */
import { postGhlFormLead, type GhlFormKey, type GhlFormLeadResult } from "@/lib/ghl-form-lead";

/** A slow CRM must not hold the form open. The push keeps running after this. */
const FORM_LEAD_WAIT_MS = 6000;

function logFormLead(form: GhlFormKey, event: string, reason: string) {
  console.info(JSON.stringify({ event, form, reason }));
}

async function lookupContact(userId: string) {
  const { lookupLeadContact } = await import("@/lib/server/ghl-lead-push");
  return lookupLeadContact(userId).catch(() => null);
}

export async function captureFormLead(input: {
  form: GhlFormKey;
  /** Signed-in account that sent the form, if any. */
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  subject?: string | null;
  /** Waitlist, tour, spot, and info requests are parent actions (Parent Onboard). */
  parentAction?: boolean;
}): Promise<GhlFormLeadResult | null> {
  const work = (async (): Promise<GhlFormLeadResult | null> => {
    const userId = (input.userId || "").trim();
    let email = (input.email || "").trim();
    let name = (input.name || "").trim();
    let phone = (input.phone || "").trim();
    if (userId && (!email || !name || !phone)) {
      const found = await lookupContact(userId);
      email = email || (found?.email || "").trim();
      name = name || (found?.name || "").trim();
      phone = phone || (found?.phone || "").trim();
    }
    const result = await postGhlFormLead({
      form: input.form,
      email,
      name,
      phone,
      company: input.company,
      subject: input.subject,
      onSkip: (reason) => logFormLead(input.form, "ghl_form_lead_skipped", reason),
      onError: (message) => logFormLead(input.form, "ghl_form_lead_error", message.slice(0, 120)),
    });
    if (result.ok && !result.skipped) logFormLead(input.form, "ghl_form_lead_ok", result.opportunity);
    if (userId && input.parentAction) {
      try {
        const { ensureCrmIntake } = await import("@/lib/server/family");
        await ensureCrmIntake(userId, "parent", { parentAction: true });
      } catch (err) {
        console.error("[kidease-ghl] parent filing after form failed", err instanceof Error ? err.message : "failed");
      }
    }
    return result;
  })().catch((err) => {
    logFormLead(input.form, "ghl_form_lead_error", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), FORM_LEAD_WAIT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
