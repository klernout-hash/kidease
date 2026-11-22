// Deduction engine checks.
//
// 1. Every province and territory outside Quebec, plus Quebec federal tax, is
//    checked against CRA's printed T4032 Payroll Deductions Tables (claim code 1).
//    BC, NL, and PE use the July 1, 2026 edition. The other provinces use the
//    January 1, 2026 edition, which CRA says did not change on July 1, 2026
//    (T4127 123rd edition, "no changes for ..."). The rows were read from the
//    PDFs on canada.ca (Sections D and E) on 2026-11-22.
//    How CRA builds those tables: tax is worked out at the middle of each pay
//    range, CPP and CPP2 are spread evenly over the year, and the result is
//    printed to the nearest 5 cents (Nova Scotia prints cents). The engine's
//    "t4032" method does the same spreading, and each case must land within
//    5 cents of the printed amount.
// 2. Quebec provincial tax and the 2027 edition have no printed tables we could
//    reach, so those cases are worked by hand below with every step written out.

import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDeductions, provincialTaxReady, round2, trunc2 } from "../src/lib/payroll/engine.ts";
import { editionForPayDate, PROVINCE_CODES, quebecForPayDate, T4127_2026_07, T4127_2027 } from "../src/lib/payroll/tables.ts";

const PAY_DATE = "2026-11-27";

// [province, frequency, table ("F" federal or "P" provincial), from, lessThan, printed claim code 1 in cents, edition]
const T4032_ROWS = [
  ["ON", "biweekly", "F", 995, 1003, 3_370, "Jan 2026"],
  ["ON", "biweekly", "F", 2491, 2515, 24_320, "Jan 2026"],
  ["ON", "biweekly", "F", 4971, 5003, 76_980, "Jan 2026"],
  ["ON", "biweekly", "P", 993, 1001, 3_190, "Jan 2026"],
  ["ON", "biweekly", "P", 2481, 2505, 13_085, "Jan 2026"],
  ["ON", "biweekly", "P", 4977, 5009, 42_675, "Jan 2026"],
  ["AB", "monthly", "F", 2483, 2501, 11_545, "Jan 2026"],
  ["AB", "monthly", "F", 4997, 5049, 44_935, "Jan 2026"],
  ["AB", "monthly", "F", 8943, 9013, 124_060, "Jan 2026"],
  ["AB", "monthly", "P", 2485, 2503, 3_400, "Jan 2026"],
  ["AB", "monthly", "P", 4987, 5021, 21_955, "Jan 2026"],
  ["AB", "monthly", "P", 8957, 9027, 60_505, "Jan 2026"],
  ["BC", "weekly", "F", 794, 802, 5_550, "Jul 2026"],
  ["BC", "weekly", "F", 994, 1002, 8_135, "Jul 2026"],
  ["BC", "weekly", "F", 1990, 2006, 27_115, "Jul 2026"],
  ["BC", "weekly", "P", 798, 802, 2_525, "Jul 2026"],
  ["BC", "weekly", "P", 998, 1006, 4_185, "Jul 2026"],
  ["BC", "weekly", "P", 1498, 1510, 7_835, "Jul 2026"],
  ["BC", "weekly", "P", 1986, 2002, 11_665, "Jul 2026"],
  ["MB", "semimonthly", "F", 1193, 1201, 5_135, "Jan 2026"],
  ["MB", "semimonthly", "F", 2499, 2525, 22_480, "Jan 2026"],
  ["MB", "semimonthly", "F", 4999, 5033, 73_345, "Jan 2026"],
  ["MB", "semimonthly", "P", 1199, 1207, 5_000, "Jan 2026"],
  ["MB", "semimonthly", "P", 2479, 2505, 18_860, "Jan 2026"],
  ["MB", "semimonthly", "P", 4969, 5003, 53_555, "Jan 2026"],
  ["NB", "weekly", "F", 598, 602, 2_985, "Jan 2026"],
  ["NB", "weekly", "F", 1198, 1210, 11_240, "Jan 2026"],
  ["NB", "weekly", "F", 2486, 2502, 38_505, "Jan 2026"],
  ["NB", "weekly", "P", 597, 601, 2_770, "Jan 2026"],
  ["NB", "weekly", "P", 1193, 1205, 8_820, "Jan 2026"],
  ["NB", "weekly", "P", 2493, 2509, 27_705, "Jan 2026"],
  ["NL", "biweekly", "F", 995, 1003, 3_370, "Jul 2026"],
  ["NL", "biweekly", "P", 993, 1001, 3_065, "Jul 2026"],
  ["NL", "biweekly", "P", 2489, 2513, 19_565, "Jul 2026"],
  ["NL", "biweekly", "P", 4977, 5009, 57_195, "Jul 2026"],
  ["NS", "monthly", "P", 1994, 2012, 7_684, "Jan 2026"],
  ["NS", "monthly", "P", 4454, 4506, 39_237, "Jan 2026"],
  ["NS", "monthly", "P", 8960, 9030, 112_095, "Jan 2026"],
  ["NT", "semimonthly", "P", 1196, 1204, 2_120, "Jan 2026"],
  ["NT", "semimonthly", "P", 2978, 3004, 13_935, "Jan 2026"],
  ["NT", "semimonthly", "P", 5978, 6022, 45_150, "Jan 2026"],
  ["NU", "biweekly", "P", 1499, 1515, 2_580, "Jan 2026"],
  ["NU", "biweekly", "P", 2995, 3019, 10_640, "Jan 2026"],
  ["NU", "biweekly", "P", 5987, 6027, 34_910, "Jan 2026"],
  ["PE", "monthly", "P", 1983, 2001, 5_780, "Jul 2026"],
  ["PE", "monthly", "P", 4991, 5043, 40_845, "Jul 2026"],
  ["PE", "monthly", "P", 17977, 18113, 274_220, "Jul 2026"],
  ["SK", "weekly", "P", 597, 601, 1_740, "Jan 2026"],
  ["SK", "weekly", "P", 1189, 1201, 7_790, "Jan 2026"],
  ["SK", "weekly", "P", 2489, 2505, 23_790, "Jan 2026"],
  ["YT", "semimonthly", "P", 1193, 1201, 2_350, "Jan 2026"],
  ["YT", "semimonthly", "P", 2993, 3019, 14_460, "Jan 2026"],
  ["YT", "semimonthly", "P", 5967, 6011, 43_140, "Jan 2026"],
  ["QC", "weekly", "F", 600, 604, 2_485, "Jan 2026 (T4032-QC)"],
  ["QC", "weekly", "F", 1200, 1212, 9_355, "Jan 2026 (T4032-QC)"],
  ["QC", "weekly", "F", 2488, 2504, 32_090, "Jan 2026 (T4032-QC)"],
];

