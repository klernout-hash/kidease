/**
 * First-class Canadian provinces and territories for trust / licence review.
 * Official registry URLs are only stored when we are confident they are the
 * public lookup page. Unknown subsidy paths stay null rather than guessed.
 *
 * FR-CA: nameFr is ready. Adapter notes stay EN until a translator pass.
 */

export const ADAPTER_STATUSES = ["stub", "manual", "adapter_ready"] as const;
export type AdapterStatus = (typeof ADAPTER_STATUSES)[number];

/** First-class stub adapters: documented review path, never a live match. */
export const MANUAL_STUB_ADAPTER_CODES = ["ON", "AB", "BC", "SK", "QC"] as const;
export type ManualStubAdapterCode = (typeof MANUAL_STUB_ADAPTER_CODES)[number];

export type Jurisdiction = {
  code: string;
  nameEn: string;
  nameFr: string;
  registryUrl: string | null;
  subsidyUrl: string | null;
  adapterStatus: AdapterStatus;
  adapterNotes: string;
};

export function isManualStubAdapter(code?: string | null): code is ManualStubAdapterCode {
  const v = (code || "").trim().toUpperCase();
  return (MANUAL_STUB_ADAPTER_CODES as readonly string[]).includes(v);
}

function manualStubNotes(registry: string) {
  return `Adapter stub. No official open-data feed or documented public API. Fail closed to operator manual review against ${registry}. Not a live registry match.`;
}

function leftoverStubNotes(registry: string, extra?: string) {
  return `Adapter stub. Fail closed to operator manual review against ${registry}. No official open-data feed.${extra ? ` ${extra}` : ""} Not a live registry match.`;
}

export const JURISDICTIONS: Jurisdiction[] = [
  {
    code: "BC",
    nameEn: "British Columbia",
    nameFr: "Colombie-Britannique",
    registryUrl: "https://maps.gov.bc.ca/ess/hm/ccf/",
    subsidyUrl: "https://www.gov.bc.ca/affordablechildcarebenefit",
    adapterStatus: "manual",
    adapterNotes: manualStubNotes("the BC childcare finder"),
  },
  {
    code: "AB",
    nameEn: "Alberta",
    nameFr: "Alberta",
    registryUrl: "https://childcare.alberta.ca/childcaresearch/",
    subsidyUrl: "https://www.alberta.ca/child-care-subsidy",
    adapterStatus: "manual",
    adapterNotes: manualStubNotes("Alberta Lookup Child Care"),
  },
  {
    code: "SK",
    nameEn: "Saskatchewan",
    nameFr: "Saskatchewan",
    registryUrl: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care/find-a-child-care-provider-in-my-community",
    subsidyUrl: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
    adapterStatus: "manual",
    adapterNotes: manualStubNotes("the Saskatchewan child care pages"),
  },
  {
    code: "MB",
    nameEn: "Manitoba",
    nameFr: "Manitoba",
    registryUrl: "https://childcaresearch.gov.mb.ca/en",
    subsidyUrl: "https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca",
    adapterStatus: "adapter_ready",
    adapterNotes:
      "Local KidEase catalogue match for bundled Manitoba licence numbers. Not a live scrape of childcaresearch.gov.mb.ca: official search stays the source of truth for inspections.",
  },
  {
    code: "ON",
    nameEn: "Ontario",
    nameFr: "Ontario",
    registryUrl: "https://www.earlyyears.edu.gov.on.ca/LCCWWeb/childcare/search.xhtml?lang=en",
    subsidyUrl: "https://www.ontario.ca/page/child-care-subsidies",
    adapterStatus: "manual",
    adapterNotes: manualStubNotes("Ontario licensed child care"),
  },
  {
    code: "QC",
    nameEn: "Quebec",
    nameFr: "Québec",
    registryUrl: "https://www.quebec.ca/en/family-and-support-for-individuals/childhood/childcare-centres",
    subsidyUrl: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/",
    adapterStatus: "manual",
    adapterNotes: manualStubNotes("Québec services de garde"),
  },
  {
    code: "NB",
    nameEn: "New Brunswick",
    nameFr: "Nouveau-Brunswick",
    registryUrl: "https://www.nbed.nb.ca/parentportal/en/Search/Info/",
    subsidyUrl:
      "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html",
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("New Brunswick ELCC"),
  },
  {
    code: "NS",
    nameEn: "Nova Scotia",
    nameFr: "Nouvelle-Écosse",
    registryUrl: "https://nsbr-online-services.novascotia.ca/DCSOnline/ECDS/loadSearchPage",
    subsidyUrl: "https://childcarenovascotia.ca/families/child-care-subsidy",
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("Child Care Nova Scotia"),
  },
  {
    code: "PE",
    nameEn: "Prince Edward Island",
    nameFr: "Île-du-Prince-Édouard",
    registryUrl:
      "https://www.princeedwardisland.ca/en/information/education-and-early-years/licensed-early-learning-and-child-care",
    subsidyUrl: "https://peichildcareregistry.com/calculator.php",
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("PEI licensed ELCC"),
  },
  {
    code: "NL",
    nameEn: "Newfoundland and Labrador",
    nameFr: "Terre-Neuve-et-Labrador",
    registryUrl: "https://www.childcare.gov.nl.ca/public/ccr/childcare/",
    subsidyUrl: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/",
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("NL child care"),
  },
  {
    code: "YT",
    nameEn: "Yukon",
    nameFr: "Yukon",
    registryUrl: "https://yukon.ca/en/education-and-schools/early-childhood-learning-and-programs/find-child-care-yukoners",
    subsidyUrl: "https://yukon.ca/en/universal-child-care",
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("Yukon Find child care"),
  },
  {
    code: "NT",
    nameEn: "Northwest Territories",
    nameFr: "Territoires du Nord-Ouest",
    registryUrl: "https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care",
    subsidyUrl: "https://www.ece.gov.nt.ca/en/average-10-day-child-care",
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("NWT early learning and child care"),
  },
  {
    code: "NU",
    nameEn: "Nunavut",
    nameFr: "Nunavut",
    registryUrl: "https://www.gov.nu.ca/en/education-and-schools/licensed-child-care-centres",
    subsidyUrl: null,
    adapterStatus: "stub",
    adapterNotes: leftoverStubNotes("Nunavut early learning and child care", "Subsidy URL left null rather than guess a dead path."),
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
  return "https://www.canada.ca/en/early-learning-child-care-agreement/agreements-provinces-territories.html";
}

export function adapterStatusLabel(status: AdapterStatus) {
  if (status === "adapter_ready") return "Catalogue match only: not a live scrape";
  if (status === "manual") return "Manual review: no live adapter";
  return "Adapter stub: manual review";
}

export function adapterStatusHint(status: AdapterStatus) {
  if (status === "adapter_ready") {
    return "Matches the bundled KidEase catalogue. Staff still verify the licence photo. No live government scrape.";
  }
  if (status === "manual") {
    return "Documented adapter stub. Fail closed: no live match. Verify the licence against the official registry before approving a claim.";
  }
  return "No live government scrape. Verify the licence manually before approving a claim.";
}

export function adapterStatusTone(status: AdapterStatus): "ok" | "warn" | "muted" {
  if (status === "adapter_ready") return "ok";
  if (status === "manual") return "warn";
  return "warn";
}
