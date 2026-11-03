/**
 * Centre tools: eleven daycare tools that competitors have. Each has its own flag, default off.
 * Pure logic only. No network, no credentials, no charges.
 */

export const CENTRE_TOOLS = [
  { id: "meals", flag: "FEATURE_MEAL_PLANNING", parent: true },
  { id: "observations", flag: "FEATURE_DEV_OBSERVATIONS", parent: true },
  { id: "pd", flag: "FEATURE_STAFF_PD", parent: false },
  { id: "maintenance", flag: "FEATURE_MAINTENANCE_CHECKLISTS", parent: false },
  { id: "cleaning", flag: "FEATURE_CLEANING_CHECKLISTS", parent: false },
  { id: "quickbooks", flag: "FEATURE_QUICKBOOKS_EXPORT", parent: false },
  { id: "tap", flag: "FEATURE_TAP_TO_PAY", parent: true },
  { id: "attendance", flag: "FEATURE_ATTENDANCE_BILLING", parent: true },
  { id: "payroll", flag: "FEATURE_PAYROLL", parent: false },
  { id: "subsidy", flag: "FEATURE_SUBSIDY_BILLING", parent: true },
  { id: "offline", flag: "FEATURE_OFFLINE_CHECKIN", parent: true },
] as const;

export type CentreToolId = (typeof CENTRE_TOOLS)[number]["id"];
export type CentreToolFlag = (typeof CENTRE_TOOLS)[number]["flag"];

/** Record kinds saved in centre_tool_records. */
export const RECORD_KINDS = ["menu", "observation", "pd", "maintenance", "cleaning", "bill", "tap_receipt"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
/** Kinds a parent may read, and the tool flag that must be on. */
export const PARENT_KINDS: Record<string, CentreToolId[]> = {
  menu: ["meals"],
  observation: ["observations"],
  bill: ["attendance", "subsidy"],
  tap_receipt: ["tap"],
};
export const KIND_TOOL: Record<RecordKind, CentreToolId> = {
  menu: "meals",
  observation: "observations",
  pd: "pd",
  maintenance: "maintenance",
  cleaning: "cleaning",
  bill: "attendance",
  tap_receipt: "tap",
};

export function enabledToolIds(isOn: (flag: CentreToolFlag) => boolean): CentreToolId[] {
  return CENTRE_TOOLS.filter((tool) => isOn(tool.flag)).map((tool) => tool.id);
}

export function parentKindsFor(tools: readonly string[]): string[] {
  return Object.entries(PARENT_KINDS)
    .filter(([, need]) => need.some((id) => tools.includes(id)))
    .map(([kind]) => kind);
}

/* ---------- 1. Meal planning (Canada's Food Guide plate) ---------- */

export const MEAL_SLOTS = ["breakfast", "am_snack", "lunch", "pm_snack"] as const;
export const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export const FOOD_GROUPS = ["veg_fruit", "whole_grain", "protein"] as const;
/** Health Canada priority food allergens. */
export const ALLERGENS = ["peanut", "tree_nut", "milk", "egg", "wheat", "soy", "sesame", "fish", "shellfish", "mustard", "sulphites"] as const;

export type MenuItem = { day: string; slot: string; food: string; groups: string[]; allergens: string[] };
export type WeeklyMenu = { weekOf: string; items: MenuItem[]; allergyNote: string };

/** Lunches that miss a Food Guide plate group. */
export function menuGaps(menu: WeeklyMenu): { day: string; missing: string[] }[] {
  const out: { day: string; missing: string[] }[] = [];
  for (const day of DAYS) {
    const lunch = menu.items.filter((item) => item.day === day && item.slot === "lunch");
    if (!lunch.length) continue;
    const have = new Set(lunch.flatMap((item) => item.groups));
    const missing = FOOD_GROUPS.filter((group) => !have.has(group));
    if (missing.length) out.push({ day, missing });
  }
  return out;
}

export function menuAllergens(menu: WeeklyMenu): string[] {
  return [...new Set(menu.items.flatMap((item) => item.allergens))].filter((a) => (ALLERGENS as readonly string[]).includes(a)).sort();
}

/* ---------- 2. Developmental observations (ELECT / HDLH) ---------- */

export const OBS_DOMAINS = ["social", "emotional", "communication", "cognitive", "physical"] as const;
export const OBS_FOUNDATIONS = ["belonging", "well_being", "engagement", "expression"] as const;
export const OBS_LEVELS = ["emerging", "developing", "consistent"] as const;
export type Observation = { bookingId: string; domain: string; foundation: string; level: string; note: string; date: string };

export function cleanObservation(input: Partial<Observation>): Observation | null {
  const note = String(input.note || "").trim().slice(0, 2000);
  const domain = (OBS_DOMAINS as readonly string[]).includes(String(input.domain)) ? String(input.domain) : "";
  if (!note || !domain || !input.bookingId) return null;
  return {
    bookingId: String(input.bookingId),
    domain,
    foundation: (OBS_FOUNDATIONS as readonly string[]).includes(String(input.foundation)) ? String(input.foundation) : "",
    level: (OBS_LEVELS as readonly string[]).includes(String(input.level)) ? String(input.level) : "developing",
    note,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) ? String(input.date) : new Date().toISOString().slice(0, 10),
  };
}

