/**
 * Extra tax the employee asks to have taken off each cheque.
 * It is added on top of the calculated income tax. It is not a new tax rate.
 *
 * As of 22 November 2026:
 * - CRA form TD1, "Additional tax to be deducted". The employer deducts that
 *   extra amount from each payment.
 *   https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1.html
 * - Revenu Québec form TP-1015.3-V, additional source deduction. The employer
 *   withholds the extra Québec income tax the employee asks for.
 *   https://www.revenuquebec.ca/en/online-services/forms-and-publications/current-details/tp-1015.3-v/
 */

export const EXTRA_TAX_AS_OF = "2026-11-22";

export const EXTRA_TAX_CRA = {
  asOf: EXTRA_TAX_AS_OF,
  name: "TD1 additional tax to be deducted",
  source: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1.html",
} as const;

export const EXTRA_TAX_RQ = {
  asOf: EXTRA_TAX_AS_OF,
  name: "TP-1015.3-V additional source deduction",
  source: "https://www.revenuquebec.ca/en/online-services/forms-and-publications/current-details/tp-1015.3-v/",
} as const;

export type ExtraTaxAuthority = "cra" | "revenu_quebec";

export function extraTaxAuthorityFor(province: string): ExtraTaxAuthority {
  return province.toUpperCase() === "QC" ? "revenu_quebec" : "cra";
}

export function parseExtraTaxDollars(raw: string): { ok: true; cents: number } | { ok: false; error: "amount" } {
  const cleaned = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, error: "amount" };
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000_00) return { ok: false, error: "amount" };
  return { ok: true, cents };
}

/** Staff may ask only for themselves. The owner approves. Nobody else can. */
export function decideExtraTaxSubmit(input: { samePerson: boolean; role: string | null }):
  | { ok: true }
  | { ok: false; status: 403; reason: "own_request" } {
  if (input.samePerson && (input.role === "staff" || input.role === "lead" || input.role === "manager" || input.role === "owner")) {
    return { ok: true };
  }
  return { ok: false, status: 403, reason: "own_request" };
}

export function decideExtraTaxApprove(input: { isOwner: boolean }):
  | { ok: true }
  | { ok: false; status: 403; reason: "owner_only" } {
  if (input.isOwner) return { ok: true };
  return { ok: false, status: 403, reason: "owner_only" };
}

export function approvedExtra(input: { requestedCents: number; status: "pending" | "approved" | "declined" }): number {
  if (input.status !== "approved") return 0;
  return Math.max(0, Math.round(input.requestedCents));
}

export function extraTaxTooltip(locale: "en" | "fr", authority: ExtraTaxAuthority): string {
  if (locale === "fr") {
    if (authority === "revenu_quebec") {
      return `Revenu Québec, formulaire TP-1015.3, retenue supplémentaire à la source. Vérifié le ${EXTRA_TAX_AS_OF}. ${EXTRA_TAX_RQ.source}`;
    }
    return `Agence du revenu du Canada, formulaire TD1, « Impôt supplémentaire à retenir ». Vérifié le ${EXTRA_TAX_AS_OF}. ${EXTRA_TAX_CRA.source}`;
  }
  if (authority === "revenu_quebec") {
    return `Revenu Québec form TP-1015.3-V, additional source deduction. Checked ${EXTRA_TAX_AS_OF}. ${EXTRA_TAX_RQ.source}`;
  }
  return `CRA form TD1, additional tax to be deducted. The centre takes this extra off each cheque. Checked ${EXTRA_TAX_AS_OF}. ${EXTRA_TAX_CRA.source}`;
}
