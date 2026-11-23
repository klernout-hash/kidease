/**
 * Government money for one centre and one month.
 * Owed comes from the estimate. Set aside and sent come from the holding ledger.
 */

import type { HoldingAmounts } from "./ledger.ts";

export type RemitterType = "quarterly" | "regular" | "accelerated1" | "accelerated2";

export type DueDate = {
  date: string | null;
  verified: boolean;
  note: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addMonths(year: number, month: number, count: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** CRA calendar dates from T4001. Weekends and holidays are not moved. Accelerated threshold 2 is not estimated. */
export function craDueDate(periodEnd: string, type: RemitterType): DueDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodEnd);
  if (!match) return { date: null, verified: false, note: "Enter a real month." };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const weekend = "If that date is a weekend or a CRA holiday, the real date is the next business day.";
  if (type === "accelerated2") {
    return {
      date: null,
      verified: false,
      note: "Accelerated threshold 2 is due on the third working day. This build does not count working days.",
    };
  }
  if (type === "accelerated1") {
    if (day <= 15) {
      return { date: ymd(year, month, 25), verified: true, note: `Due the 25th of the same month. ${weekend}` };
    }
    const next = addMonths(year, month, 1);
    return { date: ymd(next.year, next.month, 10), verified: true, note: `Due the 10th of the next month. ${weekend}` };
  }
  if (type === "quarterly") {
    const quarterEndMonth = Math.ceil(month / 3) * 3;
    const next = addMonths(year, quarterEndMonth, 1);
    return {
      date: ymd(next.year, next.month, 15),
      verified: true,
      note: `Quarterly remitters owe it on the 15th after the quarter. ${weekend}`,
    };
  }
  const next = addMonths(year, month, 1);
  return {
    date: ymd(next.year, next.month, 15),
    verified: true,
    note: `Regular remitters owe it on the 15th of the next month. ${weekend} Revenu Québec may use a different date.`,
  };
}

export type BucketCode = "cpp" | "cpp2" | "ei" | "qpp" | "qpip" | "federal" | "provincial" | "gst" | "pst";

export type MoneyBucket = {
  code: BucketCode;
  owedCents: number;
  setAsideCents: number;
  sentCents: number;
  verified: boolean;
  sentence: string;
};

export type MonthStatus = "on_track" | "due_soon" | "overdue" | "mismatch";

export type MonthBreakdown = {
  month: string;
  due: DueDate;
  buckets: MoneyBucket[];
  owedCents: number;
  setAsideCents: number;
  sentCents: number;
  varianceCents: number;
  status: MonthStatus;
  alert: boolean;
  sentence: string;
  daysUntilDue: number | null;
};

const SENTENCES: Record<BucketCode, string> = {
  cpp: "CPP is the pension amount from staff plus the same amount from the centre.",
  cpp2: "CPP2 is the extra pension amount on pay above the first yearly limit.",
  ei: "EI is the insurance amount from staff plus 1.4 times that from the centre.",
  qpp: "QPP is the Quebec pension amount from staff plus the same amount from the centre.",
  qpip: "QPIP is Quebec parental insurance from staff plus the centre's share.",
  federal: "Federal income tax is the amount kept from staff pay.",
  provincial: "Provincial income tax is the amount kept from staff pay.",
  gst: "Sales tax is only on extras. Child care fees are usually exempt.",
  pst: "Provincial sales tax on extras. Left out when the rate was not verified.",
};

export function daysBetween(today: string, due: string | null): number | null {
  if (!due) return null;
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${due}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function buildMonth(input: {
  month: string;
  periodEnd: string;
  remitter: RemitterType;
  today: string;
  owed: HoldingAmounts & { gstVerified?: boolean; pstVerified?: boolean; provincialVerified?: boolean };
  setAside: HoldingAmounts;
  sent: HoldingAmounts;
}): MonthBreakdown {
  const pairs: Array<[BucketCode, number, number, number, boolean]> = [
    ["cpp", input.owed.cppCents, input.setAside.cppCents, input.sent.cppCents, true],
    ["cpp2", input.owed.cpp2Cents, input.setAside.cpp2Cents, input.sent.cpp2Cents, true],
    ["ei", input.owed.eiCents, input.setAside.eiCents, input.sent.eiCents, true],
    ["qpp", input.owed.qppCents, input.setAside.qppCents, input.sent.qppCents, true],
    ["qpip", input.owed.qpipCents, input.setAside.qpipCents, input.sent.qpipCents, true],
    ["federal", input.owed.federalCents, input.setAside.federalCents, input.sent.federalCents, true],
    ["provincial", input.owed.provincialCents, input.setAside.provincialCents, input.sent.provincialCents, input.owed.provincialVerified !== false],
    ["gst", input.owed.gstCents, input.setAside.gstCents, input.sent.gstCents, input.owed.gstVerified !== false],
    ["pst", input.owed.pstCents, input.setAside.pstCents, input.sent.pstCents, input.owed.pstVerified === true],
  ];
  const buckets: MoneyBucket[] = pairs
    .filter(([, owed, aside, sent]) => owed || aside || sent)
    .map(([code, owedCents, setAsideCents, sentCents, verified]) => ({
      code,
      owedCents,
      setAsideCents,
      sentCents,
      verified,
      sentence: SENTENCES[code],
    }));
  const sum = (pick: (row: MoneyBucket) => number) => buckets.reduce((total, row) => total + pick(row), 0);
  const owedCents = sum((row) => row.owedCents);
  const setAsideCents = sum((row) => row.setAsideCents);
  const sentCents = sum((row) => row.sentCents);
  const varianceCents = owedCents - sentCents;
  const due = craDueDate(input.periodEnd, input.remitter);
  const daysUntilDue = daysBetween(input.today, due.date);
  const mismatch = buckets.some(
    (row) => row.setAsideCents !== row.owedCents || row.sentCents > row.setAsideCents || (row.sentCents > 0 && row.sentCents !== row.owedCents && row.sentCents !== row.setAsideCents),
  );
  let status: MonthStatus = "on_track";
  if (mismatch || setAsideCents !== owedCents) status = "mismatch";
  else if (owedCents > sentCents && daysUntilDue != null && daysUntilDue < 0) status = "overdue";
  else if (owedCents > sentCents && daysUntilDue != null && daysUntilDue <= 7) status = "due_soon";
  const short = setAsideCents < owedCents;
  const alert = status === "overdue" || short;
  let sentence = "All good";
  if (varianceCents === 0 && setAsideCents === owedCents && !mismatch) sentence = "All good";
  else if (short) sentence = `Short by ${owedCents - setAsideCents} cents. Set aside the rest.`;
  else if (status === "overdue") sentence = "This is late. Send the government money.";
  else if (varianceCents > 0) sentence = "Set aside, not sent yet.";
  else sentence = "The amounts do not match. Check each line.";
  return {
    month: input.month,
    due,
    buckets,
    owedCents,
    setAsideCents,
    sentCents,
    varianceCents,
    status,
    alert,
    sentence,
    daysUntilDue,
  };
}

export function emptyAmounts(): HoldingAmounts {
  return {
    cppCents: 0,
    cpp2Cents: 0,
    eiCents: 0,
    qppCents: 0,
    qpipCents: 0,
    federalCents: 0,
    provincialCents: 0,
    gstCents: 0,
    pstCents: 0,
  };
}

export type { HoldingAmounts };
