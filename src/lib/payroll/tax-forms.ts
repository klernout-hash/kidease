/**
 * Staff tax forms on the phone: TD1 (federal), the province's TD1, and
 * Revenu Québec's TP-1015.3-V. The person answers in plain words; the owner
 * or a payroll editor approves; the approved claim feeds the deduction engine.
 * Until a form is approved, pay uses the basic personal amounts.
 * The official form always wins. Each card links to it with an as-of date.
 */

import { formsForProvince, type EmployeeFormCard, type FormKind } from "./employee-forms.ts";
import { formatCad } from "../cad-format.ts";

export const TAX_FORM_KINDS = ["td1_federal", "td1_provincial", "tp1015"] as const;
export type TaxFormKind = (typeof TAX_FORM_KINDS)[number];

/** basic: the basic personal amount only. claim: a total claim from the form. zero: claims $0 here. */
export type ClaimMode = "basic" | "claim" | "zero";
export type ClaimState = "missing" | ClaimMode;

export type TaxAnswers = {
  mode: ClaimMode;
  /** Total claim in cents, only for mode "claim". */
  claimCents: number | null;
  /** Typed full name as the signature. */
  signedName: string;
  certified: true;
};

export type DepositAnswers = { institution: string; transit: string; account: string };
export type ContactAnswers = { contactName: string; contactPhone: string; relation: string };

/** Biggest total claim we accept. Real claims are far smaller; this stops typos like an extra zero. */
export const MAX_CLAIM_CENTS = 15_000_000;

export function isTaxFormKind(value: string): value is TaxFormKind {
  return (TAX_FORM_KINDS as readonly string[]).includes(value);
}

/** Tax forms this person fills in, by province. Quebec: TD1 federal and TP-1015.3-V. */
export function taxFormsFor(province: string): EmployeeFormCard[] {
  return formsForProvince(province).filter((card) => isTaxFormKind(card.kind));
}

/** Which tax form carries the provincial claim for this province. */
export function provincialKind(province: string): "td1_provincial" | "tp1015" {
  return province.toUpperCase() === "QC" ? "tp1015" : "td1_provincial";
}

