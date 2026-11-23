/**
 * Year-end slip files from approved pay stubs.
 *
 * CRA: T619 transmittal + T4 (slips and summary) and T4A (slips and summary),
 * following the element names, order, formats, and lengths on CRA's 2027
 * "T619, Electronic Transmittal", "T4" and "T4A" XML specification pages
 * (read 2026-11-23). The 2027 version is the one CRA accepts from
 * January 11, 2027, which is when 2026 slips are filed.
 *
 * Not checked against the XSD: CRA's schema zip (xmlschm1-27-1.zip) could not
 * be downloaded from this build. Every file is marked "check before filing".
 *
 * Revenu Québec RL-1: a DRAFT only. Revenu Québec's XML schema could not be
 * read, the element names below come from memory of the published layout, and
 * a real RL-1 file also needs Revenu Québec's software certification number and
 * slip numbers that KidEase does not have. Give it to your accountant.
 *
 * KidEase never files these. The owner uploads them (or hands them over).
 */

import type { ApprovedStub } from "./stubs.ts";
import { rl1Slips, t4aSlips, t4Slips } from "./year-end.ts";

export const SLIP_XML_AS_OF = "2026-11-23";

export const SLIP_SOURCES = {
  t619: "https://www.canada.ca/en/revenue-agency/services/e-services/filing-information-returns-electronically-t4-t5-other-types-returns-overview/t619-2027.html",
  t4: "https://www.canada.ca/en/revenue-agency/services/e-services/filing-information-returns-electronically-t4-t5-other-types-returns-overview/t619-2027/t4-2027.html",
  t4a: "https://www.canada.ca/en/revenue-agency/services/e-services/filing-information-returns-electronically-t4-t5-other-types-returns-overview/t619-2027/t4a-2027.html",
  xsd: "https://www.canada.ca/content/dam/cra-arc/serv-info/eservices/xmlschm1-27-1.zip",
  rl1: "https://www.revenuquebec.ca/en/online-services/forms-and-publications/current-details/rl-1-g-v/",
} as const;

/** What was and was not checked. Shown with every download. */
export const SLIP_VERIFICATION = {
  craElementsFromSpecPages: true,
  craXsdValidated: false,
  rl1ElementNamesVerified: false,
  rl1NeedsCertificationNumber: true,
  t4aDentalCodeRuleVerified: false,
} as const;

export type SlipEmployer = {
  name: string;
  businessNumber: string;
  addrLine: string;
  city: string;
  provCd: string;
  postalCd: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  dentalCode: string;
  rqId: string;
  rqNp: string;
  rqCert: string;
};

export type SlipPerson = {
  personId: string;
  firstName: string;
  lastName: string;
  initial: string;
  /** As entered by the person on their slip details form, digits only. null when not entered. */
  sin: string | null;
  addrLine: string;
  city: string;
  provCd: string;
  postalCd: string;
  cppExempt: boolean;
  eiExempt: boolean;
};

export type SlipProblem = "sin" | "name";
export type EmployerProblem = "name" | "business_number" | "address" | "contact" | "email" | "dental_code" | "rq_id";

export type SlipFile = {
  kind: "t4" | "t4a" | "rl1";
  filename: string;
  xml: string;
  slips: number;
  checkBeforeFiling: true;
};

export type SlipResult = {
  file: SlipFile | null;
  /** People left out of the file, and why. */
  flagged: { personId: string; name: string; problem: SlipProblem }[];
  /** Employer details still missing. When any is listed, no file is made. */
  employerProblems: EmployerProblem[];
};