/* ---------- 3. Staff PD log ---------- */

export type PdEntry = { staffName: string; course: string; provider: string; hours: number; date: string };
export function pdTotals(rows: PdEntry[], targetHours: number): { staffName: string; hours: number; remaining: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.staffName, (map.get(row.staffName) || 0) + Math.max(0, Number(row.hours) || 0));
  return [...map.entries()]
    .map(([staffName, hours]) => ({ staffName, hours: round2(hours), remaining: round2(Math.max(0, targetHours - hours)) }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}

/* ---------- 4 + 5. Maintenance and cleaning checklists ---------- */

export type CheckTemplate = { id: string; every: "use" | "daily" | "weekly" | "monthly" };
export const MAINTENANCE_TEMPLATE: CheckTemplate[] = [
  { id: "playground", every: "daily" },
  { id: "fire_drill", every: "monthly" },
  { id: "smoke_co", every: "monthly" },
  { id: "first_aid", every: "weekly" },
  { id: "water_temp", every: "weekly" },
  { id: "exits_clear", every: "daily" },
];
export const CLEANING_TEMPLATE: CheckTemplate[] = [
  { id: "change_table", every: "use" },
  { id: "high_touch", every: "daily" },
  { id: "toys", every: "daily" },
  { id: "kitchen", every: "daily" },
  { id: "washrooms", every: "daily" },
  { id: "cots_linen", every: "weekly" },
];
export type CheckRun = { date: string; done: string[]; initials: string; room: string };
export function checklistProgress(template: CheckTemplate[], run: CheckRun): { done: number; total: number; missing: string[] } {
  const done = template.filter((row) => run.done.includes(row.id));
  return { done: done.length, total: template.length, missing: template.filter((row) => !run.done.includes(row.id)).map((row) => row.id) };
}

/* ---------- 6. QuickBooks Online import CSV ---------- */

export type InvoiceRow = { number: string; customer: string; date: string; due: string; item: string; amountCents: number };
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function quickbooksCsv(rows: InvoiceRow[]): string {
  const head = "InvoiceNo,Customer,InvoiceDate,DueDate,Item(Product/Service),ItemAmount,ItemTaxCode";
  // Licensed child care is GST/HST exempt in Canada.
  const body = rows.map((row) =>
    [row.number, row.customer, row.date, row.due, row.item, (row.amountCents / 100).toFixed(2), "Exempt"].map(csvCell).join(","),
  );
  return [head, ...body].join("\n");
}

/* ---------- 7. Tap to Pay (scaffold) ---------- */

export type TapDecision = { ok: false; reason: "off" | "no_terminal" | "amount" | "scaffold" };
/** Always refuses a live charge in this build. */
export function tapToPayDecision(on: boolean, terminalConfigured: boolean, amountCents: number): TapDecision {
  if (!on) return { ok: false, reason: "off" };
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 500000) return { ok: false, reason: "amount" };
  if (!terminalConfigured) return { ok: false, reason: "no_terminal" };
  return { ok: false, reason: "scaffold" };
}

/* ---------- 8 + 10. Attendance billing and subsidy split ---------- */

