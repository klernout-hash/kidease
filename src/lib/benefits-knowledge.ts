/** Official childcare-benefit links and parent facts for KidEase Live Chat.
 *  KidEase never processes these applications — we send families to government sites.
 */

export type BenefitProgram = {
  key: string;
  province: string;
  aliases: string[];
  href: string;
  extra?: string[];
  reply: string;
};

const KE = "https://www.kidease.ca/benefits";

export const BENEFIT_PROGRAMS: BenefitProgram[] = [
  {
    key: "fed",
    province: "Canada",
    aliases: [
      "ccb",
      "canada child benefit",
      "child tax",
      "federal benefit",
      "cra",
      "canada.ca",
      "cwelcc",
      "10 a day",
      "10-a-day",
      "$10",
      "ten a day",
      "nationwide",
      "canada wide",
      "canada-wide",
    ],
    href: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit.html",
    extra: [
      "https://www.canada.ca/en/employment-social-development/campaigns/child-care.html",
      "https://www.canada.ca/en/early-learning-child-care-agreement/agreements-provinces-territories.html",
      KE,
    ],
    reply:
      "Two different federal programs: (1) Canada Child Benefit is a monthly tax-free CRA payment for eligible families — apply or check it in CRA My Account: https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit.html — it is not a daycare invoice discount. (2) CWELCC / $10-a-day is delivered by your province at participating licensed centres; you usually do not file a separate federal daycare form. Overview: https://www.canada.ca/en/employment-social-development/campaigns/child-care.html . KidEase does not process either. Open every official link on kidease.ca/benefits.",
  },
  {
    key: "mb",
    province: "Manitoba",
    aliases: ["manitoba", "winnipeg", "brandon", "steinbach", "mb ", " wpg"],
    href: "https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html",
    extra: [
      "https://www.gov.mb.ca/education/childcare/families/10_dollar_a_day.html",
      "https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca",
      "https://childcaresearch.gov.mb.ca/en",
    ],
    reply:
      "In Manitoba there are two layers. $10-a-day at licensed funded centres is usually already on the invoice for regular hours — no extra form: https://www.gov.mb.ca/education/childcare/families/10_dollar_a_day.html . The Child Care Subsidy is a separate income-tested application for eligible families using licensed care (about 12 weeks to 12 years). Estimate first (SEE): https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca then apply on the province site: https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html . KidEase does not process subsidy. Search licensed centres: https://childcaresearch.gov.mb.ca/en",
  },
  {
    key: "on",
    province: "Ontario",
    aliases: ["ontario", "toronto", "ottawa", "mississauga", "hamilton", "london", "brampton", "on ", "peel", "york region", "cmsm", "dssab"],
    href: "https://www.ontario.ca/page/child-care-subsidies",
    extra: [
      "https://www.ontario.ca/page/service-system-managers-child-care-and-early-years-programs",
      "https://www.ontario.ca/page/canada-ontario-early-years-and-child-care-agreement",
    ],
    reply:
      "Ontario has two different helps. CWELCC reduced fees are billed by participating licensed centres for children under 6 — as of 2025 many centres cap around $22/day and are still working toward a $10 average; confirm with the centre. Income-tested fee subsidy is separate and run by your city/region (CMSM or DSSAB), often with a waitlist. Find your manager: https://www.ontario.ca/page/service-system-managers-child-care-and-early-years-programs then apply via https://www.ontario.ca/page/child-care-subsidies . KidEase does not process Ontario subsidy. In Toronto, fee subsidy is 416-338-8888 / toronto.ca child care fee subsidy.",
  },
  {
    key: "bc",
    province: "British Columbia",
    aliases: ["british columbia", "bc ", "vancouver", "surrey", "burnaby", "victoria", "richmond", "kelowna", "affordable child care", "accb"],
    href: "https://www.gov.bc.ca/affordablechildcarebenefit",
    extra: [
      "https://myfamilyservices.gov.bc.ca/",
      "https://myfamilyservices.gov.bc.ca/s/estimator",
      "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/10-a-day-childcarebc-centres",
    ],
    reply:
      "BC’s Affordable Child Care Benefit is a monthly income-tested payment toward licensed (and some registered) care. Apply or check status in My Family Services: https://myfamilyservices.gov.bc.ca/ — estimator: https://myfamilyservices.gov.bc.ca/s/estimator — program: https://www.gov.bc.ca/affordablechildcarebenefit . Some centres are also $10-a-Day ChildCareBC sites (different list): https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/10-a-day-childcarebc-centres . KidEase does not process ACCB. Phone Child Care Service Centre 1-888-338-6622.",
  },
  {
    key: "ab",
    province: "Alberta",
    aliases: ["alberta", "calgary", "edmonton", "red deer", "lethbridge", "ab ", "15 a day", "$15", "affordability grant"],
    href: "https://www.alberta.ca/child-care-subsidy",
    extra: [
      "https://www.alberta.ca/childcare-fees",
      "https://www.alberta.ca/affordability-grant",
      "https://applychildcaresubsidy.alberta.ca/",
      "https://www.childcaresubsidy.gov.ab.ca/ccs/ccs_public.nsf/Estimator?OpenForm",
    ],
    reply:
      "Alberta: licensed daycare/family day homes in the Affordability Grant charge a set parent fee of about $15/day (about $326.25/month full-time, $230 part-time) for children up to kindergarten — that is billed by the centre, not a KidEase discount. Details: https://www.alberta.ca/childcare-fees . The Child Care Subsidy is a separate income-tested program, mainly for school-age (kindergarten to grade 6) licensed care. Estimator: https://www.childcaresubsidy.gov.ab.ca/ccs/ccs_public.nsf/Estimator?OpenForm apply: https://applychildcaresubsidy.alberta.ca/ info: https://www.alberta.ca/child-care-subsidy . KidEase does not process Alberta applications.",
  },
  {
    key: "qc",
    province: "Quebec",
    aliases: ["quebec", "québec", "montreal", "montréal", "laval", "gatineau", "cpe", "garderie", "revenu québec", "revenu quebec"],
    href: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/",
    extra: ["https://www.mfa.gouv.qc.ca/en/services-de-garde/Parents/Pages/default.aspx"],
    reply:
      "Québec is not the same $10-a-day CWELCC schedule. Reduced-contribution spaces (CPE / subsidized garderie) bill a set daily parent contribution — ask the centre if the space is reduced-contribution. Unsubsidized spaces use the refundable tax credit for childcare expenses through Revenu Québec: https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/ . Parent info: https://www.mfa.gouv.qc.ca/en/services-de-garde/Parents/Pages/default.aspx . KidEase does not assign CPE spaces or file the tax credit.",
  },
  {
    key: "sk",
    province: "Saskatchewan",
    aliases: ["saskatchewan", "saskatoon", "regina", "sk "],
    href: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
    extra: [],
    reply:
      "Saskatchewan regulated child care for children under 6 is in the $10-a-day system at participating licensed centres — the reduced fee is typically on the centre’s invoice. Extra help for lower-income families may be available through provincial income supports such as the Saskatchewan Employment Incentive. Start here: https://www.saskatchewan.ca/residents/family-and-social-support/child-care . KidEase does not process those applications.",
  },
  {
    key: "ns",
    province: "Nova Scotia",
    aliases: ["nova scotia", "halifax", "dartmouth", "sydney", "ns "],
    href: "https://childcarenovascotia.ca/families/child-care-subsidy",
    extra: ["https://childcare-subsidy.novascotia.ca"],
    reply:
      "Nova Scotia has reduced parent fees at participating licensed centres plus a separate Child Care Subsidy for eligible families (children 12 and under in licensed / approved care; income is assessed, currently described as under $70,000 on the province site). Apply online: https://childcare-subsidy.novascotia.ca — program: https://childcarenovascotia.ca/families/child-care-subsidy — intake 1-844-804-2084. Subsidy is paid to the provider. KidEase does not process NS subsidy.",
  },
  {
    key: "nb",
    province: "New Brunswick",
    aliases: ["new brunswick", "moncton", "fredericton", "saint john", "nb "],
    href: "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html",
    extra: ["https://www.nbed.nb.ca/parentportal/en/", "https://www.nbed.nb.ca/parentportal/en/FinancialAssistance/"],
    reply:
      "New Brunswick Parent Subsidy is for preschool children (0–5, not yet in school) in a designated early learning and childcare facility. It is income-tested (province describes help up to about $80,000 household income, and free care at or under $37,500 at a designated facility). Apply in the Parent Portal: https://www.nbed.nb.ca/parentportal/en/FinancialAssistance/ — guide: https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html — phone 1-833-221-9339. KidEase does not process NB subsidy.",
  },
  {
    key: "pe",
    province: "Prince Edward Island",
    aliases: ["prince edward", "pei", "charlottetown", "summerside", "pe "],
    href: "https://www.princeedwardisland.ca/en/information/social-development-and-seniors/help-for-child-care-expenses",
    extra: ["https://peichildcareregistry.com/calculator.php"],
    reply:
      "PEI has $10-a-day regulated child care at participating licensed centres, plus a Child Care Subsidy for eligible families. Estimate with the registry calculator: https://peichildcareregistry.com/calculator.php — province page: https://www.princeedwardisland.ca/en/information/social-development-and-seniors/help-for-child-care-expenses . KidEase does not process PEI subsidy.",
  },
  {
    key: "nl",
    province: "Newfoundland and Labrador",
    aliases: ["newfoundland", "labrador", "st. john's", "st johns", "nl "],
    href: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/",
    extra: ["https://www.gov.nl.ca/education/childcare/"],
    reply:
      "Newfoundland and Labrador has $10-a-day regulated child care at participating licensed centres and a separate Child Care Subsidy for eligible families. Apply / read the subsidy program: https://www.gov.nl.ca/education/childcare/childcaresubsidy/ — childcare home: https://www.gov.nl.ca/education/childcare/ . KidEase does not process NL applications.",
  },
  {
    key: "yt",
    province: "Yukon",
    aliases: ["yukon", "whitehorse", "yt "],
    href: "https://yukon.ca/en/universal-child-care",
    extra: ["https://yukon.ca/en/education-and-schools/early-childhood-learning-and-programs/apply-child-care-subsidy"],
    reply:
      "Yukon universal child care lowers licensed-space fees automatically (no form for the universal reduction). Lower-income families can also apply for the Yukon child care subsidy on top: https://yukon.ca/en/education-and-schools/early-childhood-learning-and-programs/apply-child-care-subsidy — universal program: https://yukon.ca/en/universal-child-care . KidEase does not process Yukon subsidy.",
  },
  {
    key: "nt",
    province: "Northwest Territories",
    aliases: ["northwest territor", "yellowknife", "nwt", "nt "],
    href: "https://www.ece.gov.nt.ca/en/average-10-day-child-care",
    extra: ["https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care"],
    reply:
      "Northwest Territories has a Child Care Fee Reduction (average about $10 a day) at participating licensed programs. Extra help may be available through Income Assistance. Start: https://www.ece.gov.nt.ca/en/average-10-day-child-care — ELCC: https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care . KidEase does not process NWT applications.",
  },
  {
    key: "nu",
    province: "Nunavut",
    aliases: ["nunavut", "iqaluit", "nu "],
    href: "https://www.gov.nu.ca/en/education-and-schools/10_day-child-care",
    extra: ["https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care"],
    reply:
      "Nunavut has $10-a-day regulated child care at participating licensed programs, plus a Daycare Subsidy for eligible families. Official: https://www.gov.nu.ca/en/education-and-schools/10_day-child-care — ELCC: https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care . KidEase does not process Nunavut subsidy.",
  },
];