function dollarsToCents(text: string): number | null {
  const clean = text.replace(/[\s$]/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export type TaxParse =
  | { ok: true; answers: TaxAnswers }
  | { ok: false; error: "mode" | "amount" | "signature" | "certify" };

/** Check what the person typed. Nothing is saved unless this passes. */
export function parseTaxAnswers(raw: {
  mode?: string;
  claimDollars?: string;
  signedName?: string;
  certified?: boolean;
}): TaxParse {
  const mode =
    raw.mode === "basic" || raw.mode === "claim" || raw.mode === "zero" ? raw.mode : null;
  if (!mode) return { ok: false, error: "mode" };
  let claimCents: number | null = null;
  if (mode === "claim") {
    claimCents = dollarsToCents(String(raw.claimDollars ?? ""));
    if (claimCents == null || claimCents <= 0 || claimCents > MAX_CLAIM_CENTS)
      return { ok: false, error: "amount" };
  }
  const signedName = String(raw.signedName ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
  if (signedName.length < 2) return { ok: false, error: "signature" };
  if (raw.certified !== true) return { ok: false, error: "certify" };
  return { ok: true, answers: { mode, claimCents, signedName, certified: true } };
}

/** Read saved answers back. Bad JSON is treated as no form. */
export function readTaxAnswers(json: string): TaxAnswers | null {
  try {
    const value = JSON.parse(json) as Partial<TaxAnswers>;
    const parsed = parseTaxAnswers({
      mode: value.mode,
      claimDollars: value.claimCents != null ? (value.claimCents / 100).toFixed(2) : "",
      signedName: value.signedName,
      certified: value.certified === true,
    });
    return parsed.ok ? parsed.answers : null;
  } catch {
    return null;
  }
}

/** What approval writes to the person's pay record: state, and cents when the state is claim or zero. */
export function claimFromAnswers(answers: TaxAnswers): { state: ClaimMode; cents: number } {
  if (answers.mode === "claim") return { state: "claim", cents: answers.claimCents ?? 0 };
  if (answers.mode === "zero") return { state: "zero", cents: 0 };
  return { state: "basic", cents: 0 };
}

/** The claim the engine should use, or null for the basic personal amount. */
export function engineClaim(state: string | null | undefined, cents: number): number | null {
  if (state === "claim") return Math.max(0, Math.round(cents));
  if (state === "zero") return 0;
  return null;
}

/** "approved" once both the federal and the provincial (or Quebec) forms are approved. */
export function td1Status(
  federal: string | null | undefined,
  provincial: string | null | undefined,
): "approved" | "pending" | "missing" {
  const f = federal && federal !== "missing";
  const p = provincial && provincial !== "missing";
  if (f && p) return "approved";
  if (f || p) return "pending";
  return "missing";
}

export function parseContact(raw: {
  contactName?: string;
  contactPhone?: string;
  relation?: string;
}): { ok: true; answers: ContactAnswers } | { ok: false; error: "contact" } {
  const contactName = String(raw.contactName ?? "")
    .trim()
    .slice(0, 120);
  const contactPhone = String(raw.contactPhone ?? "")
    .replace(/[^\d+()\-\s]/g, "")
    .trim()
    .slice(0, 30);
  const relation = String(raw.relation ?? "")
    .trim()
    .slice(0, 60);
  if (contactName.length < 2 || contactPhone.replace(/\D/g, "").length < 10)
    return { ok: false, error: "contact" };
  return { ok: true, answers: { contactName, contactPhone, relation } };
}

function cad(cents: number, locale: "en" | "fr"): string {
  return formatCad(cents / 100, locale === "fr" ? "fr-CA" : "en-CA");
}

/** One plain line about a tax form answer, for the owner and the PDF. */
export function claimSummary(answers: TaxAnswers, locale: "en" | "fr"): string {
  if (answers.mode === "claim") {
    return locale === "fr"
      ? `Montant total demandé : ${cad(answers.claimCents ?? 0, locale)}`
      : `Total claim: ${cad(answers.claimCents ?? 0, locale)}`;
  }
  if (answers.mode === "zero") {
    return locale === "fr"
      ? "Demande 0 $ ici (un autre emploi utilise les montants)"
      : "Claims $0 here (another job uses the amounts)";
  }
  return locale === "fr" ? "Montant personnel de base seulement" : "Basic personal amount only";
}

/** PDF lines for an approved tax form. Uses the repo's one-page PDF helper. No bank or SIN numbers. */
export function taxFormPdfLines(input: {
  locale: "en" | "fr";
  centre: string;
  person: string;
  card: EmployeeFormCard;
  version: number;
  savedOn: string;
  approvedOn: string | null;
  answers: TaxAnswers;
}): string[] {
  const fr = input.locale === "fr";
  return [
    "KidEase",
    `${fr ? input.card.titleFr : input.card.titleEn} (${input.card.officialName})`,
    `${fr ? "Centre" : "Centre"}: ${input.centre}`,
    `${fr ? "Personne" : "Person"}: ${input.person}`,
    claimSummary(input.answers, input.locale),
    `${fr ? "Signé par" : "Signed by"}: ${input.answers.signedName} · ${input.savedOn}`,
    ...(input.approvedOn ? [`${fr ? "Approuvé le" : "Approved on"}: ${input.approvedOn}`] : []),
    `${fr ? "Version" : "Version"} ${input.version}`,
    "",
    fr ? "Version officielle" : "Official version",
    `${input.card.officialName} · ${fr ? "vérifié le" : "checked"} ${input.card.asOf}`,
    input.card.officialUrl,
    fr
      ? "Si ce résumé et le formulaire officiel diffèrent, le formulaire officiel l'emporte."
      : "If this summary and the official form differ, the official form wins.",
  ];
}

export type { FormKind };
