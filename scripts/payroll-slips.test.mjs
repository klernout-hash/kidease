// Year-end slip XML from approved stubs. Synthetic people, synthetic SINs that only pass the check digit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { amount, buildRl1Xml, buildT4aXml, buildT4Xml, employerProblems, parseSlipDetails, SLIP_VERIFICATION, submissionRef, toSlipPerson, validSin } from "../src/lib/payroll/slip-xml.ts";
import { buildPayCard } from "../src/lib/payroll/pay-card.ts";
import { stubFromCard } from "../src/lib/payroll/stubs.ts";

// Synthetic numbers that only pass the check digit. CRA's own sample (046 454 286)
// starts with 0, which is never issued to a person, so the check refuses it.
const SIN_A = "270000003";
const SIN_B = "130692544";

const employer = {
  name: "Little Oaks Child Care Inc.",
  businessNumber: "123456789RP0001",
  addrLine: "10 Oak Street",
  city: "Ottawa",
  provCd: "ON",
  postalCd: "K1A 0B1",
  contactName: "Kim Lee",
  contactPhone: "(613) 555-0100",
  contactEmail: "pay@example.test",
  dentalCode: "1",
  rqId: "1234567890RS0001",
  rqNp: "NP123456",
  rqCert: "",
};

const period = { start: "2026-11-08", end: "2026-11-21", payDate: "2026-11-27" };
const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"].map((date) => ({
  date, checkIn: null, checkOut: null, autoMinutes: 480, minutes: 480, adjusted: false, originalMinutes: null, reason: null, adjustedBy: null, adjustedAt: null, missedCheckout: false, flagged: false, flagNote: null, locked: false,
}));
const base = { payType: "hourly", rateCents: 2_400, frequency: "biweekly", vacationBps: 400, vacationMode: "payout", td1: "approved" };

function stubs() {
  const on = buildPayCard({ person: { ...base, id: "e1", name: "Amira Saleh", province: "ON" }, period, days });
  const qc = buildPayCard({ person: { ...base, id: "e2", name: "Chloé Roy", province: "QC" }, period, days });
  const none = buildPayCard({ person: { ...base, id: "e3", name: "No Sin", province: "ON" }, period, days });
  const ct = buildPayCard({ person: { ...base, id: "c1", name: "Ben Ortiz", province: "ON", payType: "contractor", rateCents: 150_000 }, period, days: [] });
  return [
    stubFromCard({ id: "s1", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card: on }),
    stubFromCard({ id: "s2", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "QC", card: qc }),
    stubFromCard({ id: "s3", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card: none }),
    stubFromCard({ id: "s4", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card: ct }),
  ];
}

const person = (personId, sin, firstName, lastName, extra = {}) => ({
  personId, sin, firstName, lastName, initial: "", addrLine: "1 Main St", city: "Ottawa", provCd: "ON", postalCd: "K1A0B1", cppExempt: false, eiExempt: false, ...extra,
});
const people = [person("e1", SIN_A, "Amira", "Saleh"), person("e2", SIN_B, "Chloé", "Roy & Fils"), person("e3", null, "No", "Sin"), person("c1", SIN_A, "Ben", "Ortiz")];

/** Every opening tag has its closing tag, in order. */
function balanced(xml) {
  const stack = [];
  for (const match of xml.matchAll(/<(\/?)([A-Za-z_][\w.-]*)[^>]*?(\/?)>/g)) {
    if (match[0].startsWith("<?") || match[0].startsWith("<!--")) continue;
    if (match[3] === "/") continue;
    if (match[1] === "/") {
      if (stack.pop() !== match[2]) return false;
    } else stack.push(match[2]);
  }
  return stack.length === 0;
}

test("SIN check: 9 digits, Luhn, not starting with 0 or 8", () => {
  assert.equal(validSin(SIN_A), true);
  assert.equal(validSin("270 000 003"), true);
  assert.equal(validSin("270000004"), false);
  assert.equal(validSin("046454286"), false);
  assert.equal(validSin("123"), false);
  assert.equal(validSin(null), false);
  assert.equal(validSin("800000002"), false);
});

