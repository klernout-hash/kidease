/**
 * Staff forms: TD1 (federal and provincial), TP-1015.3-V, pay deposit, and
 * emergency contact. Staff fill in their own; the owner or a payroll editor
 * approves. Approved tax claims feed pay. Off unless FEATURE_PROVIDER_PAYROLL is on.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { payrollSlipXmlEnabled, providerPayrollEnabled } from "@/lib/features";
import { nid } from "@/lib/utils";
import { formsForProvince } from "@/lib/payroll/employee-forms.ts";
import { approveForm, myForms, readForm, revealBank, reviewForms, submitForm } from "@/lib/payroll/forms-store.ts";
import { claimFromAnswers, isTaxFormKind, parseContact, parseTaxAnswers, provincialKind, taxFormPdfLines } from "@/lib/payroll/tax-forms.ts";

function id(value: unknown): string {
  return String(value ?? "").trim().slice(0, 128);
}

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

function requireOn() {
  if (!providerPayrollEnabled()) throw new Error("payroll:off");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** My forms at this centre: what I filled in and whether it is approved. Never a full bank number. */
export const payrollMyForms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: id(input?.daycareId) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    const mine = await myForms(sql, context.userId, data.daycareId);
    if (!mine) return { onPay: false as const, province: "", name: "", forms: [], slipsEnabled: false };
    const { slipsReady } = await import("@/lib/payroll/slips-store.ts");
    const slipsEnabled = payrollSlipXmlEnabled() && (await slipsReady(sql));
    return { onPay: true as const, province: mine.province, name: mine.name, forms: mine.forms, slipsEnabled };
  });

/** Send a TD1, provincial TD1, or TP-1015.3-V to the owner. */
export const payrollSubmitTaxForm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; kind?: string; mode?: string; claimDollars?: string; signedName?: string; certified?: boolean }) => ({
    daycareId: id(input?.daycareId),
    kind: String(input?.kind ?? ""),
    mode: String(input?.mode ?? ""),
    claimDollars: String(input?.claimDollars ?? "").slice(0, 20),
    signedName: String(input?.signedName ?? "").slice(0, 120),
    certified: input?.certified === true,
  }))
  .handler(async ({ context, data }) => {
    requireOn();
    if (!isTaxFormKind(data.kind)) throw new Error("payroll:form");
    const sql = await getSql();
    const mine = await myForms(sql, context.userId, data.daycareId);
    if (!mine) throw new Error("payroll:own_form");
    // Quebec staff send TP-1015.3-V, not a provincial TD1, and the reverse.
    if (data.kind !== "td1_federal" && data.kind !== provincialKind(mine.province)) throw new Error("payroll:form");
    const parsed = parseTaxAnswers(data);
    if (!parsed.ok) throw new Error(`payroll:${parsed.error}`);
    const saved = await submitForm(sql, {
      id: nid(),
      userId: context.userId,
      daycareId: data.daycareId,
      kind: data.kind,
      answersJson: JSON.stringify(parsed.answers),
      bankCipher: null,
      bankLast4: null,
      savedOn: today(),
    });
    if (!saved) throw new Error("payroll:own_form");
    return { ...saved, status: "pending" as const, sent: false as const };
  });

/** Bank details are sealed before they are saved. Only the last 4 digits come back. */
export const payrollSubmitDeposit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; institution?: string; transit?: string; account?: string; signedName?: string }) => ({
    daycareId: id(input?.daycareId),
    institution: String(input?.institution ?? "").slice(0, 10),
    transit: String(input?.transit ?? "").slice(0, 10),
    account: String(input?.account ?? "").slice(0, 20),
    signedName: String(input?.signedName ?? "").trim().slice(0, 120),
  }))
  .handler(async ({ context, data }) => {
    requireOn();
    if (data.signedName.length < 2) throw new Error("payroll:signature");
    const { planDeposit } = await import("@/lib/payroll/bank-seal.ts");
    const sealed = planDeposit({ institution: data.institution, transit: data.transit, account: data.account });
    if (!sealed.ok) throw new Error(`payroll:${sealed.error}`);
    const saved = await submitForm(await getSql(), {
      id: nid(),
      userId: context.userId,
      daycareId: data.daycareId,
      kind: "deposit",
      answersJson: JSON.stringify({ signedName: data.signedName }),
      bankCipher: sealed.cipher,
      bankLast4: sealed.last4,
      savedOn: today(),
    });
    if (!saved) throw new Error("payroll:own_form");
    return { ...saved, bankLast4: sealed.last4, status: "pending" as const };
  });

