/**
 * Payroll partner slot. Sandbox only.
 * Nmbr, PayEvo, and Wagepoint are named so a later adapter can plug in.
 * Nothing here moves money or calls a network.
 */

export type PartnerId = "sandbox" | "nmbr" | "payevo" | "wagepoint";

export type TrustHolder = "payroll_partner" | "provider_tax";

export type TrustAccount = {
  adapterId: "sandbox";
  holder: TrustHolder;
  /** A reference, not a bank number and not a Stripe balance. */
  ref: string;
  segregated: true;
  holdsFunds: false;
};

export type AdapterResult = {
  ok: true;
  moneyMoved: false;
  ref: string;
  message: string;
};

export interface PayrollProviderAdapter {
  id: PartnerId;
  createEmployer(input: { daycareId: string; name: string }): AdapterResult | { ok: false; error: string };
  syncEmployee(input: { daycareId: string; employeeId: string }): AdapterResult | { ok: false; error: string };
  submitPayRun(input: { daycareId: string; payRunId: string }): AdapterResult | { ok: false; error: string };
  getRemittanceStatus(input: { daycareId: string; month: string }): AdapterResult | { ok: false; error: string };
  getYearEndForms(input: { daycareId: string; year: number }): AdapterResult | { ok: false; error: string };
  handleWebhook(input: { eventId: string }): AdapterResult | { ok: false; error: string };
  trustAccount(input: { daycareId: string; holder: TrustHolder }): TrustAccount | { ok: false; error: string };
}

const NOT_CONNECTED = "This partner is not connected. No money moves.";

export function unavailableAdapter(id: Exclude<PartnerId, "sandbox">): PayrollProviderAdapter {
  const fail = (): { ok: false; error: string } => ({ ok: false, error: NOT_CONNECTED });
  return {
    id,
    createEmployer: fail,
    syncEmployee: fail,
    submitPayRun: fail,
    getRemittanceStatus: fail,
    getYearEndForms: fail,
    handleWebhook: fail,
    trustAccount: fail,
  };
}

export function sandboxAdapter(): PayrollProviderAdapter {
  return {
    id: "sandbox",
    createEmployer(input) {
      return { ok: true, moneyMoved: false, ref: `sandbox-employer:${input.daycareId}`, message: "Practice employer only." };
    },
    syncEmployee(input) {
      return { ok: true, moneyMoved: false, ref: `sandbox-employee:${input.employeeId}`, message: "Practice employee only." };
    },
    submitPayRun(input) {
      return {
        ok: true,
        moneyMoved: false,
        ref: `sandbox-payday:${input.payRunId}`,
        message: "Saved as a practice pay day. No pay was sent.",
      };
    },
    getRemittanceStatus(input) {
      return { ok: true, moneyMoved: false, ref: `sandbox-status:${input.daycareId}:${input.month}`, message: "Practice status only." };
    },
    getYearEndForms(input) {
      return { ok: true, moneyMoved: false, ref: `sandbox-year:${input.daycareId}:${input.year}`, message: "Export only. Nothing was filed." };
    },
    handleWebhook(input) {
      return { ok: true, moneyMoved: false, ref: `sandbox-event:${input.eventId}`, message: "Ignored. Sandbox has no live events." };
    },
    trustAccount(input) {
      return {
        adapterId: "sandbox",
        holder: input.holder,
        ref: `sandbox-trust:${input.holder}:${input.daycareId}`,
        segregated: true,
        holdsFunds: false,
      };
    },
  };
}

export function adapterFor(id: PartnerId): PayrollProviderAdapter {
  if (id === "sandbox") return sandboxAdapter();
  return unavailableAdapter(id);
}