test("T4 XML: T619, one slip per person with a SIN, a summary, CRA element order and amounts", () => {
  const rows = stubs();
  const result = buildT4Xml({ year: 2026, employer, people, stubs: rows, lang: "E" });
  assert.deepEqual(result.flagged, [{ personId: "e3", name: "No Sin", problem: "sin" }]);
  const xml = result.file.xml;
  assert.ok(balanced(xml));
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<Submission xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance">\n {2}<T619>/);
  assert.match(xml, /<bn15>123456789RP0001<\/bn15>/);
  assert.match(xml, /<cntc_area_cd>613<\/cntc_area_cd>\s*<cntc_phn_nbr>555-0100<\/cntc_phn_nbr>/);
  assert.match(xml, /<\/T619>\n {2}<Return>\n {4}<T4>\n {6}<T4Slip>/);
  assert.equal((xml.match(/<T4Slip>/g) ?? []).length, 2);
  assert.equal(result.file.slips, 2);
  assert.doesNotMatch(xml, /No Sin|Ben|Ortiz/);
  // Order inside a slip follows CRA's T4 page.
  const slip = xml.slice(xml.indexOf("<T4Slip>"), xml.indexOf("</T4Slip>"));
  const order = ["<EMPE_NM>", "<EMPE_ADDR>", "<sin>", "<bn>", "<cpp_qpp_xmpt_cd>", "<ei_xmpt_cd>", "<rpt_tcd>", "<empt_prov_cd>", "<empr_dntl_ben_rpt_cd>", "<T4_AMT>"];
  const positions = order.map((tag) => slip.indexOf(tag));
  assert.ok(positions.every((pos, i) => pos >= 0 && (i === 0 || pos > positions[i - 1])), positions.join(","));
  // Amounts in dollars and cents, from the stub.
  assert.match(xml, new RegExp(`<empt_incamt>${amount(rows[0].grossCents).replace(".", "\\.")}</empt_incamt>`));
  assert.match(xml, new RegExp(`<cpp_cntrb_amt>${amount(rows[0].cppCents).replace(".", "\\.")}</cpp_cntrb_amt>`));
  // Quebec person: QPP, QPIP, box 22 without Quebec tax, and the QPIP exemption code.
  assert.match(xml, /<empt_prov_cd>QC<\/empt_prov_cd>/);
  assert.match(xml, new RegExp(`<qpp_cntrb_amt>${amount(rows[1].qppCents).replace(".", "\\.")}</qpp_cntrb_amt>`));
  assert.match(xml, new RegExp(`<prov_pip_amt>${amount(rows[1].qpipCents).replace(".", "\\.")}</prov_pip_amt>`));
  assert.match(xml, /<prov_pip_xmpt_cd>0<\/prov_pip_xmpt_cd>/);
  assert.match(xml, /Roy &amp; Fils/);
  // Summary totals add up.
  assert.match(xml, /<slp_cnt>2<\/slp_cnt>/);
  assert.match(xml, new RegExp(`<tot_empt_incamt>${amount(rows[0].grossCents + rows[1].grossCents).replace(".", "\\.")}</tot_empt_incamt>`));
  assert.match(xml, new RegExp(`<tot_empr_eip_amt>${amount(rows[0].employerEiCents + rows[1].employerEiCents).replace(".", "\\.")}</tot_empr_eip_amt>`));
  assert.match(result.file.filename, /check-before-filing/);
  assert.equal(SLIP_VERIFICATION.craXsdValidated, false);
});

test("missing employer details stop the file, and nobody's SIN is in it", () => {
  const result = buildT4Xml({ year: 2026, employer: { ...employer, businessNumber: "123", dentalCode: "" }, people, stubs: stubs(), lang: "F" });
  assert.equal(result.file, null);
  assert.deepEqual(result.employerProblems, ["business_number", "dental_code"]);
  assert.deepEqual(employerProblems({ ...employer, contactPhone: "555" }, "t4a"), ["contact"]);
  assert.deepEqual(employerProblems({ ...employer, rqId: "" }, "rl1"), ["rq_id"]);
});

