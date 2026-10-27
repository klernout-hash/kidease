import { currentPeriod } from "./stripe-methods.ts";

/** Centre and parent money screens. Amounts are cents. Missing facts stay null. */

export type EarnItem = { id: string; description: string; cents: number };

export type RawEarnBill = {
  id: string;
  status: string;
  grossCents: number | null;
  feeCents: number | null;
  netCents: number | null;
  period: string | null;
  paidAt: string | null;
  dueAt: string | null;
  payoutOn: string | null;
  parentName: string | null;
  parentImage: string | null;
  childName: string | null;
  number: string | null;
  centreName: string | null;
  centrePhoto: string | null;
  listingId: string | null;
  payoutRef: string | null;
  programStart: string | null;
  receiptUrl: string | null;
  items: EarnItem[];
};

export type EarnLine = {
  id: string;
  kind: "tuition" | "extra" | "fee";
  label: string;
  cents: number;
};

export type EarnBill = {
  id: string;
  status: "paid" | "scheduled";
  grossCents: number | null;
  feeCents: number | null;
  netCents: number | null;
  period: string | null;
  paidAt: string | null;
  dueAt: string | null;
  payoutOn: string | null;
  parentName: string | null;
  parentImage: string | null;
  childName: string | null;
  number: string | null;
  centreName: string | null;
  centrePhoto: string | null;
  listingId: string | null;
  payoutRef: string | null;
  programStart: string | null;
  receiptUrl: string | null;
  lines: EarnLine[];
  kinds: Array<"tuition" | "extra">;
};

export type MonthBucket = {
  period: string;
  paidCents: number | null;
  upcomingCents: number | null;
  paidGrossCents: number | null;
  upcomingGrossCents: number | null;
  paidFeeCents: number | null;
  upcomingFeeCents: number | null;
};

export type MonthFacts = { days: number; children: number; tours: number };

export type StatementSlice = {
  id: string;
  name: string;
  cents: number;
};

export type Statement = {
  period: string;
  isNew: boolean;
  grossCents: number | null;
  feeCents: number | null;
  taxCents: null;
  adjustmentCents: null;
  netCents: number | null;
  paidCents: number | null;
  upcomingCents: number | null;
  daysAttended: number | null;
  enrolledChildren: number | null;
  tours: number | null;
  photos: string[];
  listings: StatementSlice[];
  types: StatementSlice[];
  payouts: StatementSlice[];
};

export type EarningsDesk = {
  ok: true;
  maskedEmail: string | null;
  payouts: "on" | "off" | "unknown";
  truncated: boolean;
  thisMonthPaidCents: number | null;
  thisMonthUpcomingCents: number | null;
  thisMonthTotalCents: number | null;
  bars: MonthBucket[];
  byMonth: MonthBucket[];
  paid: EarnBill[];
  upcoming: EarnBill[];
  statements: Statement[];
};

export type EarningsResult = EarningsDesk | { ok: false };

export type AggRow = {
  period: string;
  status: string;
  netCents: number;
  grossCents: number;
  feeCents: number;
};

const EMPTY_BUCKET = (period: string): MonthBucket => ({
  period,
  paidCents: null,
  upcomingCents: null,
  paidGrossCents: null,
  upcomingGrossCents: null,
  paidFeeCents: null,
  upcomingFeeCents: null,
});

export function emptyEarnings(): EarningsResult {
  return { ok: false };
}

export function monthPeriods(now = new Date(), count = 6): string[] {
  const periods: string[] = [];
  const start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1);
  for (let i = 0; i < count; i += 1) {
    periods.push(currentPeriod(new Date(start.getFullYear(), start.getMonth() + i, 1)));
  }
  return periods;
}

export function yearSpan(now = new Date()): string[] {
  const start = new Date(now.getFullYear() - 1, 0, 1);
  return monthPeriods(new Date(now.getFullYear(), 11, 1), (now.getFullYear() - start.getFullYear()) * 12 + 12);
}

export function safePhoto(raw: string | null | undefined): string | null {
  const photo = String(raw || "")
    .split(/[,\n]/)
    .map((part) => part.trim())
    .find((part) => part.startsWith("http://") || part.startsWith("https://") || part.startsWith("/"));
  return photo || null;
}