/** A SIN is 9 digits, passes the Luhn check, and does not start with 0 or 8. */
export function validSin(value: string | null | undefined): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits) || digits[0] === "0" || digits[0] === "8") return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let n = Number(digits[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** CRA payroll account: 9 digits, RP, 4 digits. */
export function validPayrollAccount(value: string): boolean {
  return /^\d{9}RP\d{4}$/.test(value.replace(/\s/g, "").toUpperCase());
}

export function validRqId(value: string): boolean {
  return /^\d{10}RS\d{4}$/.test(value.replace(/\s/g, "").toUpperCase());
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Trim, drop control characters, cut to the spec length, then escape. */
function text(value: string, max: number): string {
  const printable = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? " " : char;
  }).join("");
  const clean = printable.replace(/\s+/g, " ").trim().slice(0, max);
  return escapeXml(clean);
}

/** Dollars and cents with a decimal point, no commas, never negative. */
export function amount(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, "0")}`;
}

function el(name: string, value: string | null | undefined, indent: string): string {
  return value == null || value === "" ? "" : `${indent}<${name}>${value}</${name}>\n`;
}

function phoneParts(phone: string): { area: string; number: string } | null {
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!/^\d{10}$/.test(digits)) return null;
  return { area: digits.slice(0, 3), number: `${digits.slice(3, 6)}-${digits.slice(6)}` };
}

function postal(value: string): string {
  return value.replace(/\s/g, "").toUpperCase().slice(0, 10);
}

export function employerProblems(employer: SlipEmployer, kind: "t4" | "t4a" | "rl1"): EmployerProblem[] {
  const out: EmployerProblem[] = [];
  if (employer.name.trim().length < 2) out.push("name");
  if (kind !== "rl1" && !validPayrollAccount(employer.businessNumber)) out.push("business_number");
  if (!employer.addrLine.trim() || !employer.city.trim() || !/^[A-Z]{2}$/.test(employer.provCd.toUpperCase()) || !postal(employer.postalCd)) out.push("address");
  if (employer.contactName.trim().length < 2 || !phoneParts(employer.contactPhone)) out.push("contact");
  if (kind !== "rl1" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employer.contactEmail.trim())) out.push("email");
  if (kind === "t4" && !/^[1-5]$/.test(employer.dentalCode)) out.push("dental_code");
  if (kind === "rl1" && !validRqId(employer.rqId)) out.push("rq_id");
  return out;
}

function personProblem(person: SlipPerson | undefined): SlipProblem | null {
  if (!person || !validSin(person.sin)) return "sin";
  if (!person.lastName.trim()) return "name";
  return null;
}

function addressBlock(tag: string, person: { addrLine: string; city: string; provCd: string; postalCd: string }, indent: string): string {
  if (!person.addrLine.trim() && !person.city.trim()) return "";
  const inner =
    el("addr_l1_txt", text(person.addrLine, 30), `${indent}  `) +
    el("cty_nm", text(person.city, 28), `${indent}  `) +
    el("prov_cd", text(person.provCd.toUpperCase(), 2), `${indent}  `) +
    `${indent}  <cntry_cd>CAN</cntry_cd>\n` +
    el("pstl_cd", text(postal(person.postalCd), 10), `${indent}  `);
  return `${indent}<${tag}>\n${inner}${indent}</${tag}>\n`;
}

/** Short submission reference: up to 8 letters and digits. */
export function submissionRef(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `KE${hash.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}

function t619(employer: SlipEmployer, lang: "E" | "F", ref: string): string {
  const phone = phoneParts(employer.contactPhone);
  return (
    "  <T619>\n" +
    "    <TransmitterAccountNumber>\n" +
    `      <bn15>${text(employer.businessNumber.replace(/\s/g, "").toUpperCase(), 15)}</bn15>\n` +
    "    </TransmitterAccountNumber>\n" +
    `    <sbmt_ref_id>${ref}</sbmt_ref_id>\n` +
    "    <summ_cnt>1</summ_cnt>\n" +
    `    <lang_cd>${lang}</lang_cd>\n` +
    "    <TransmitterName>\n" +
    `      <l1_nm>${text(employer.name, 35)}</l1_nm>\n` +
    "    </TransmitterName>\n" +
    "    <TransmitterCountryCode>CAN</TransmitterCountryCode>\n" +
    "    <CNTC>\n" +
    `      <cntc_nm>${text(employer.contactName, 35)}</cntc_nm>\n` +
    `      <cntc_area_cd>${phone?.area ?? ""}</cntc_area_cd>\n` +
    `      <cntc_phn_nbr>${phone?.number ?? ""}</cntc_phn_nbr>\n` +
    `      <cntc_email_area>${text(employer.contactEmail, 60)}</cntc_email_area>\n` +
    "    </CNTC>\n" +
    "  </T619>\n"
  );
}

