/**
 * Dates a centre must not miss.
 * Each rule names its source. Unverified dates are not invented.
 * Notices reuse unified-alert quiet hours, dedupe, and channel rules.
 * Staff never receive them. Sends stay off unless the live flag is on,
 * and this module never calls email, push, or SMS.
 */

import { decidePayBooks, type PayrollRole } from "./access.ts";
import { craDueDate, type RemitterType } from "./remittance.ts";
import {
  decideUnifiedAlert,
  isQuietAt,
  unifiedDeliveryBlocked,
  type UnifiedSettings,
} from "../unified-alerts.ts";

export type DeadlineKind =
  | "remittance"
  | "payday"
  | "approval"
  | "t4"
  | "rl1"
  | "roe"
  | "gst"
  | "pst"
  | "manual_edit"
  | "missing_wage"
  | "short_set_aside"
  | "partner_status";

export type DeadlineTone = "red" | "amber" | "green" | "later";

export type Deadline = {
  id: string;
  daycareId: string;
  kind: DeadlineKind;
  due: string | null;
  done: boolean;
  tone: DeadlineTone;
  titleEn: string;
  titleFr: string;
  citation: string;
  verified: boolean;
};

export type DeadlineInput = {
  daycareId: string;
  today: string;
  remitter: RemitterType;
  periodEnd: string;
  payDate: string | null;
  approvalDate: string | null;
  taxYear: number;
  roePeriodEnd: string | null;
  gstPeriodEnd: string | null;
  gstFrequency: "monthly" | "quarterly" | "annual" | "none";
  province: string;
  hasTaxableExtra: boolean;
  unapprovedEdits: number;
  missingWage: boolean;
  shortCents: number;
  partnerFailed: boolean;
  remittanceDone: boolean;
  paydayDone: boolean;
};

const T4001 =
  "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/remitting-source-deductions/how-when-remit-due-dates.html";
const T4_GUIDE =
  "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/completing-filing-information-returns/t4-information-employers.html";
