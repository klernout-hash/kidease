/**
 * Waitlist offer accepted → enrolment packet → e-sign → first invoice.
 * FEATURE_ENROLMENT_HANDOFF defaults off. Live DocuSign and the invoice
 * wait for FEATURE_ENROLMENT_HANDOFF_LIVE. Fees come from the listing.
 */

import { clipText, governmentSeesProvince, storedFeeCents, wiringEnabled, wiringMode } from "./common.ts";

export { storedFeeCents as feeCentsForAge };

export const ENROLMENT_HANDOFF_FLAG = "FEATURE_ENROLMENT_HANDOFF";

export const ENROLMENT_STEPS = ["accepted", "packet", "signed", "invoiced"] as const;
export type EnrolmentStep = (typeof ENROLMENT_STEPS)[number];

export function enrolmentHandoffEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(ENROLMENT_HANDOFF_FLAG, env);
}

export function enrolmentHandoffMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(ENROLMENT_HANDOFF_FLAG, env, dry);
}

export function envelopeIsSigned(status: string | null | undefined): boolean {
  const value = clipText(status, 40).toLowerCase();
  return value === "completed" || value === "signed";
}

export function advanceEnrolment(input: {
  step: EnrolmentStep | null;
  event: "accept" | "packet" | "signed" | "invoice";
  offerAccepted: boolean;
  envelopeSigned: boolean;
  fee: { cents: number } | { error: "fee_missing" };
}): { ok: true; step: EnrolmentStep; invoiceCents?: number } | { ok: false; error: "offer" | "order" | "unsigned" | "fee_missing" } {
  if (input.event === "accept") {
    if (!input.offerAccepted) return { ok: false, error: "offer" };
    return { ok: true, step: "accepted" };
  }
  if (input.event === "packet") {
    if (input.step !== "accepted" && input.step !== "packet") return { ok: false, error: "order" };
    return { ok: true, step: "packet" };
  }
  if (input.event === "signed") {
    if (input.step !== "packet" && input.step !== "signed") return { ok: false, error: "order" };
    if (!input.envelopeSigned) return { ok: false, error: "unsigned" };
    return { ok: true, step: "signed" };
  }
  if (input.step !== "signed" && input.step !== "invoiced") return { ok: false, error: "order" };
  if ("error" in input.fee) return { ok: false, error: "fee_missing" };
  return { ok: true, step: "invoiced", invoiceCents: input.fee.cents };
}

export function enrolmentVisibleToGovernment(actorProvince: string, recordProvince: string): boolean {
  return governmentSeesProvince({ actorProvince, recordProvince });
}
