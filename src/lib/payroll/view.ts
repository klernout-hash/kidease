/** Sample screens for the pay desk. Numbers come from the estimate, not a made-up pay. */

import { estimatePay } from "./calculate.ts";
import { buildDeadlines, redCount, urgentDeadlines, type Deadline } from "./deadlines.ts";
import { formatCad } from "./money.ts";
import { nextAction, paySentence, type NextId } from "./next-step.ts";
import { buildMonth, emptyAmounts } from "./remittance.ts";
import { payCopy, type PayLocale } from "./copy.ts";

export type PayScreen = "home" | "wizard" | "jar" | "month" | "staff" | "books" | "setup" | "alerts" | "forms";

const SAMPLE_PAY = estimatePay({
  province: "ON",
  frequency: "biweekly",
  regularGrossCents: 184_200,
  vacationBps: 400,
  vacationMode: "payout",
  td1FederalCents: 1_645_200,
  td1ProvincialCents: 1_298_900,
});

export function sampleSentence(locale: PayLocale): string {
  return paySentence({
    locale,
    staffCount: 2,
    netCents: SAMPLE_PAY.netCents,
    governmentCents: SAMPLE_PAY.governmentCents,
    dueLabel: locale === "fr" ? "15 déc." : "Dec 15",
    money: (cents) => formatCad(cents, locale),
  });
}

export function sampleDeadlines(): Deadline[] {
  return buildDeadlines({
    daycareId: "sample-centre",
    today: "2026-12-14",
    remitter: "regular",
    periodEnd: "2026-11-30",
    payDate: "2026-12-15",
    approvalDate: "2026-12-13",
    taxYear: 2026,
    roePeriodEnd: null,
    gstPeriodEnd: "2026-11-30",
    gstFrequency: "quarterly",
    province: "ON",
    hasTaxableExtra: false,
    unapprovedEdits: 1,
    missingWage: false,
    shortCents: 4000,
    partnerFailed: false,
    remittanceDone: false,
    paydayDone: false,
  });
}

export function sampleHome(locale: PayLocale) {
  const copy = payCopy(locale);
  const deadlines = urgentDeadlines(sampleDeadlines());
  const reds = redCount(deadlines);
  const next = nextAction({
    openShifts: 1,
    unapproved: 1,
    paySaved: false,
    owedCents: SAMPLE_PAY.governmentCents,
    setAsideCents: SAMPLE_PAY.governmentCents - 4000,
    sentCents: 0,
  });
  const top = deadlines.find((item) => item.tone === "red");
  return {
    copy,
    locale,
    sample: true,
    estimate: SAMPLE_PAY,
    sentence: sampleSentence(locale),
    deadlines,
    reds,
    nextId: (reds > 0 ? "fix_shift" : next.id) as NextId,
    button: reds > 0 ? copy.fixNow : copy.startPay,
    buttonDetail: top ? (locale === "fr" ? top.titleFr : top.titleEn) : copy.approveHours,
    onShift: [{ name: "Amira S.", since: "8:02" }],
    progress: next.doneSteps,
  };
}

export function sampleMonth(locale: PayLocale) {
  const owed = {
    ...emptyAmounts(),
    cppCents: 12_000,
    eiCents: 4_000,
    federalCents: 8_000,
    provincialCents: 6_000,
  };
  const short = buildMonth({
    month: "2026-11",
    periodEnd: "2026-11-30",
    remitter: "regular",
    today: "2026-12-14",
    owed: { ...owed, provincialVerified: true, gstVerified: true, pstVerified: false },
    setAside: { ...owed, federalCents: 4_000 },
    sent: emptyAmounts(),
  });
  const goodOwed = { ...emptyAmounts(), cppCents: 5_000, eiCents: 2_000 };
  const good = buildMonth({
    month: "2026-10",
    periodEnd: "2026-10-31",
    remitter: "regular",
    today: "2026-12-14",
    owed: { ...goodOwed, provincialVerified: true, gstVerified: true, pstVerified: false },
    setAside: goodOwed,
    sent: goodOwed,
  });
  return { locale, money: (cents: number) => formatCad(cents, locale), months: [short, good] };
}