export const BENEFITS_BRIEF = `CHILDCARE BENEFITS (train on this; always send the official URL)

KidEase page that lists every back-link: https://www.kidease.ca/benefits
KidEase NEVER processes subsidy, CWELCC, CCB, tax credits, or $10-a-day enrolment. We only list licensed centres and point parents to government sites.

Two layers parents mix up:
1) Reduced parent fee / $10-a-day / CWELCC / affordability grant — usually applied automatically at a PARTICIPATING licensed centre. No KidEase form. Not every licensed centre is in. Confirm with the centre.
2) Income-tested fee subsidy — a separate provincial/territorial application. Can often stack on top of the reduced fee. Apply on the government site.

Federal
- Canada Child Benefit (CCB): monthly tax-free CRA payment based on income and children. Not a daycare discount. https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit.html
- CWELCC / Toward $10-a-day: federal-provincial agreements so regulated care for children under 6 moves toward ~$10/day average. Provinces deliver it. Quebec has its own reduced-contribution system. https://www.canada.ca/en/employment-social-development/campaigns/child-care.html
- Agreements: https://www.canada.ca/en/early-learning-child-care-agreement/agreements-provinces-territories.html
- As of 2025, jurisdictions at ~$10/day average include NL, PE, QC, MB, SK, YT, NT, NU. Others (ON, BC, AB, NS, NB) have reduced fees but not always $10 yet.

Manitoba (Winnipeg)
- $10-a-day at licensed FUNDED centres for regular hours (infant/preschool and school-age periods); automatic, no form. https://www.gov.mb.ca/education/childcare/families/10_dollar_a_day.html
- Child Care Subsidy (income-tested, licensed care, ~12 weeks–12 years). Estimator SEE: https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca
- Subsidy info/apply: https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html
- Licensed search: https://childcaresearch.gov.mb.ca/en

Ontario
- CWELCC reduced fees at participating licensed centres (under 6). 2025 cap often cited at $22/day; still working toward $10 average. Confirm with the centre. https://www.ontario.ca/page/canada-ontario-early-years-and-child-care-agreement
- Municipal fee subsidy via CMSM/DSSAB (child under 13). Waitlists common. Find your manager: https://www.ontario.ca/page/service-system-managers-child-care-and-early-years-programs
- https://www.ontario.ca/page/child-care-subsidies

British Columbia
- Affordable Child Care Benefit (income-tested monthly payment). Apply My Family Services https://myfamilyservices.gov.bc.ca/ estimator https://myfamilyservices.gov.bc.ca/s/estimator program https://www.gov.bc.ca/affordablechildcarebenefit  1-888-338-6622
- Separate $10-a-Day ChildCareBC Centres list: https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/10-a-day-childcarebc-centres

Alberta
- Affordability Grant / $15-a-day at participating licensed daycare & family day homes for children up to kindergarten. Full-time ~$326.25/month, part-time ~$230 (as published for 2025). https://www.alberta.ca/childcare-fees https://www.alberta.ca/affordability-grant
- Child Care Subsidy (mainly school-age licensed care). Estimator https://www.childcaresubsidy.gov.ab.ca/ccs/ccs_public.nsf/Estimator?OpenForm apply https://applychildcaresubsidy.alberta.ca/ info https://www.alberta.ca/child-care-subsidy

Quebec
- Reduced-contribution CPE / subsidized garderie (set daily contribution). Ask if the space is reduced-contribution. https://www.mfa.gouv.qc.ca/en/services-de-garde/Parents/Pages/default.aspx
- Tax credit for childcare expenses (unsubsidized): https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/

Saskatchewan: $10-a-day regulated under 6 at participating centres. https://www.saskatchewan.ca/residents/family-and-social-support/child-care
Nova Scotia: reduced fees + subsidy (licensed, 12 and under). Apply https://childcare-subsidy.novascotia.ca info https://childcarenovascotia.ca/families/child-care-subsidy  1-844-804-2084
New Brunswick: Parent Subsidy for 0–5 in a designated facility via Parent Portal https://www.nbed.nb.ca/parentportal/en/FinancialAssistance/ guide https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html  1-833-221-9339
PEI: $10-a-day + subsidy. Calculator https://peichildcareregistry.com/calculator.php  https://www.princeedwardisland.ca/en/information/social-development-and-seniors/help-for-child-care-expenses
Newfoundland and Labrador: $10-a-day + subsidy https://www.gov.nl.ca/education/childcare/childcaresubsidy/
Yukon: universal reduction automatic; extra subsidy https://yukon.ca/en/universal-child-care https://yukon.ca/en/education-and-schools/early-childhood-learning-and-programs/apply-child-care-subsidy
Northwest Territories: fee reduction ~$10/day https://www.ece.gov.nt.ca/en/average-10-day-child-care
Nunavut: $10-a-day + daycare subsidy https://www.gov.nu.ca/en/education-and-schools/10_day-child-care

If the parent does not name a province, ask for province or city, then give that jurisdiction’s links. Always include https://www.kidease.ca/benefits as the in-app hub.`;

export function matchBenefitProgram(text: string): BenefitProgram | null {
  const q = ` ${text.toLowerCase()} `;
  const scored = BENEFIT_PROGRAMS.map((p) => ({
    p,
    n: p.aliases.filter((a) => aliasHits(q, a)).length,
  }))
    .filter((x) => x.n > 0)
    .sort((a, b) => {
      if (b.n !== a.n) return b.n - a.n;
      if (a.p.key === "fed") return 1;
      if (b.p.key === "fed") return -1;
      return 0;
    });
  if (scored[0]) return scored[0].p;
  if (/\b(benefits?|subsid(?:y|ies)|subvention|10-a-day|10 a day|\$10|cwelcc|affordable child|help paying|aide à la garde|crédit d['’]impôt|tax credit)\b/i.test(text)) {
    return BENEFIT_PROGRAMS.find((p) => p.key === "fed") ?? null;
  }
  return null;
}

function aliasHits(q: string, alias: string) {
  const a = alias.trim().toLowerCase();
  if (!a) return false;
  if (a.length <= 3) {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(q);
  }
  return q.includes(a);
}