function summaryHeader(employer: SlipEmployer, nameTag: string, addrTag: string, indent: string): string {
  const phone = phoneParts(employer.contactPhone);
  return (
    `${indent}<bn>${text(employer.businessNumber.replace(/\s/g, "").toUpperCase(), 15)}</bn>\n` +
    `${indent}<${nameTag}>\n${indent}  <l1_nm>${text(employer.name, 30)}</l1_nm>\n${indent}</${nameTag}>\n` +
    addressBlock(addrTag, employer, indent) +
    `${indent}<CNTC>\n` +
    `${indent}  <cntc_nm>${text(employer.contactName, 22)}</cntc_nm>\n` +
    `${indent}  <cntc_area_cd>${phone?.area ?? ""}</cntc_area_cd>\n` +
    `${indent}  <cntc_phn_nbr>${phone?.number ?? ""}</cntc_phn_nbr>\n` +
    `${indent}</CNTC>\n`
  );
}

function split(people: readonly SlipPerson[], ids: readonly { personId: string; name: string }[]) {
  const ok: SlipPerson[] = [];
  const flagged: SlipResult["flagged"] = [];
  for (const row of ids) {
    const person = people.find((p) => p.personId === row.personId);
    const problem = personProblem(person);
    if (problem || !person) flagged.push({ personId: row.personId, name: row.name, problem: problem ?? "sin" });
    else ok.push(person);
  }
  return { ok, flagged };
}

