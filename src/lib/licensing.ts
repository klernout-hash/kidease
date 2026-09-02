/** Official provincial / territorial licence lookup and subsidy pages. */

import type { Locale } from "@/lib/types";

const REGISTRY: Record<string, { licence: string; subsidy: string }> = {
  BC: {
    licence: "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/finding-child-care",
    subsidy: "https://www.gov.bc.ca/affordablechildcarebenefit",
  },
  AB: {
    licence: "https://www.alberta.ca/lookup-child-care",
    subsidy: "https://www.alberta.ca/child-care-subsidy",
  },
  SK: {
    licence: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
    subsidy: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
  },
  MB: {
    licence: "https://childcaresearch.gov.mb.ca/en",
    subsidy: "https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca",
  },
  ON: {
    licence: "https://www.ontario.ca/page/licensed-child-care",
    subsidy: "https://www.ontario.ca/page/child-care-subsidies",
  },
  QC: {
    licence: "https://www.mfa.gouv.qc.ca/en/services-de-garde/Parents/Pages/default.aspx",
    subsidy: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/",
  },
  NB: {
    licence: "https://www2.gnb.ca/content/gnb/en/departments/education/elcc.html",
    subsidy: "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html",
  },
  NS: {
    licence: "https://childcarenovascotia.ca/",
    subsidy: "https://childcarenovascotia.ca/families/child-care-subsidy",
  },
  PE: {
    licence: "https://www.princeedwardisland.ca/en/information/education-and-early-years/licensed-early-learning-and-child-care",
    subsidy: "https://peichildcareregistry.com/calculator.php",
  },
  NL: {
    licence: "https://www.gov.nl.ca/education/childcare/",
    subsidy: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/",
  },
  YT: {
    licence: "https://yukon.ca/en/find-child-care",
    subsidy: "https://yukon.ca/en/universal-child-care",
  },
  NT: {
    licence: "https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care",
    subsidy: "https://www.ece.gov.nt.ca/en/average-10-day-child-care",
  },
  NU: {
    licence: "https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care",
    subsidy: "https://www.gov.nu.ca/en/education-and-schools/10_day-child-care",
  },
};

/** Jurisdictions where $10-a-day / reduced parent fees are typical at licensed 0–5 centres. Confirm with the centre. */
const TYPICAL_TEN = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU"]);

export function licenseRegistryUrl(province: string) {
  return REGISTRY[province]?.licence ?? "https://www.canada.ca/en/early-learning-child-care.html";
}

/** Official registry, with a search query so parents land closer to this centre. */
export function licenseRecordUrl(province: string, name?: string, licenseNumber?: string | null) {
  const base = licenseRegistryUrl(province);
  const q = [name, licenseNumber].filter(Boolean).join(" ").trim();
  if (!q) return base;
  if (province === "MB") {
    return `https://childcaresearch.gov.mb.ca/en#q=${encodeURIComponent(q)}`;
  }
  return `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`;
}

export function subsidyEstimatorUrl(province: string) {
  return REGISTRY[province]?.subsidy ?? "https://www.canada.ca/en/early-learning-child-care.html";
}

export type CwelccKind = "typical" | "ask" | "qc" | "ab";

export function cwelccKind(province: string): CwelccKind {
  if (province === "QC") return "qc";
  if (province === "AB") return "ab";
  if (TYPICAL_TEN.has(province)) return "typical";
  return "ask";
}

/** Copy key for the fee-reduction badge on cards and listings. */
export function feeBadgeKey(province: string): "badgeTen" | "badgeFifteen" | "badgeReducedQc" | "badgeTenAsk" {
  const kind = cwelccKind(province);
  if (kind === "qc") return "badgeReducedQc";
  if (kind === "ab") return "badgeFifteen";
  if (kind === "typical") return "badgeTen";
  return "badgeTenAsk";
}

export function pinFeeLabel(
  province: string,
  live: boolean,
  fromPrice: number,
  locale: Locale,
  moneyFn: (n: number, locale: Locale) => string,
) {
  if (live && fromPrice > 0) return moneyFn(fromPrice, locale);
  if (cwelccKind(province) === "qc") return "$9.65";
  if (cwelccKind(province) === "ab") return "$15";
  if (cwelccKind(province) === "typical") return "$10";
  return "—";
}

export function hasAmenity(amenities: string, key: string) {
  return amenities
    .split(",")
    .map((s) => s.trim())
    .includes(key);
}

export function opensEarly(hours: string) {
  return /6:\d|7:00|6 a/i.test(hours);
}

export function staysLate(hours: string, amenities: string) {
  return hasAmenity(amenities, "extended") || hasAmenity(amenities, "evenings") || /18:|19:|6 p\.?m|7 p\.?m/i.test(hours);
}

/**
 * Hide sequential source IDs (bc-1 → "1") so cards only show a real provincial licence #.
 * Ontario numbers are 4–7 digits or P-codes; those stay visible.
 */
export function officialLicenceNumber(raw?: string | null, id?: string | null): string | null {
  const n = (raw || "").trim();
  if (!n || n === "—" || n.toLowerCase() === "unknown") return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}
