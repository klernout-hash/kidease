/**
 * Parent-ready CRA T778 summary and a Québec RL-24 box summary.
 * The provider types their own permit, NEQ, and slip number.
 * This file does not invent a government barcode or a certification mark.
 */

export type T778Input = {
  taxYear: number;
  childName: string;
  providerName: string;
  providerAddress: string;
  province: string;
  amountPaid: number;
  periodStart: string;
  periodEnd: string;
};

export type T778Receipt = {
  kind: "t778";
  title: string;
  lines: string[];
  text: string;
};

export type Rl24Input = {
  taxYear: number;
  childName: string;
  payerName: string;
  providerName: string;
  /** Ministère permit or NEQ, typed by the Québec provider. */
  permitOrNeq: string;
  /** RL-24 slip number, typed by the provider. */
  slipNumber: string;
  boxA: number;
  boxB?: number;
  boxC?: number;
  boxD?: number;
  boxE?: number;
  boxF?: number;
  boxG?: number;
  boxH?: number;
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

export function buildT778Receipt(input: T778Input): T778Receipt {
  const year = Number.isFinite(input.taxYear) ? Math.floor(input.taxYear) : new Date().getFullYear();
  const lines = [
    `CRA Form T778 child care expense receipt (${year})`,
    "Ready to use with your T778. This is not a government-issued slip.",
    `Child: ${clean(input.childName)}`,
    `Provider: ${clean(input.providerName)}`,
    `Provider address: ${clean(input.providerAddress, 180)}`,
    `Province or territory: ${clean(input.province, 40)}`,
    `Amount paid: ${dollars(input.amountPaid)}`,
    `Period: ${clean(input.periodStart, 20)} to ${clean(input.periodEnd, 20)}`,
    "Leave the social insurance number blank until you file. KidEase does not store it here.",
    "No barcode is printed. Attach this summary to your own T778 records.",
  ];
  return { kind: "t778", title: `T778 child care receipt ${year}`, lines, text: lines.join("\n") };
}

export function buildRl24Summary(input: Rl24Input): Rl24Result {
  const permit = clean(input.permitOrNeq, 40);
  const slip = clean(input.slipNumber, 40);
  if (!permit || !slip) return { ok: false, reason: "missing-provider-ids" };
  const year = Number.isFinite(input.taxYear) ? Math.floor(input.taxYear) : new Date().getFullYear();
  const boxes: Array<[string, number | undefined]> = [
    ["A", input.boxA],
    ["B", input.boxB],
    ["C", input.boxC],
    ["D", input.boxD],
    ["E", input.boxE],
    ["F", input.boxF],
    ["G", input.boxG],
    ["H", input.boxH],
  ];
  const lines = [
    `Relevé 24 (RL-24) box A to H summary and receipt (${year})`,
    "The provider entered the Ministère permit or NEQ and the slip number. KidEase did not assign them.",
    "This summary is not a Revenu Québec certification and has no barcode.",
    `Child: ${clean(input.childName)}`,
    `Payer: ${clean(input.payerName)}`,
    `Provider: ${clean(input.providerName)}`,
    `Ministère permit or NEQ: ${permit}`,
    `RL-24 slip number: ${slip}`,
    ...boxes.map(([box, amount]) => `Box ${box}: ${dollars(amount ?? 0)}`),
  ];
  return { ok: true, kind: "rl24", title: `RL-24 summary ${year}`, lines, text: lines.join("\n") };
}

export function receiptFileName(kind: "t778" | "rl24", year: number, childName: string): string {
  const slug = clean(childName, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "child";
  return `${kind}-${year}-${slug}.txt`;
}