/** CRA T4 file: T619, one T4Slip per person with a valid SIN, and the T4Summary. */
export function buildT4Xml(input: { year: number; employer: SlipEmployer; people: readonly SlipPerson[]; stubs: readonly ApprovedStub[]; lang: "E" | "F" }): SlipResult {
  const slips = t4Slips(input.stubs, input.year);
  const problems = employerProblems(input.employer, "t4");
  const { ok, flagged } = split(input.people, slips);
  if (problems.length || ok.length === 0) return { file: null, flagged, employerProblems: problems };
  const included = slips.filter((slip) => ok.some((p) => p.personId === slip.personId));
  const stubs = input.stubs.filter((s) => s.payDate.startsWith(String(input.year)) && ok.some((p) => p.personId === s.personId) && s.payType !== "contractor");
  const bn = text(input.employer.businessNumber.replace(/\s/g, "").toUpperCase(), 15);
  let body = "";
  for (const slip of included) {
    const person = ok.find((p) => p.personId === slip.personId) as SlipPerson;
    const quebec = slip.box10 === "QC";
    const i = "        ";
    body +=
      "      <T4Slip>\n" +
      `${i}<EMPE_NM>\n` +
      `${i}  <snm>${text(person.lastName, 20)}</snm>\n` +
      el("gvn_nm", text(person.firstName, 12), `${i}  `) +
      el("init", text(person.initial, 1).toUpperCase(), `${i}  `) +
      `${i}</EMPE_NM>\n` +
      addressBlock("EMPE_ADDR", person, i) +
      `${i}<sin>${String(person.sin).replace(/\D/g, "")}</sin>\n` +
      `${i}<bn>${bn}</bn>\n` +
      `${i}<cpp_qpp_xmpt_cd>${person.cppExempt ? 1 : 0}</cpp_qpp_xmpt_cd>\n` +
      `${i}<ei_xmpt_cd>${person.eiExempt ? 1 : 0}</ei_xmpt_cd>\n` +
      (quebec ? `${i}<prov_pip_xmpt_cd>${person.eiExempt ? 1 : 0}</prov_pip_xmpt_cd>\n` : "") +
      `${i}<rpt_tcd>O</rpt_tcd>\n` +
      `${i}<empt_prov_cd>${slip.box10}</empt_prov_cd>\n` +
      `${i}<empr_dntl_ben_rpt_cd>${input.employer.dentalCode}</empr_dntl_ben_rpt_cd>\n` +
      `${i}<T4_AMT>\n` +
      el("empt_incamt", amount(slip.box14), `${i}  `) +
      (slip.box16 ? el("cpp_cntrb_amt", amount(slip.box16), `${i}  `) : "") +
      (slip.box16A ? el("cppe_cntrb_amt", amount(slip.box16A), `${i}  `) : "") +
      (slip.box17 ? el("qpp_cntrb_amt", amount(slip.box17), `${i}  `) : "") +
      (slip.box17A ? el("qppe_cntrb_amt", amount(slip.box17A), `${i}  `) : "") +
      (slip.box18 ? el("empe_eip_amt", amount(slip.box18), `${i}  `) : "") +
      (slip.box22 ? el("itx_ddct_amt", amount(slip.box22), `${i}  `) : "") +
      el("ei_insu_ern_amt", amount(slip.box24), `${i}  `) +
      el("cpp_qpp_ern_amt", amount(slip.box26), `${i}  `) +
      (slip.box55 ? el("prov_pip_amt", amount(slip.box55), `${i}  `) : "") +
      (slip.box56 ? el("prov_insu_ern_amt", amount(slip.box56), `${i}  `) : "") +
      `${i}</T4_AMT>\n` +
      "      </T4Slip>\n";
  }
  const sum = (pick: (s: ApprovedStub) => number) => stubs.reduce((t, s) => t + pick(s), 0);
  const tot = (pick: (slip: (typeof included)[number]) => number) => included.reduce((t, s) => t + pick(s), 0);
  const j = "        ";
  const summary =
    "      <T4Summary>\n" +
    summaryHeader(input.employer, "EMPR_NM", "EMPR_ADDR", j) +
    `${j}<tx_yr>${input.year}</tx_yr>\n` +
    `${j}<slp_cnt>${included.length}</slp_cnt>\n` +
    `${j}<rpt_tcd>O</rpt_tcd>\n` +
    `${j}<T4_TAMT>\n` +
    `${j}  <tot_empt_incamt>${amount(tot((s) => s.box14))}</tot_empt_incamt>\n` +
    `${j}  <tot_empe_cpp_amt>${amount(tot((s) => s.box16))}</tot_empe_cpp_amt>\n` +
    `${j}  <tot_empe_cppe_amt>${amount(tot((s) => s.box16A))}</tot_empe_cppe_amt>\n` +
    `${j}  <tot_empe_eip_amt>${amount(tot((s) => s.box18))}</tot_empe_eip_amt>\n` +
    `${j}  <tot_itx_ddct_amt>${amount(tot((s) => s.box22))}</tot_itx_ddct_amt>\n` +
    `${j}  <tot_empr_cpp_amt>${amount(sum((s) => s.employerCppCents))}</tot_empr_cpp_amt>\n` +
    `${j}  <tot_empr_cppe_amt>${amount(sum((s) => s.employerCpp2Cents))}</tot_empr_cppe_amt>\n` +
    `${j}  <tot_empr_eip_amt>${amount(sum((s) => s.employerEiCents))}</tot_empr_eip_amt>\n` +
    `${j}</T4_TAMT>\n` +
    "      </T4Summary>\n";
  const ref = submissionRef(`${bn}-${input.year}-t4-${included.length}`);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Submission xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
    t619(input.employer, input.lang, ref) +
    "  <Return>\n    <T4>\n" +
    body +
    summary +
    "    </T4>\n  </Return>\n</Submission>\n";
  return {
    file: { kind: "t4", filename: `T4-${input.year}-check-before-filing.xml`, xml, slips: included.length, checkBeforeFiling: true },
    flagged,
    employerProblems: [],
  };
}

