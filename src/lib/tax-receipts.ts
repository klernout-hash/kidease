/**
 * Parent-ready CRA T778 summary and a Québec RL-24 box summary.
 * The provider types the family or account-holder name, the centre, the amount,
 * the period, and a receipt number. This file does not collect or print a child's name.
 * It does not invent a government barcode or a certification mark.
 */

export type T778Input = {
  taxYear: number;
  /** Family or account-holder name. Never a child's name. */
  receiptFor: string;
  providerName: string;
  providerAddress?: string;
  province?: string;
  amountPaid: number;
  periodStart: string;
  periodEnd: string;
  receiptNumber?: string;
};

export type T778Receipt = {
  kind: "t778";
  title: string;
  lines: string[];
  text: string;
};

export type Rl24Input = {
  taxYear: number;
  receiptFor: string;
  payerName?: string;
  providerName: string;
  /** Ministère permit or NEQ, typed by the Québec provider. Used only as the receipt number when no slip is set. */
  permitOrNeq: string;
  /** RL-24 slip number, typed by the provider. Printed as the receipt number. */
  slipNumber: string;
  boxA: number;
  boxB?: number;
  boxC?: number;
  boxD?: number;
  boxE?: number;
  boxF?: number;
  boxG?: number;
  boxH?: number;
  periodStart?: string;
  periodEnd?: string;
};

export type Rl24Result =
  | { ok: true; kind: "rl24"; title: string; lines: string[]; text: string }
  | { ok: false; reason: "missing-provider-ids" };

function clean(value: string, max = 120): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function dollars(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return v.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function receiptNumberFor(kind: "t778" | "rl24", year: number, given?: string): string {
  const typed = clean(given || "", 40);
  if (typed) return typed;
  return `${kind.toUpperCase()}-${year}`;
}

export function buildT778Receipt(input: T778Input): T778Receipt {
  const year = Number.isFinite(input.taxYear) ? Math.floor(input.taxYear) : new Date().getFullYear();
  const number = receiptNumberFor("t778", year, input.receiptNumber);
  const lines = [
    `Receipt for: ${clean(input.receiptFor)}`,
    `Centre: ${clean(input.providerName)}`,
    `Amount: ${dollars(input.amountPaid)}`,
    `Period: ${clean(input.periodStart, 20)} to ${clean(input.periodEnd, 20)}`,
    `Receipt number: ${number}`,
  ];
  return { kind: "t778", title: `Child care receipt ${year}`, lines, text: lines.join("\n") };
}

export function buildRl24Summary(input: Rl24Input): Rl24Result {
  const permit = clean(input.permitOrNeq, 40);
  const slip = clean(input.slipNumber, 40);
  if (!permit || !slip) return { ok: false, reason: "missing-provider-ids" };
  const year = Number.isFinite(input.taxYear) ? Math.floor(input.taxYear) : new Date().getFullYear();
  const start = clean(input.periodStart || `${year}-01-01`, 20);
  const end = clean(input.periodEnd || `${year}-12-31`, 20);
  const lines = [
    `Receipt for: ${clean(input.receiptFor)}`,
    `Centre: ${clean(input.providerName)}`,
    `Amount: ${dollars(input.boxA)}`,
    `Period: ${start} to ${end}`,
    `Receipt number: ${slip}`,
  ];
  return { ok: true, kind: "rl24", title: `Child care receipt ${year}`, lines, text: lines.join("\n") };
}

export function receiptFileName(kind: "t778" | "rl24", year: number, receiptFor: string): string {
  const slug = clean(receiptFor, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "family";
  return `${kind}-${year}-${slug}.txt`;
}