function tableCase(province, frequency, from, lessThan) {
  const mid = Math.round(((from + lessThan) / 2) * 100);
  return calculateDeductions({
    province,
    frequency,
    payDate: PAY_DATE,
    taxableCents: mid,
    pensionableCents: mid,
    insurableCents: mid,
    method: "t4032",
  });
}

for (const [province, frequency, kind, from, lessThan, printed, edition] of T4032_ROWS) {
  test(`T4032 ${edition}: ${province} ${frequency} ${kind === "F" ? "federal" : "provincial"} ${from}-${lessThan}`, () => {
    const result = tableCase(province, frequency, from, lessThan);
    assert.equal(result.ok, true);
    const annual = kind === "F" ? result.annual.federalTax : result.annual.provincialTax;
    const perPay = Math.round(round2(annual / result.periods) * 100);
    assert.ok(Math.abs(perPay - printed) <= 5, `${province} ${kind} ${from}: got ${perPay}, table ${printed}`);
  });
}

test("every province outside Quebec has at least 3 table cases, and Quebec federal has 3", () => {
  for (const code of PROVINCE_CODES) {
    const count = T4032_ROWS.filter((row) => row[0] === code).length;
    assert.ok(count >= 3, `${code} has ${count}`);
  }
  const frequencies = new Set(T4032_ROWS.map((row) => row[1]));
  assert.deepEqual([...frequencies].sort(), ["biweekly", "monthly", "semimonthly", "weekly"]);
});

test("CRA T4032 general information example: Ontario weekly $1,300 with $80 RRSP (T4127 method)", () => {
  // CRA's worked example: CPP $73.35, EI $21.19, federal + Ontario tax $177.35.
  const result = calculateDeductions({
    province: "ON",
    frequency: "weekly",
    payDate: PAY_DATE,
    taxableCents: 130_000,
    pensionableCents: 130_000,
    insurableCents: 130_000,
    rrspCents: 8_000,
  });
  assert.equal(result.cppCents, 7_335);
  assert.equal(result.eiCents, 2_119);
  assert.equal(result.federalTaxCents + result.provincialTaxCents, 17_735);
  assert.equal(result.employerEiCents, 2_967);
});