test("T4A XML: box 048 fees for the contractor, T4A summary total", () => {
  const result = buildT4aXml({ year: 2026, employer, people, stubs: stubs(), lang: "E" });
  const xml = result.file.xml;
  assert.ok(balanced(xml));
  assert.equal((xml.match(/<T4ASlip>/g) ?? []).length, 1);
  assert.match(xml, /<fee_or_oth_srvc_amt>1500\.00<\/fee_or_oth_srvc_amt>/);
  assert.match(xml, /<rpt_tot_fee_srvc_amt>1500\.00<\/rpt_tot_fee_srvc_amt>/);
  assert.match(xml, /<Return>\n {4}<T4A>/);
  const noSin = buildT4aXml({ year: 2026, employer, people: people.map((p) => (p.personId === "c1" ? { ...p, sin: null } : p)), stubs: stubs(), lang: "E" });
  assert.equal(noSin.file, null);
  assert.deepEqual(noSin.flagged.map((row) => row.problem), ["sin"]);
});

test("RL-1 is a draft for the accountant: Quebec staff only, empty slip numbers, marked not for filing", () => {
  const rows = stubs();
  const result = buildRl1Xml({ year: 2026, employer, people, stubs: rows });
  const xml = result.file.xml;
  assert.ok(balanced(xml));
  assert.equal(result.file.slips, 1);
  assert.match(xml, /DRAFT/);
  assert.match(xml, /<NoReleve><\/NoReleve>/);
  assert.match(xml, new RegExp(`<E_ImpotQue>${amount(rows[1].provincialTaxCents).replace(".", "\\.")}</E_ImpotQue>`));
  assert.match(result.file.filename, /DRAFT-check-before-filing/);
  assert.equal(SLIP_VERIFICATION.rl1ElementNamesVerified, false);
});

test("no slips for another year, and amounts are never negative", () => {
  assert.equal(buildT4Xml({ year: 2027, employer, people, stubs: stubs(), lang: "E" }).file, null);
  assert.equal(amount(-500), "0.00");
  assert.equal(amount(123456), "1234.56");
  assert.match(submissionRef("x"), /^[A-Z0-9]{8}$/);
});

test("slip details: name, a valid SIN, and a Canadian address; the saved answers never hold the SIN", () => {
  assert.deepEqual(parseSlipDetails({ firstName: "Amira", lastName: "Saleh", sin: "270000004", addrLine: "1 Main", city: "Ottawa", provCd: "on", postalCd: "k1a 0b1" }), { ok: false, error: "sin" });
  assert.deepEqual(parseSlipDetails({ firstName: "Amira", lastName: "Saleh", sin: SIN_A, addrLine: "1 Main", city: "Ottawa", provCd: "on", postalCd: "12345" }), { ok: false, error: "address" });
  const ok = parseSlipDetails({ firstName: "Amira", lastName: "Saleh", sin: "270-000-003", addrLine: "1 Main", city: "Ottawa", provCd: "on", postalCd: "k1a 0b1" });
  assert.equal(ok.ok, true);
  assert.equal(ok.sin, SIN_A);
  assert.equal(JSON.stringify(ok.answers).includes("270000003"), false);
  const p = toSlipPerson({ personId: "e1", cppExempt: false, eiExempt: true, answersJson: JSON.stringify(ok.answers) }, SIN_A);
  assert.equal(p.lastName, "Saleh");
  assert.equal(p.sin, SIN_A);
  assert.equal(toSlipPerson({ personId: "e1", cppExempt: false, eiExempt: false, answersJson: null }, "111").sin, null);
});

test("flag, migration, and server rules", () => {
  const server = readFileSync(new URL("../src/lib/server/payroll-slips.ts", import.meta.url), "utf8");
  assert.match(server, /payrollSlipXmlEnabled/);
  assert.match(server, /assertRecentReauth\(context\.userId\)/);
  assert.match(server, /logSlipExport/);
  assert.match(server, /filed: false/);
  assert.doesNotMatch(server, /fetch\(/);
  const flags = readFileSync(new URL("../src/lib/flags.ts", import.meta.url), "utf8");
  assert.match(flags, /FEATURE_PAYROLL_SLIP_XML: false/);
  const up = readFileSync(new URL("../migrations/0230_payroll_slip_xml.sql", import.meta.url), "utf8");
  assert.doesNotMatch(up, /\bdrop\b|\bdelete\b|\btruncate\b/i);
  assert.match(readFileSync(new URL("../migrations/down/0230_payroll_slip_xml.sql", import.meta.url), "utf8"), /drop table if exists payroll_slip_settings/);
});
