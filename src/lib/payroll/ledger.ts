/**
 * Double-entry ledgers.
 * The holding ledger is a segregated tax account owned by the payroll partner
 * or the centre's own tax account. It never uses Stripe or KidEase operating cash.
 */

export const HOLDING_ACCOUNTS = [
  "trust_cash",
  "cpp_payable",
  "cpp2_payable",
  "ei_payable",
  "qpp_payable",
  "qpip_payable",
  "federal_tax_payable",
  "provincial_tax_payable",
  "gst_hst_payable",
  "pst_qst_payable",
] as const;

export type HoldingAccount = (typeof HOLDING_ACCOUNTS)[number];

export const BOOKS_ACCOUNTS = [
  "provider_stripe",
  "parent_fees",
  "subsidy",
  "taxable_extras",
  "wages",
  "employer_cost",
  "net_wages_payable",
  "government_payable",
  "trust_reference",
  "gst_hst_payable",
] as const;

export type BooksAccount = (typeof BOOKS_ACCOUNTS)[number];

const FORBIDDEN_IN_HOLDING = ["stripe", "operating", "platform", "kidease"];

export type JournalLine = { account: string; debitCents: number; creditCents: number };

export type JournalEntry = {
  id: string;
  daycareId: string;
  ledger: "holding" | "books";
  memo: string;
  lines: JournalLine[];
  at: string;
};

export type PostResult =
  | { ok: true; entries: JournalEntry[]; created: boolean }
  | { ok: false; error: "unbalanced" | "bad_line" | "bad_account" | "mixed_funds" | "empty" };

function balanced(lines: readonly JournalLine[]): boolean {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.debitCents) || !Number.isInteger(line.creditCents)) return false;
    if (line.debitCents < 0 || line.creditCents < 0) return false;
    if (line.debitCents > 0 && line.creditCents > 0) return false;
    if (line.debitCents === 0 && line.creditCents === 0) return false;
    debit += line.debitCents;
    credit += line.creditCents;
  }
  return debit > 0 && debit === credit;
}

function allowed(ledger: "holding" | "books", account: string): boolean {
  const name = account.toLowerCase();
  if (ledger === "holding") {
    if (FORBIDDEN_IN_HOLDING.some((word) => name.includes(word))) return false;
    return (HOLDING_ACCOUNTS as readonly string[]).includes(account);
  }
  if (name.includes("kidease") || name.includes("operating") || name.includes("platform_fee")) return false;
  return (BOOKS_ACCOUNTS as readonly string[]).includes(account);
}

/** Insert once. The same id is a no-op and does not change balances. */
export function postEntry(entries: readonly JournalEntry[], entry: JournalEntry): PostResult {
  if (entries.some((row) => row.id === entry.id)) return { ok: true, entries: [...entries], created: false };
  if (!entry.lines.length) return { ok: false, error: "empty" };
  if (!balanced(entry.lines)) return { ok: false, error: "unbalanced" };
  for (const line of entry.lines) {
    if (!allowed(entry.ledger, line.account)) {
      return { ok: false, error: entry.ledger === "holding" ? "mixed_funds" : "bad_account" };
    }
  }
  return { ok: true, entries: [...entries, entry], created: true };
}

export function balances(entries: readonly JournalEntry[], daycareId: string, ledger: "holding" | "books"): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.daycareId !== daycareId || entry.ledger !== ledger) continue;
    for (const line of entry.lines) {
      totals[line.account] = (totals[line.account] ?? 0) + line.debitCents - line.creditCents;
    }
  }
  return totals;
}

export type HoldingAmounts = {
  cppCents: number;
  cpp2Cents: number;
  eiCents: number;
  qppCents: number;
  qpipCents: number;
  federalCents: number;
  provincialCents: number;
  gstCents: number;
  pstCents: number;
};

export function holdingSetAside(input: {
  id: string;
  daycareId: string;
  at: string;
  amounts: HoldingAmounts;
}): JournalEntry {
  const lines: JournalLine[] = [];
  const credits: Array<[HoldingAccount, number]> = [
    ["cpp_payable", input.amounts.cppCents],
    ["cpp2_payable", input.amounts.cpp2Cents],
    ["ei_payable", input.amounts.eiCents],
    ["qpp_payable", input.amounts.qppCents],
    ["qpip_payable", input.amounts.qpipCents],
    ["federal_tax_payable", input.amounts.federalCents],
    ["provincial_tax_payable", input.amounts.provincialCents],
    ["gst_hst_payable", input.amounts.gstCents],
    ["pst_qst_payable", input.amounts.pstCents],
  ];
  let total = 0;
  for (const [account, amount] of credits) {
    const cents = Math.max(0, Math.round(amount));
    if (!cents) continue;
    total += cents;
    lines.push({ account, debitCents: 0, creditCents: cents });
  }
  lines.unshift({ account: "trust_cash", debitCents: total, creditCents: 0 });
  return {
    id: input.id,
    daycareId: input.daycareId,
    ledger: "holding",
    memo: "Set aside in the tax account. KidEase does not hold this money.",
    lines,
    at: input.at,
  };
}

/** Record that the partner or the centre sent the money. This does not move funds. */
export function holdingSent(input: {
  id: string;
  daycareId: string;
  at: string;
  amounts: HoldingAmounts;
}): JournalEntry {
  const aside = holdingSetAside(input);
  return {
    ...aside,
    memo: "Recorded as sent from the tax account. KidEase did not send it.",
    lines: aside.lines.map((line) => ({
      account: line.account,
      debitCents: line.creditCents,
      creditCents: line.debitCents,
    })),
  };
}

export function liabilityCents(balancesForCentre: Record<string, number>): number {
  let total = 0;
  for (const account of HOLDING_ACCOUNTS) {
    if (account === "trust_cash") continue;
    total += Math.max(0, -(balancesForCentre[account] ?? 0));
  }
  return total;
}