export const payrollSubmitContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; contactName?: string; contactPhone?: string; relation?: string }) => ({
    daycareId: id(input?.daycareId),
    contactName: String(input?.contactName ?? ""),
    contactPhone: String(input?.contactPhone ?? ""),
    relation: String(input?.relation ?? ""),
  }))
  .handler(async ({ context, data }) => {
    requireOn();
    const parsed = parseContact(data);
    if (!parsed.ok) throw new Error("payroll:contact");
    const saved = await submitForm(await getSql(), {
      id: nid(),
      userId: context.userId,
      daycareId: data.daycareId,
      kind: "emergency",
      answersJson: JSON.stringify(parsed.answers),
      bankCipher: null,
      bankLast4: null,
      savedOn: today(),
    });
    if (!saved) throw new Error("payroll:own_form");
    return { ...saved, status: "pending" as const };
  });

/** Owner or payroll editor: forms waiting for approval and recent approvals. */
export const payrollReviewForms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: id(input?.daycareId) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    return { forms: await reviewForms(await getSql(), context.userId, data.daycareId) };
  });

/** Approve a form. A tax form's claim goes onto the person's pay record at the same time. */
export const payrollApproveForm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; formId?: string }) => ({ daycareId: id(input?.daycareId), formId: id(input?.formId) }))
  .handler(async ({ context, data }) => {
    requireOn();
    const sql = await getSql();
    const form = await readForm(sql, context.userId, data.daycareId, data.formId);
    if (!form) throw new Error("payroll:permission");
    if (form.status !== "pending") throw new Error("payroll:stale");
    let claimState: string | null = null;
    let claimCents = 0;
    if (isTaxFormKind(form.kind)) {
      if (!form.tax) throw new Error("payroll:form");
      const claim = claimFromAnswers(form.tax);
      claimState = claim.state;
      claimCents = claim.cents;
    }
    const ok = await approveForm(sql, { userId: context.userId, daycareId: data.daycareId, formId: data.formId, claimState, claimCents });
    if (!ok) throw new Error("payroll:permission");
    return { ok: true as const };
  });

/** Printable lines for an approved tax form (owner, payroll editor, or the person). */
export const payrollFormPdf = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; formId?: string; locale?: string }) => ({
    daycareId: id(input?.daycareId),
    formId: id(input?.formId),
    locale: input?.locale === "fr" ? ("fr" as const) : ("en" as const),
  }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const form = await readForm(await getSql(), context.userId, data.daycareId, data.formId);
    if (!form || form.status !== "approved" || !form.tax) throw new Error("payroll:form");
    const card = formsForProvince(form.province).find((row) => row.kind === form.kind);
    if (!card) throw new Error("payroll:form");
    return {
      filename: `kidease-${form.kind}-${form.savedOn}.pdf`,
      lines: taxFormPdfLines({
        locale: data.locale,
        centre: form.centre,
        person: form.name,
        card,
        version: form.version,
        savedOn: form.savedOn,
        approvedOn: form.approvedOn,
        answers: form.tax,
      }),
    };
  });

/**
 * Owner only, after a fresh sign-in: the full bank details of a deposit form.
 * Every reveal writes an audit row with who and when.
 */
export const payrollRevealBank = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; formId?: string }) => ({ daycareId: id(input?.daycareId), formId: id(input?.formId) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const { assertRecentReauth } = await import("@/lib/server/reauth.server");
    assertRecentReauth(context.userId);
    const cipher = await revealBank(await getSql(), { id: nid(), userId: context.userId, daycareId: data.daycareId, formId: data.formId });
    if (!cipher) throw new Error("payroll:owner_only");
    const { openBank } = await import("@/lib/payroll/bank-seal.ts");
    const plain = openBank(cipher);
    if (!plain) throw new Error("payroll:bank_key");
    const [institution, transit, account] = plain.split("|");
    return { institution: institution ?? "", transit: transit ?? "", account: account ?? "" };
  });