export function payoutReference(...ids: Array<string | null | undefined>): string | null {
  for (const id of ids) {
    const value = String(id || "").trim();
    if (/^(po|tr|py)_/.test(value)) return value;
  }
  return null;
}

export function maskEmail(email: string | null | undefined): string | null {
  const value = String(email || "").trim().toLowerCase();
  const at = value.indexOf("@");
  if (at < 1) return null;
  const host = value.slice(at + 1);
  if (!host.includes(".")) return null;
  return `${value.slice(0, 1)}•••@${host}`;
}

function finite(value: number | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function add(base: number | null, next: number | null): number | null {
  if (next == null) return base;
  return (base ?? 0) + next;
}

export function shapeBill(raw: RawEarnBill, audience: "centre" | "parent"): EarnBill | null {
  const status = raw.status === "paid" ? "paid" : raw.status === "sent" ? "scheduled" : null;
  if (!status) return null;
  if (audience === "parent" && status !== "paid") return null;
  const lines: EarnLine[] = [];
  raw.items.forEach((item, index) => {
    const cents = finite(item.cents);
    if (cents == null) return;
    const label = item.description.trim();
    lines.push({
      id: item.id || `item-${index}`,
      kind: index === 0 ? "tuition" : "extra",
      label,
      cents,
    });
  });
  const gross = finite(raw.grossCents);
  if (!lines.length && gross != null) {
    lines.push({ id: "tuition", kind: "tuition", label: "", cents: gross });
  }
  const fee = finite(raw.feeCents);
  if (audience === "centre" && fee != null && fee > 0) {
    lines.push({ id: "fee", kind: "fee", label: "", cents: -fee });
  }
  const kinds: Array<"tuition" | "extra"> = [];
  if (lines.some((line) => line.kind === "tuition")) kinds.push("tuition");
  if (lines.some((line) => line.kind === "extra")) kinds.push("extra");
  return {
    id: raw.id,
    status,
    grossCents: gross,
    feeCents: audience === "centre" ? fee : null,
    netCents: audience === "centre" ? finite(raw.netCents) : gross,
    period: periodOf(raw.period),
    paidAt: raw.paidAt,
    dueAt: raw.dueAt,
    payoutOn: raw.payoutOn,
    parentName: textOrNull(raw.parentName),
    parentImage: safePhoto(raw.parentImage),
    childName: textOrNull(raw.childName),
    number: textOrNull(raw.number),
    centreName: textOrNull(raw.centreName),
    centrePhoto: safePhoto(raw.centrePhoto),
    listingId: textOrNull(raw.listingId),
    payoutRef: payoutReference(raw.payoutRef),
    programStart: dateOrNull(raw.programStart),
    receiptUrl: httpsOrNull(raw.receiptUrl),
    lines,
    kinds,
  };
}

function textOrNull(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function periodOf(value: string | null | undefined): string | null {
  const period = String(value || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(period) ? period : null;
}

function dateOrNull(value: string | null | undefined): string | null {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function httpsOrNull(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return text.startsWith("https://") ? text : null;
}

function foldAggs(rows: readonly AggRow[]): Map<string, MonthBucket> {
  const map = new Map<string, MonthBucket>();
  for (const row of rows) {
    const period = periodOf(row.period);
    if (!period) continue;
    const side = row.status === "paid" ? "paid" : row.status === "sent" ? "upcoming" : null;
    if (!side) continue;
    const net = finite(row.netCents);
    if (net == null) continue;
    const bucket = map.get(period) ?? EMPTY_BUCKET(period);
    const gross = finite(row.grossCents);
    const fee = finite(row.feeCents);
    if (side === "paid") {
      bucket.paidCents = add(bucket.paidCents, net);
      bucket.paidGrossCents = add(bucket.paidGrossCents, gross);
      bucket.paidFeeCents = add(bucket.paidFeeCents, fee);
    } else {
      bucket.upcomingCents = add(bucket.upcomingCents, net);
      bucket.upcomingGrossCents = add(bucket.upcomingGrossCents, gross);
      bucket.upcomingFeeCents = add(bucket.upcomingFeeCents, fee);
    }
    map.set(period, bucket);
  }
  return map;
}

function fill(map: Map<string, MonthBucket>, periods: readonly string[]): MonthBucket[] {
  return periods.map((period) => map.get(period) ?? EMPTY_BUCKET(period));
}

function combined(paid: number | null, upcoming: number | null): number | null {
  if (paid == null && upcoming == null) return null;
  return (paid ?? 0) + (upcoming ?? 0);
}

export function shapeEarningsDesk(
  input: {
    aggregates: readonly AggRow[];
    bills: readonly RawEarnBill[];
    facts: Readonly<Record<string, MonthFacts>> | null;
    payouts: "on" | "off" | "unknown";
    maskedEmail: string | null;
    truncated: boolean;
  },
  now = new Date(),
): EarningsDesk {
  const map = foldAggs(input.aggregates);
  const span = yearSpan(now);
  const byMonth = fill(map, span);
  const bars = fill(map, monthPeriods(now, 6));
  const current = map.get(currentPeriod(now));
  const paid = input.bills
    .map((bill) => shapeBill(bill, "centre"))
    .filter((bill): bill is EarnBill => bill?.status === "paid")
    .sort((a, b) => String(b.paidAt || b.period || "").localeCompare(String(a.paidAt || a.period || "")));
  const upcoming = input.bills
    .map((bill) => shapeBill(bill, "centre"))
    .filter((bill): bill is EarnBill => bill?.status === "scheduled")
    .sort((a, b) => String(a.dueAt || a.payoutOn || a.period || "").localeCompare(String(b.dueAt || b.payoutOn || b.period || "")));
  const statements = [...map.values()]
    .filter((bucket) => bucket.paidCents != null || bucket.upcomingCents != null)
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 18)
    .map((bucket, index) => statementFor(bucket, paid.concat(upcoming), input.facts, index === 0));
  return {
    ok: true,
    maskedEmail: input.maskedEmail,
    payouts: input.payouts,
    truncated: input.truncated,
    thisMonthPaidCents: current?.paidCents ?? null,
    thisMonthUpcomingCents: current?.upcomingCents ?? null,
    thisMonthTotalCents: combined(current?.paidCents ?? null, current?.upcomingCents ?? null),
    bars,
    byMonth,
    paid,
    upcoming,
    statements,
  };
}

function statementFor(
  bucket: MonthBucket,
  bills: readonly EarnBill[],
  facts: Readonly<Record<string, MonthFacts>> | null,
  isNew: boolean,
): Statement {
  const monthBills = bills.filter((bill) => bill.period === bucket.period);
  const net = combined(bucket.paidCents, bucket.upcomingCents);
  const complete = net != null && sumCents(monthBills.map((bill) => bill.netCents)) === net;
  const fact = facts ? (facts[bucket.period] ?? { days: 0, children: 0, tours: 0 }) : null;
  return {
    period: bucket.period,
    isNew,
    grossCents: combined(bucket.paidGrossCents, bucket.upcomingGrossCents),
    feeCents: combined(bucket.paidFeeCents, bucket.upcomingFeeCents),
    taxCents: null,
    adjustmentCents: null,
    netCents: net,
    paidCents: bucket.paidCents,
    upcomingCents: bucket.upcomingCents,
    daysAttended: fact ? fact.days : null,
    enrolledChildren: fact ? fact.children : null,
    tours: fact ? fact.tours : null,
    photos: complete ? unique(monthBills.map((bill) => bill.centrePhoto)).slice(0, 3) : [],
    listings: complete ? groupBills(monthBills, (bill) => bill.listingId, (bill) => bill.centreName || bill.listingId || "") : [],
    types: complete ? typeSlices(monthBills) : [],
    payouts: complete ? groupBills(monthBills, (bill) => bill.payoutRef, (bill) => bill.payoutRef || "") : [],
  };
}

function unique(values: Array<string | null>): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function sumCents(values: Array<number | null>): number | null {
  let total = 0;
  let found = false;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) return null;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function groupBills(
  bills: readonly EarnBill[],
  idOf: (bill: EarnBill) => string | null,
  nameOf: (bill: EarnBill) => string,
): StatementSlice[] {
  const groups = new Map<string, StatementSlice>();
  for (const bill of bills) {
    const id = idOf(bill);
    if (!id || bill.netCents == null) continue;
    const current = groups.get(id) ?? { id, name: nameOf(bill), cents: 0 };
    current.cents += bill.netCents;
    groups.set(id, current);
  }
  return [...groups.values()];
}

function typeSlices(bills: readonly EarnBill[]): StatementSlice[] {
  const groups = new Map<string, StatementSlice>();
  for (const bill of bills) {
    for (const line of bill.lines) {
      if (line.kind === "fee") continue;
      const current = groups.get(line.kind) ?? { id: line.kind, name: line.kind, cents: 0 };
      current.cents += line.cents;
      groups.set(line.kind, current);
    }
  }
  return [...groups.values()];
}

export type DateFilter = "all" | "this-month" | "last-month" | "this-year";
export type TypeFilter = "all" | "tuition" | "extra";

export function filterBills(
  bills: readonly EarnBill[],
  filter: { dates: DateFilter; listingId: string | null; type: TypeFilter },
  now = new Date(),
): EarnBill[] {
  const month = currentPeriod(now);
  const previous = currentPeriod(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const year = String(now.getFullYear());
  return bills.filter((bill) => {
    if (filter.listingId && bill.listingId !== filter.listingId) return false;
    if (filter.type !== "all" && !bill.kinds.includes(filter.type)) return false;
    const when = bill.period || String(bill.paidAt || bill.dueAt || "").slice(0, 7);
    if (filter.dates === "this-month" && when !== month) return false;
    if (filter.dates === "last-month" && when !== previous) return false;
    if (filter.dates === "this-year" && !when.startsWith(year)) return false;
    return true;
  });
}

export function listingChoices(bills: readonly EarnBill[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const bill of bills) {
    if (!bill.listingId || seen.has(bill.listingId)) continue;
    seen.set(bill.listingId, bill.centreName || bill.listingId);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

export function sumField(bills: readonly EarnBill[], field: "netCents" | "grossCents"): number | null {
  return sumCents(bills.map((bill) => bill[field]));
}

export function billsCsv(bills: readonly EarnBill[], amount: "netCents" | "grossCents"): string {
  const lines = ["date,status,amount_cents,parent,child,centre,invoice"];
  for (const bill of bills) {
    const date = (bill.paidAt || bill.dueAt || bill.period || "").slice(0, 10);
    lines.push(
      [
        date,
        bill.status,
        bill[amount] == null ? "" : String(bill[amount]),
        bill.parentName || "",
        bill.childName || "",
        bill.centreName || "",
        bill.number || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function yearBuckets(buckets: readonly MonthBucket[], year: number): MonthBucket[] {
  return monthPeriods(new Date(year, 11, 1), 12).map(
    (period) => buckets.find((bucket) => bucket.period === period) ?? EMPTY_BUCKET(period),
  );
}

export function bucketTotal(bucket: MonthBucket | undefined, showUpcoming: boolean): number | null {
  if (!bucket) return null;
  return showUpcoming ? combined(bucket.paidCents, bucket.upcomingCents) : bucket.paidCents;
}

export function statementLines(bill: EarnBill, cad: (cents: number) => string, title: string): string[] {
  const lines = [title];
  if (bill.number) lines.push(bill.number);
  if (bill.centreName) lines.push(bill.centreName);
  if (bill.parentName) lines.push(bill.parentName);
  for (const line of bill.lines) lines.push(`${line.label || line.kind} ${cad(line.cents)}`);
  const total = bill.grossCents ?? bill.netCents;
  if (total != null) lines.push(cad(total));
  return lines;
}

export function formatEarnDate(iso: string | null | undefined, french: boolean): string | null {
  if (!iso) return null;
  const raw = iso.length <= 10 ? `${iso.slice(0, 10)}T12:00:00` : iso;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(french ? "fr-CA" : "en-CA", { month: "short", day: "numeric", year: "numeric" });
}