test("Quebec tax by hand: weekly $1,300 with $80 RRSP, 2026 (Revenu Québec formula)", () => {
  // Steps (P = 52, G = 1,300.00, F = 80.00, E = 18,952 basic amount):
  // QPP C = 0.063 x (1,300.00 - 67.30) = 77.6601 -> 77.66   (3,500 / 52 = 67.307..., truncated to 67.30)
  // CSA = 77.66 x (0.01 / 0.063) + C2 (0) = 12.3270
  // H = lesser of 6% x 1,300 = 78.00 and 1,450 / 52 = 27.8846 -> 27.8846
  // I = 52 x (1,300 - 80 - 27.8846 - 12.3270) = 52 x 1,179.7884 = 61,349.00
  // I is over 54,345 -> T = 0.19, K = 2,717
  // Y = 0.19 x 61,349.00 - 2,717 - 0.14 x 18,952 = 11,656.31 - 2,717 - 2,653.28 = 6,286.03
  // Per pay = 6,286.03 / 52 = 120.885 -> 120.89
  const result = calculateDeductions({
    province: "QC",
    frequency: "weekly",
    payDate: PAY_DATE,
    taxableCents: 130_000,
    pensionableCents: 130_000,
    insurableCents: 130_000,
    rrspCents: 8_000,
  });
  assert.equal(result.cppCents, 7_766);
  assert.equal(trunc2(3_500 / 52), 67.3);
  assert.equal(result.annual.provincialTax, 6_286.03);
  assert.equal(result.provincialTaxCents, 12_089);
  assert.equal(result.qpipCents, 559);
  assert.equal(result.eiCents, 1_690);
  // Quebec employer QPIP: 0.00602 x 1,300 = 7.826 -> 7.83
  assert.equal(result.employerQpipCents, 783);
  const line = result.lines.find((row) => row.code === "provincial_tax");
  assert.equal(line.edition, "Revenu Québec TP-1015.F-V (2026)");
  assert.equal(line.verified, false);
});

test("Quebec tax by hand: monthly $3,000, 2026, low earner below the first bracket", () => {
  // QPP C = 0.063 x (3,000 - 291.66) = 170.6254 -> 170.63   (3,500 / 12 = 291.666..., truncated)
  // CSA = 170.63 x (0.01 / 0.063) = 27.0841
  // H = lesser of 180.00 and 1,450 / 12 = 120.8333 -> 120.8333
  // I = 12 x (3,000 - 120.8333 - 27.0841) = 12 x 2,852.0826 = 34,224.99
  // T = 0.14, K = 0. Y = 0.14 x 34,224.99 - 0.14 x 18,952 = 4,791.50 - 2,653.28 = 2,138.22
  // Per pay = 2,138.22 / 12 = 178.185 -> 178.19 (half up)
  const result = calculateDeductions({
    province: "QC",
    frequency: "monthly",
    payDate: PAY_DATE,
    taxableCents: 300_000,
    pensionableCents: 300_000,
    insurableCents: 300_000,
  });
  assert.equal(result.cppCents, 17_063);
  assert.ok(Math.abs(result.annual.provincialTax - 2_138.22) <= 0.02);
  assert.ok(Math.abs(result.provincialTaxCents - 17_819) <= 1);
});

test("Quebec tax by hand: biweekly $5,000, 2026, top bracket", () => {
  // QPP C = 0.063 x (5,000 - 134.61) = 306.5196 -> 306.52
  // CSA = 306.52 x (0.01 / 0.063) = 48.6540
  // H = lesser of 300.00 and 1,450 / 26 = 55.7692 -> 55.7692
  // I = 26 x (5,000 - 55.7692 - 48.6540) = 26 x 4,895.5768 = 127,285.00
  // I is between 108,680 and 132,245 -> T = 0.24, K = 8,151
  // Y = 0.24 x 127,285.00 - 8,151 - 2,653.28 = 30,548.40 - 10,804.28 = 19,744.12
  // Per pay = 19,744.12 / 26 = 759.389 -> 759.39
  const result = calculateDeductions({
    province: "QC",
    frequency: "biweekly",
    payDate: PAY_DATE,
    taxableCents: 500_000,
    pensionableCents: 500_000,
    insurableCents: 500_000,
  });
  assert.equal(result.cppCents, 30_652);
  assert.ok(Math.abs(result.annual.provincialTax - 19_744.12) <= 0.02);
  assert.ok(Math.abs(result.provincialTaxCents - 75_939) <= 1);
});