export type BillInput = {
  month: string; // YYYY-MM
  attendedDays: string[]; // YYYY-MM-DD
  scheduledDays: number;
  dailyFeeCents: number; // parent fee after CWELCC reduction
  chargeAbsent: boolean;
  sickDaysAllowed: number;
  subsidyPercent: number; // 0..100 share an agency pays
  agency: string;
};
export type Bill = {
  month: string;
  attended: number;
  billedDays: number;
  grossCents: number;
  agencyCents: number;
  parentCents: number;
  agency: string;
};

export function attendanceBill(input: BillInput): Bill {
  const attended = new Set(input.attendedDays.filter((d) => d.startsWith(input.month))).size;
  const scheduled = Math.max(attended, Math.floor(input.scheduledDays) || 0);
  const absent = scheduled - attended;
  const billedDays = input.chargeAbsent ? scheduled : attended + Math.min(absent, Math.max(0, Math.floor(input.sickDaysAllowed) || 0));
  const grossCents = billedDays * Math.max(0, Math.round(input.dailyFeeCents));
  const pct = Math.min(100, Math.max(0, Number(input.subsidyPercent) || 0));
  const agencyCents = Math.round((grossCents * pct) / 100);
  return { month: input.month, attended, billedDays, grossCents, agencyCents, parentCents: grossCents - agencyCents, agency: input.agency.trim().slice(0, 80) };
}

/** Monthly agency claim. Child initials only. */
export function agencyClaimCsv(rows: { initials: string; bill: Bill }[]): string {
  const head = "Agency,Month,Child,DaysAttended,DaysBilled,Gross,AgencyShare,ParentShare";
  return [
    head,
    ...rows
      .filter((row) => row.bill.agencyCents > 0)
      .map(({ initials, bill }) =>
        [bill.agency, bill.month, initials, bill.attended, bill.billedDays, money(bill.grossCents), money(bill.agencyCents), money(bill.parentCents)]
          .map(csvCell)
          .join(","),
      ),
  ].join("\n");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + ".")
    .join("")
    .slice(0, 6) || "?";
}

/* ---------- 9. Payroll export (gross only) ---------- */

export type PayLine = { staffName: string; hours: number; rateCents: number };
export function payrollSummary(lines: PayLine[]): { staffName: string; hours: number; grossCents: number }[] {
  return lines.map((line) => ({ staffName: line.staffName, hours: round2(line.hours), grossCents: Math.round(line.hours * line.rateCents) }));
}
/** Generic import CSV for Wagepoint, Payworks, or ADP. Deductions stay with the payroll provider. */
export function payrollCsv(periodStart: string, periodEnd: string, lines: PayLine[]): string {
  const head = "PeriodStart,PeriodEnd,Employee,RegularHours,HourlyRate,GrossPay";
  return [
    head,
    ...lines.map((line) =>
      [periodStart, periodEnd, line.staffName, round2(line.hours), money(line.rateCents), money(Math.round(line.hours * line.rateCents))].map(csvCell).join(","),
    ),
  ].join("\n");
}

/* ---------- 11. Offline check-in queue ---------- */

export type QueuedTap = { id: string; bookingId: string; action: "check_in" | "check_out"; pickupName: string; at: string };
export const OFFLINE_KEY = "kidease.offlineCheckins.v1";
export const MAX_OFFLINE_AGE_MS = 24 * 60 * 60 * 1000;

export function enqueueTap(queue: QueuedTap[], tap: QueuedTap): QueuedTap[] {
  if (queue.some((row) => row.id === tap.id)) return queue;
  return [...queue, tap].slice(-200);
}

/** A replayed tap keeps its time only inside the last 24 hours and never in the future. */
export function clampTapTime(at: string, now: number): string | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  if (t > now + 60_000) return null;
  if (now - t > MAX_OFFLINE_AGE_MS) return null;
  return new Date(t).toISOString();
}

export async function replayQueue(
  queue: QueuedTap[],
  send: (tap: QueuedTap) => Promise<boolean>,
): Promise<{ sent: number; left: QueuedTap[] }> {
  const ordered = [...queue].sort((a, b) => a.at.localeCompare(b.at));
  const left: QueuedTap[] = [];
  let sent = 0;
  for (const tap of ordered) {
    try {
      if (await send(tap)) sent += 1;
      else left.push(tap);
    } catch {
      left.push(tap);
    }
  }
  return { sent, left };
}

export function money(cents: number): string {
  return (cents / 100).toFixed(2);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