/** CRA T4A file for contractors: box 048 fees for services. */
export function buildT4aXml(input: { year: number; employer: SlipEmployer; people: readonly SlipPerson[]; stubs: readonly ApprovedStub[]; lang: "E" | "F" }): SlipResult {
  const slips = t4aSlips(input.stubs, input.year).filter((slip) => slip.box048 > 0);
  const problems = employerProblems(input.employer, "t4a");
  const { ok, flagged } = split(input.people, slips);
  if (problems.length || ok.length === 0) return { file: null, flagged, employerProblems: problems };
  const included = slips.filter((slip) => ok.some((p) => p.personId === slip.personId));
  const bn = text(input.employer.businessNumber.replace(/\s/g, "").toUpperCase(), 15);
  let body = "";
  for (const slip of included) {
    const person = ok.find((p) => p.personId === slip.personId) as SlipPerson;
    const i = "        ";
    body +=
      "      <T4ASlip>\n" +
      `${i}<RCPNT_NM>\n` +
      `${i}  <snm>${text(person.lastName, 20)}</snm>\n` +
      el("gvn_nm", text(person.firstName, 12), `${i}  `) +
      el("init", text(person.initial, 1).toUpperCase(), `${i}  `) +
      `${i}</RCPNT_NM>\n` +
      `${i}<sin>${String(person.sin).replace(/\D/g, "")}</sin>\n` +
      addressBlock("RCPNT_ADDR", person, i) +
      `${i}<bn>${bn}</bn>\n` +
      `${i}<payr_dntl_ben_rpt_cd>1</payr_dntl_ben_rpt_cd>\n` +
      `${i}<rpt_tcd>O</rpt_tcd>\n` +
      `${i}<T4A_AMT>\n` +
      `${i}  <fee_or_oth_srvc_amt>${amount(slip.box048)}</fee_or_oth_srvc_amt>\n` +
      `${i}</T4A_AMT>\n` +
      "      </T4ASlip>\n";
  }
  const j = "        ";
  const summary =
    "      <T4ASummary>\n" +
    summaryHeader(input.employer, "PAYR_NM", "PAYR_ADDR", j) +
    `${j}<tx_yr>${input.year}</tx_yr>\n` +
    `${j}<slp_cnt>${included.length}</slp_cnt>\n` +
    `${j}<rpt_tcd>O</rpt_tcd>\n` +
    `${j}<T4A_TAMT>\n` +
    `${j}  <rpt_tot_fee_srvc_amt>${amount(included.reduce((t, s) => t + s.box048, 0))}</rpt_tot_fee_srvc_amt>\n` +
    `${j}</T4A_TAMT>\n` +
    "      </T4ASummary>\n";
  const ref = submissionRef(`${bn}-${input.year}-t4a-${included.length}`);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Submission xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
    t619(input.employer, input.lang, ref) +
    "  <Return>\n    <T4A>\n" +
    body +
    summary +
    "    </T4A>\n  </Return>\n</Submission>\n";
  return {
    file: { kind: "t4a", filename: `T4A-${input.year}-check-before-filing.xml`, xml, slips: included.length, checkBeforeFiling: true },
    flagged,
    employerProblems: [],
  };
}

/**
 * Revenu Québec RL-1 DRAFT. Element names are not verified against Revenu
 * Québec's schema, and slip numbers (NoReleve) and the software certification
 * number must come from certified software or Revenu Québec. Not for filing as is.
 */