const ROE_GUIDE = "https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-roe/access-roe.html";
const GST_GUIDE = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/complete-file-instructions.html";
const RL1_GUIDE = "https://www.revenuquebec.ca/en/businesses/rl-slips-and-summaries/rl-1-slip-employment-and-other-income/";

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekday(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Move Saturday and Sunday to Monday. CRA holidays are not in this calendar. */
export function nextWeekday(ymd: string): string {
  const day = weekday(ymd);
  if (day === 6) return addDays(ymd, 2);
  if (day === 0) return addDays(ymd, 1);
  return ymd;
}

export function lastFebruary(year: number): string {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return `${year}-02-${leap ? "29" : "28"}`;
}

export function daysUntil(today: string, due: string | null): number | null {
  if (!due) return null;
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${due}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function deadlineTone(input: { due: string | null; today: string; done: boolean; forceRed?: boolean }): DeadlineTone {
  if (input.done) return "green";
  if (input.forceRed) return "red";
  const days = daysUntil(input.today, input.due);
  if (days == null) return "later";
  if (days < 0) return "red";
  if (days <= 3) return "amber";
  return "later";
}

function row(input: Omit<Deadline, "tone"> & { today: string; forceRed?: boolean }): Deadline {
  return {
    ...input,
    tone: deadlineTone({ due: input.due, today: input.today, done: input.done, forceRed: input.forceRed }),
  };
}

export function buildDeadlines(input: DeadlineInput): Deadline[] {
  const remittance = craDueDate(input.periodEnd, input.remitter);
  const t4Raw = lastFebruary(input.taxYear + 1);
  const t4 = nextWeekday(t4Raw);
  const items: Deadline[] = [
    row({
      id: `${input.daycareId}:remittance:${input.periodEnd}`,
      daycareId: input.daycareId,
      kind: "remittance",
      due: remittance.date,
      done: input.remittanceDone,
      titleEn: "Send government money",
      titleFr: "Envoyer l'argent du gouvernement",
      citation: `${remittance.note} ${T4001}`,
      verified: remittance.verified,
      today: input.today,
      forceRed: !remittance.date && !input.remittanceDone,
    }),
    row({
      id: `${input.daycareId}:payday:${input.payDate || "unset"}`,
      daycareId: input.daycareId,
      kind: "payday",
      due: input.payDate,
      done: input.paydayDone,
      titleEn: "Pay day",
      titleFr: "Jour de paie",
      citation: "The centre picks pay day. This is not a government date.",
      verified: true,
      today: input.today,
      forceRed: !input.payDate && !input.paydayDone,
    }),
    row({
      id: `${input.daycareId}:approval:${input.approvalDate || "unset"}`,
      daycareId: input.daycareId,
      kind: "approval",
      due: input.approvalDate,
      done: input.unapprovedEdits === 0 && Boolean(input.approvalDate),
      titleEn: "Approve hours",
      titleFr: "Approuver les heures",
      citation: "The centre sets the hour cutoff. It is not a government date.",
      verified: true,
      today: input.today,
      forceRed: input.unapprovedEdits > 0 && input.approvalDate != null && (daysUntil(input.today, input.approvalDate) ?? 1) < 0,
    }),
    row({
      id: `${input.daycareId}:t4:${input.taxYear}`,
      daycareId: input.daycareId,
      kind: "t4",
      due: t4,
      done: false,
      titleEn: "T4 slips",
      titleFr: "Feuillets T4",
      citation: `CRA: file T4 slips and the summary by the last day of February. If that day is a weekend, use the next business day. Holidays are not in this calendar. ${T4_GUIDE}`,
      verified: true,
      today: input.today,
    }),
    row({
      id: `${input.daycareId}:rl1:${input.taxYear}`,
      daycareId: input.daycareId,
      kind: "rl1",
      due: input.province === "QC" ? lastFebruary(input.taxYear + 1) : null,
      done: input.province !== "QC",
      titleEn: "RL-1 slips",
      titleFr: "Feuillets RL-1",
      citation: `Revenu Québec: file RL-1 slips by the last day of February. A weekend move was not verified, so the date stays on that calendar day. ${RL1_GUIDE}`,
      verified: input.province === "QC",
      today: input.today,
    }),
    row({
      id: `${input.daycareId}:roe:${input.roePeriodEnd || "none"}`,
      daycareId: input.daycareId,
      kind: "roe",
      due: input.roePeriodEnd ? addDays(input.roePeriodEnd, 5) : null,
      done: !input.roePeriodEnd,
      titleEn: "Record of employment",
      titleFr: "Relevé d'emploi",
      citation: `Service Canada: an electronic ROE for weekly, biweekly, or twice-a-month pay is due five calendar days after the pay period that contains the interruption. ${ROE_GUIDE}`,
      verified: Boolean(input.roePeriodEnd),
      today: input.today,
    }),
    row({
      id: `${input.daycareId}:gst:${input.gstPeriodEnd || "none"}`,
      daycareId: input.daycareId,
      kind: "gst",
      due:
        input.gstFrequency === "monthly" || input.gstFrequency === "quarterly"
          ? input.gstPeriodEnd
            ? addDays(input.gstPeriodEnd, 31)
            : null
          : null,
      done: input.gstFrequency === "none" || input.gstFrequency === "annual",
      titleEn: "Sales tax filing",
      titleFr: "Déclaration de taxe de vente",
      citation:
        input.gstFrequency === "annual"
          ? `Annual GST filing dates differ. This build does not guess them. ${GST_GUIDE}`
          : `CRA: a monthly or quarterly GST/HST return is due one month after the period. This uses 31 days. Confirm the day on your CRA account. ${GST_GUIDE}`,
      verified: input.gstFrequency === "monthly" || input.gstFrequency === "quarterly",
      today: input.today,
      forceRed: input.hasTaxableExtra && input.gstFrequency !== "none" && !input.gstPeriodEnd,
    }),
    row({
      id: `${input.daycareId}:pst`,
      daycareId: input.daycareId,
      kind: "pst",
      due: null,
      done: !input.hasTaxableExtra || !["BC", "MB", "SK"].includes(input.province),
      titleEn: "Provincial sales tax",
      titleFr: "Taxe de vente provinciale",
      citation: "PST or RST filing dates for childcare extras were not verified. No date is shown.",
      verified: false,
      today: input.today,
      forceRed: false,
    }),
    row({
      id: `${input.daycareId}:manual`,
      daycareId: input.daycareId,
      kind: "manual_edit",
      due: input.approvalDate,
      done: input.unapprovedEdits === 0,
      titleEn: "Time change to approve",
      titleFr: "Changement d'heure à approuver",
      citation: "A manual time change needs the owner's reason and approval before pay day.",
      verified: true,
      today: input.today,
      forceRed: input.unapprovedEdits > 0,
    }),
    row({
      id: `${input.daycareId}:wage`,
      daycareId: input.daycareId,
      kind: "missing_wage",
      due: null,
      done: !input.missingWage,
      titleEn: "Add missing pay",
      titleFr: "Ajouter la paie manquante",
      citation: "Pay day cannot run until each person has an hourly rate or a salary.",
      verified: true,
      today: input.today,
      forceRed: input.missingWage,
    }),
    row({
      id: `${input.daycareId}:short`,
      daycareId: input.daycareId,
      kind: "short_set_aside",
      due: remittance.date,
      done: input.shortCents <= 0,
      titleEn: "Government money is short",
      titleFr: "Il manque de l'argent du gouvernement",
      citation: "Set aside must match the amount owed before the CRA due date. KidEase does not hold the money.",
      verified: true,
      today: input.today,
      forceRed: input.shortCents > 0,
    }),
    row({
      id: `${input.daycareId}:partner`,
      daycareId: input.daycareId,
      kind: "partner_status",
      due: remittance.date,
      done: !input.partnerFailed,
      titleEn: "Payroll partner needs a look",
      titleFr: "Le partenaire de paie a besoin d'un coup d'œil",
      citation: "The partner reports status. A failed or unpaid status is not a KidEase payment.",
      verified: true,
      today: input.today,
      forceRed: input.partnerFailed,
    }),
  ];
  return items.filter((item) => item.kind !== "pst" || !item.done || item.tone === "red");
}

const TONE_RANK: Record<DeadlineTone, number> = { red: 0, amber: 1, later: 2, green: 3 };

export function urgentDeadlines(items: readonly Deadline[]): Deadline[] {
  return [...items].sort((a, b) => {
    const tone = TONE_RANK[a.tone] - TONE_RANK[b.tone];
    if (tone !== 0) return tone;
    if (!a.due && b.due) return -1;
    if (a.due && !b.due) return 1;
    return (a.due || "").localeCompare(b.due || "");
  });
}

export function redCount(items: readonly Deadline[]): number {
  return items.filter((item) => item.tone === "red").length;
}

export type NoticeSlot = "d7" | "d3" | "d1" | "due" | "overdue";

export type NoticePlan = {
  dedupeKey: string;
  typeId: "daycare_payroll_due" | "admin_payroll_due";
  userId: string;
  daycareId: string;
  deadlineId: string;
  slot: NoticeSlot;
  critical: boolean;
  channels: Array<"in_app" | "email" | "push">;
  sms: "skip" | "held" | "ready";
  outbound: "now" | "later" | "none";
  reason?: string;
  localeTitle: string;
};

export function noticeSlot(today: string, due: string | null, done: boolean): NoticeSlot | null {
  if (done || !due) return null;
  const days = daysUntil(today, due);
  if (days == null) return null;
  if (days === 7) return "d7";
  if (days === 3) return "d3";
  if (days === 1) return "d1";
  if (days === 0) return "due";
  if (days < 0) return "overdue";
  return null;
}

export function planDeadlineNotices(input: {
  today: string;
  now: Date;
  deadlines: readonly Deadline[];
  ownerUserId: string;
  role: PayrollRole;
  isOwner: boolean;
  isPlatformAdmin?: boolean;
  locale: "en" | "fr";
  sentKeys: readonly string[];
  settings: UnifiedSettings;
  payrollAlerts: boolean;
  live: boolean;
  pushArmed: boolean;
  smsArmed: boolean;
  env?: Record<string, string | undefined>;
}): NoticePlan[] {
  const ownerGate = decidePayBooks({ isOwner: input.isOwner });
  const admin = input.isPlatformAdmin === true;
  if (!ownerGate.ok && !admin) return [];
  if (input.role === "staff" || input.role === "lead" || input.role === "manager" || input.role === "read_only") return [];
  const sent = new Set(input.sentKeys);
  const plans: NoticePlan[] = [];
  for (const item of input.deadlines) {
    if (item.tone === "green" || item.done) continue;
    const slot = noticeSlot(input.today, item.due, item.done);
    if (!slot) continue;
    const critical = slot === "overdue" || item.kind === "short_set_aside" || item.kind === "partner_status";
    const typeId = admin && !ownerGate.ok ? "admin_payroll_due" : "daycare_payroll_due";
    const userId = typeId === "admin_payroll_due" ? input.ownerUserId : input.ownerUserId;
    const dedupeKey = `payroll:${item.id}:${slot}:${slot === "overdue" ? input.today : "once"}`.slice(0, 180);
    if (sent.has(dedupeKey)) continue;
    const decision = decideUnifiedAlert({
      typeId,
      settings: input.settings,
      typeEnabled: true,
      now: input.now,
      flagOn: input.payrollAlerts,
      live: input.live,
      pushArmed: input.pushArmed,
      previewOrTest: unifiedDeliveryBlocked(input.env ?? {}) != null,
      blocked: false,
      duplicate: false,
      forceCritical: critical || typeId === "admin_payroll_due",
    });
    const quiet = isQuietAt({
      now: input.now,
      timeZone: input.settings.timeZone,
      quietStart: input.settings.quietStart,
      quietEnd: input.settings.quietEnd,
    });
    let sms: NoticePlan["sms"] = "skip";
    if (input.smsArmed && input.payrollAlerts && input.live && input.settings.master) {
      sms = !critical && quiet ? "held" : "ready";
    }
    if (!input.payrollAlerts) sms = "skip";
    plans.push({
      dedupeKey,
      typeId,
      userId,
      daycareId: item.daycareId,
      deadlineId: item.id,
      slot,
      critical,
      channels: decision.channels,
      sms,
      outbound: decision.outbound,
      reason: decision.reason,
      localeTitle: input.locale === "fr" ? item.titleFr : item.titleEn,
    });
  }
  return plans;
}

/** No network. A live flag still does not send from this build. */
export function deliverPayrollNotice(plan: NoticePlan, flags: { alerts: boolean; live: boolean }): { delivered: false; reason: string } {
  if (!flags.alerts) return { delivered: false, reason: "flag" };
  if (!flags.live) return { delivered: false, reason: "live_off" };
  if (plan.outbound === "none" && plan.sms !== "ready") return { delivered: false, reason: plan.reason || "no_outbound" };
  return { delivered: false, reason: "no_sender" };
}

export function payrollAttentionFacts(items: readonly Deadline[], locale: "en" | "fr"): Array<{
  id: string;
  role: "provider";
  centreId: string;
  title: string;
  detail: "payrollDue";
  href: string;
  resolvedAt: string | null;
  dismissible: false;
}> {
  return items
    .filter((item) => item.tone === "red" || item.tone === "amber")
    .map((item) => ({
      id: item.id,
      role: "provider" as const,
      centreId: item.daycareId,
      title: locale === "fr" ? item.titleFr : item.titleEn,
      detail: "payrollDue" as const,
      href: "/provider?desk=pay",
      resolvedAt: item.done ? new Date().toISOString() : null,
      dismissible: false as const,
    }));
}