test("2027 edition by hand: Ontario monthly $5,000 (T4127 124th edition)", () => {
  // CPP C = 0.0575 x (5,000 - 291.66) = 270.7295 -> 270.73. EI = 0.0164 x 5,000 = 82.00
  // F5 = 270.73 x (0.01 / 0.0575) = 47.0835. A = 12 x (5,000 - 47.0835) = 59,435.00
  // Federal: R = 0.14, K = 0. K1 = 0.14 x 16,879 = 2,363.06
  // K2 = 0.14 x min(12 x 270.73 x 0.0475/0.0575 = 2,683.75, 3,477) + 0.14 x min(984, 1,161.12) = 513.49
  // K4 = 0.14 x 1,540 = 215.60. T3 = 8,320.90 - 2,363.06 - 513.49 - 215.60 = 5,228.75
  // Ontario: V = 0.0915, KP = 2,256. K1P = 0.0505 x 13,261 = 669.68. K2P = 0.0505 x 3,667.75 = 185.22
  // T4 = 5,438.30 - 2,256 - 669.68 - 185.22 = 2,327.40. V1 = 0 (under 5,940). V2 = 600 (health premium cap).
  // S = 2 x 306 - 2,327.40 < 0 -> 0. T2 = 2,927.40.
  // Per pay: federal 5,228.75 / 12 = 435.73; total (5,228.75 + 2,927.40) / 12 = 679.68; Ontario 243.95.
  const result = calculateDeductions({
    province: "ON",
    frequency: "monthly",
    payDate: "2027-01-29",
    taxableCents: 500_000,
    pensionableCents: 500_000,
    insurableCents: 500_000,
  });
  assert.equal(result.edition.id, "T4127-124");
  assert.equal(result.cppCents, 27_073);
  assert.equal(result.eiCents, 8_200);
  assert.equal(result.federalTaxCents, 43_573);
  assert.equal(result.provincialTaxCents, 24_395);
});

test("2027 uses the published 4.75% base and 5.75% total CPP rate", () => {
  assert.equal(T4127_2027.cpp.baseRate, 0.0475);
  assert.equal(T4127_2027.cpp.totalRate, 0.0575);
  assert.equal(T4127_2026_07.cpp.totalRate, 0.0595);
});

test("the edition is picked by pay date", () => {
  assert.equal(editionForPayDate("2026-06-30"), null);
  assert.equal(editionForPayDate("2026-07-01").id, "T4127-123");
  assert.equal(editionForPayDate("2026-12-31").id, "T4127-123");
  assert.equal(editionForPayDate("2027-01-01").id, "T4127-124");
  assert.equal(quebecForPayDate("2027-01-01"), null);
  const early = calculateDeductions({ province: "ON", frequency: "weekly", payDate: "2026-06-26", taxableCents: 100_000, pensionableCents: 100_000, insurableCents: 100_000 });
  assert.equal(early.ok, false);
  assert.equal(provincialTaxReady("QC", "2027-02-01"), false);
  assert.equal(provincialTaxReady("QC", "2026-12-01"), true);
  assert.equal(provincialTaxReady("NU", "2027-02-01"), true);
});

test("CPP, CPP2, and EI stop at the yearly maximums", () => {
  // Room left: CPP 4,230.45 - 4,200 = 30.45; EI 1,123.07 - 1,120 = 3.07.
  // CPP2 = (74,000 + 2,000 - 74,600) x 0.04 = 56.00.
  const result = calculateDeductions({
    province: "ON",
    frequency: "weekly",
    payDate: "2026-12-04",
    taxableCents: 200_000,
    pensionableCents: 200_000,
    insurableCents: 200_000,
    ytd: { pensionableCents: 7_400_000, cppCents: 420_000, cpp2Cents: 0, eiCents: 112_000 },
  });
  assert.equal(result.cppCents, 3_045);
  assert.equal(result.cpp2Cents, 5_600);
  assert.equal(result.eiCents, 307);
  assert.equal(result.employerCpp2Cents, 5_600);
});

test("every stub line names its edition and as-of date, and all results are whole cents", () => {
  for (const province of PROVINCE_CODES) {
    const result = calculateDeductions({ province, frequency: "biweekly", payDate: PAY_DATE, taxableCents: 210_000, pensionableCents: 210_000, insurableCents: 210_000 });
    assert.equal(result.ok, true);
    for (const line of result.lines) {
      assert.ok(Number.isInteger(line.cents), `${province} ${line.code}`);
      assert.ok(line.edition.length > 0);
      assert.match(line.asOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(line.source, /^https:\/\//);
    }
    assert.ok(result.lines.some((line) => line.code === "provincial_tax"), province);
  }
});

test("exempt workers pay no CPP or EI, and zero pay takes nothing off", () => {
  const exempt = calculateDeductions({ province: "SK", frequency: "weekly", payDate: PAY_DATE, taxableCents: 80_000, pensionableCents: 80_000, insurableCents: 80_000, cppExempt: true, eiExempt: true });
  assert.equal(exempt.cppCents, 0);
  assert.equal(exempt.eiCents, 0);
  const zero = calculateDeductions({ province: "SK", frequency: "weekly", payDate: PAY_DATE, taxableCents: 0, pensionableCents: 0, insurableCents: 0 });
  assert.equal(zero.federalTaxCents + zero.provincialTaxCents + zero.cppCents + zero.eiCents, 0);
});