export function buildRl1Xml(input: { year: number; employer: SlipEmployer; people: readonly SlipPerson[]; stubs: readonly ApprovedStub[] }): SlipResult {
  const slips = rl1Slips(input.stubs, input.year);
  const problems = employerProblems(input.employer, "rl1");
  const { ok, flagged } = split(input.people, slips);
  if (problems.length || ok.length === 0) return { file: null, flagged, employerProblems: problems };
  const included = slips.filter((slip) => ok.some((p) => p.personId === slip.personId));
  const rqId = input.employer.rqId.replace(/\s/g, "").toUpperCase();
  let body = "";
  for (const slip of included) {
    const person = ok.find((p) => p.personId === slip.personId) as SlipPerson;
    const i = "      ";
    body +=
      "    <R>\n" +
      `${i}<Identification>\n` +
      `${i}  <Annee>${input.year}</Annee>\n` +
      `${i}  <NoReleve></NoReleve>\n` +
      `${i}  <Employe>\n` +
      `${i}    <NAS>${String(person.sin).replace(/\D/g, "")}</NAS>\n` +
      `${i}    <NomFamille>${text(person.lastName, 30)}</NomFamille>\n` +
      el("Prenom", text(person.firstName, 30), `${i}    `) +
      el("Initiale", text(person.initial, 1).toUpperCase(), `${i}    `) +
      `${i}  </Employe>\n` +
      `${i}  <Employeur>\n` +
      `${i}    <NoId>${text(rqId.slice(0, 10), 10)}</NoId>\n` +
      `${i}    <TypeDossier>RS</TypeDossier>\n` +
      `${i}    <NoDossier>${text(rqId.slice(12), 4)}</NoDossier>\n` +
      `${i}    <NomEmployeur>${text(input.employer.name, 30)}</NomEmployeur>\n` +
      `${i}  </Employeur>\n` +
      `${i}</Identification>\n` +
      `${i}<Montants>\n` +
      el("A_RevenuEmploi", amount(slip.A), `${i}  `) +
      el("B_CotisationRRQ", amount(slip.B), `${i}  `) +
      el("C_CotisationAssEmploi", amount(slip.C), `${i}  `) +
      el("E_ImpotQue", amount(slip.E), `${i}  `) +
      el("G_SalaireAdmisRRQ", amount(slip.G), `${i}  `) +
      el("H_CotisationRQAP", amount(slip.H), `${i}  `) +
      el("I_SalaireAdmisRQAP", amount(slip.I), `${i}  `) +
      `${i}</Montants>\n` +
      "    </R>\n";
  }
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<!-- KidEase DRAFT for your accountant. Not for filing as is: element names were not checked against Revenu Québec's schema, NoReleve (slip numbers) are empty, and a software certification number is needed. -->\n" +
    "<Transmission>\n" +
    "  <P>\n" +
    `    <Annee>${input.year}</Annee>\n` +
    "    <TypeEnvoi>1</TypeEnvoi>\n" +
    el("NoPreparateur", text(input.employer.rqNp, 8), "    ") +
    el("NoCertification", text(input.employer.rqCert, 12), "    ") +
    "  </P>\n" +
    "  <Groupe02>\n" +
    body +
    "  </Groupe02>\n" +
    "</Transmission>\n";
  return {
    file: { kind: "rl1", filename: `RL-1-${input.year}-DRAFT-check-before-filing.xml`, xml, slips: included.length, checkBeforeFiling: true },
    flagged,
    employerProblems: [],
  };
}

/** Slip details a person enters (legal name, address, SIN). Checked before saving. */
export function parseSlipDetails(raw: { firstName?: string; lastName?: string; initial?: string; sin?: string; addrLine?: string; city?: string; provCd?: string; postalCd?: string }):
  | { ok: true; answers: Omit<SlipPerson, "personId" | "sin" | "cppExempt" | "eiExempt">; sin: string }
  | { ok: false; error: "name" | "sin" | "address" } {
  const firstName = String(raw.firstName ?? "").trim().slice(0, 40);
  const lastName = String(raw.lastName ?? "").trim().slice(0, 40);
  const initial = String(raw.initial ?? "").trim().slice(0, 1);
  if (firstName.length < 1 || lastName.length < 1) return { ok: false, error: "name" };
  const sin = String(raw.sin ?? "").replace(/\D/g, "");
  if (!validSin(sin)) return { ok: false, error: "sin" };
  const addrLine = String(raw.addrLine ?? "").trim().slice(0, 60);
  const city = String(raw.city ?? "").trim().slice(0, 40);
  const provCd = String(raw.provCd ?? "").trim().toUpperCase().slice(0, 2);
  const postalCd = String(raw.postalCd ?? "").replace(/\s/g, "").toUpperCase().slice(0, 6);
  if (!addrLine || !city || !/^[A-Z]{2}$/.test(provCd) || !/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postalCd)) return { ok: false, error: "address" };
  return { ok: true, answers: { firstName, lastName, initial, addrLine, city, provCd, postalCd }, sin };
}

/** Build a slip person from saved slip details and the SIN opened on the server. */
export function toSlipPerson(row: { personId: string; cppExempt: boolean; eiExempt: boolean; answersJson: string | null }, sin: string | null): SlipPerson {
  let value: Record<string, unknown> = {};
  try {
    value = row.answersJson ? (JSON.parse(row.answersJson) as Record<string, unknown>) : {};
  } catch {
    value = {};
  }
  const get = (key: string) => String(value[key] ?? "");
  return {
    personId: row.personId,
    firstName: get("firstName"),
    lastName: get("lastName"),
    initial: get("initial"),
    sin: sin && validSin(sin) ? sin.replace(/\D/g, "") : null,
    addrLine: get("addrLine"),
    city: get("city"),
    provCd: get("provCd"),
    postalCd: get("postalCd"),
    cppExempt: row.cppExempt,
    eiExempt: row.eiExempt,
  };
}
