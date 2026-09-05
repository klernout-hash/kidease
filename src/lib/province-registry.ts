/**
 * First-class Canadian provinces and territories for trust / licence review.
 * Official registry URLs are only stored when we are confident they are the
 * public lookup page. Unknown subsidy paths stay null rather than guessed.
 *
 * FR-CA: nameFr is ready. Adapter notes stay EN until a translator pass.
 */

export const ADAPTER_STATUSES = ["stub", "manual", "adapter_ready"] as const;
export type AdapterStatus = (typeof ADAPTER_STATUSES)[number];

export type Jurisdiction = {
  code: string;
  nameEn: string;
  nameFr: string;
  registryUrl: string | null;
  subsidyUrl: string | null;
  adapterStatus: AdapterStatus;
  adapterNotes: string;
};

export const JURISDICTIONS: Jurisdiction[] = [
  {
    code: "BC",
    nameEn: "British Columbia",
    nameFr: "Colombie-Britannique",
    registryUrl: "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/finding-child-care",
    subsidyUrl: "https://www.gov.bc.ca/affordablechildcarebenefit",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against the BC childcare finder until a sync is wired.",
  },
  {
    code: "AB",
    nameEn: "Alberta",
    nameFr: "Alberta",
    registryUrl: "https://www.alberta.ca/lookup-child-care",
    subsidyUrl: "https://www.alberta.ca/child-care-subsidy",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against Alberta Lookup Child Care.",
  },
  {
    code: "SK",
    nameEn: "Saskatchewan",
    nameFr: "Saskatchewan",
    registryUrl: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
    subsidyUrl: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against the Saskatchewan child care pages.",
  },
  {
    code: "MB",
    nameEn: "Manitoba",
    nameFr: "Manitoba",
    registryUrl: "https://childcaresearch.gov.mb.ca/en",
    subsidyUrl: "https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca",
    adapterStatus: "manual",
    adapterNotes:
      "Manitoba has a public childcare search. Operators review claims against that registry. Live scraper is a follow-up, not a half-UI.",
  },
  {
    code: "ON",
    nameEn: "Ontario",
    nameFr: "Ontario",
    registryUrl: "https://www.ontario.ca/page/licensed-child-care",
    subsidyUrl: "https://www.ontario.ca/page/child-care-subsidies",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against Ontario licensed child care.",
  },
  {
    code: "QC",
    nameEn: "Quebec",
    nameFr: "Québec",
    registryUrl: "https://www.mfa.gouv.qc.ca/en/services-de-garde/Parents/Pages/default.aspx",
    subsidyUrl: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against Québec services de garde.",
  },
  {
    code: "NB",
    nameEn: "New Brunswick",
    nameFr: "Nouveau-Brunswick",
    registryUrl: "https://www2.gnb.ca/content/gnb/en/departments/education/elcc.html",
    subsidyUrl:
      "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against New Brunswick ELCC.",
  },
  {
    code: "NS",
    nameEn: "Nova Scotia",
    nameFr: "Nouvelle-Écosse",
    registryUrl: "https://childcarenovascotia.ca/",
    subsidyUrl: "https://childcarenovascotia.ca/families/child-care-subsidy",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against Child Care Nova Scotia.",
  },
  {
    code: "PE",
    nameEn: "Prince Edward Island",
    nameFr: "Île-du-Prince-Édouard",
    registryUrl:
      "https://www.princeedwardisland.ca/en/information/education-and-early-years/licensed-early-learning-and-child-care",
    subsidyUrl: "https://peichildcareregistry.com/calculator.php",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against PEI licensed ELCC.",
  },
  {
    code: "NL",
    nameEn: "Newfoundland and Labrador",
    nameFr: "Terre-Neuve-et-Labrador",
    registryUrl: "https://www.gov.nl.ca/education/childcare/",
    subsidyUrl: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against NL child care.",
  },
  {
    code: "YT",
    nameEn: "Yukon",
    nameFr: "Yukon",
    registryUrl: "https://yukon.ca/en/find-child-care",
    subsidyUrl: "https://yukon.ca/en/universal-child-care",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against Yukon Find child care.",
  },
  {
    code: "NT",
    nameEn: "Northwest Territories",
    nameFr: "Territoires du Nord-Ouest",
    registryUrl: "https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care",
    subsidyUrl: "https://www.ece.gov.nt.ca/en/average-10-day-child-care",
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Manual review against NWT early learning and child care.",
  },
  {
    code: "NU",
    nameEn: "Nunavut",
    nameFr: "Nunavut",
    registryUrl: "https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care",
    subsidyUrl: null,
    adapterStatus: "stub",
    adapterNotes: "TODO: live registry adapter. Subsidy URL left null rather than guess a dead path.",
  },
];

const BY_CODE = new Map(JURISDICTIONS.map((j) => [j.code, j]));

export function jurisdiction(code?: string | null): Jurisdiction | undefined {
  const v = (code || "").trim().toUpperCase();
  if (BY_CODE.has(v)) return BY_CODE.get(v);
  return JURISDICTIONS.find(
    (j) => j.nameEn.toUpperCase() === v || j.nameFr.toUpperCase() === v,
  );
}

export function jurisdictionCode(code?: string | null) {
  return jurisdiction(code)?.code ?? ((code || "").trim().toUpperCase() || "—");
}

export function canadaFallbackUrl() {
  return "https://www.canada.ca/en/early-learning-child-care.html";
}

export function adapterStatusLabel(status: AdapterStatus) {
  if (status === "adapter_ready") return "Adapter ready";
  if (status === "manual") return "Manual review";
  return "Adapter stub";
}
