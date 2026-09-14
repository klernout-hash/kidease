/**
 * Dated, official-linked childcare benefit facts for the public /benefits page.
 * Do not invent eligibility tables. Update from canada.ca / provincial sites only.
 */

export const BENEFITS_REVIEWED_LABEL_EN = "September 2026";
export const BENEFITS_REVIEWED_LABEL_FR = "septembre 2026";
export const BENEFITS_PERIOD_EN = "July 2026–June 2027";
export const BENEFITS_PERIOD_FR = "juillet 2026–juin 2027";

/** CCB payment period July 2026–June 2027, based on 2025 AFNI (CRA how-much page). */
export const CCB = {
  periodEn: BENEFITS_PERIOD_EN,
  periodFr: BENEFITS_PERIOD_FR,
  afniYear: 2025,
  maxUnder6Year: 8157,
  maxUnder6Month: 679.75,
  max6to17Year: 6883,
  max6to17Month: 573.58,
  fullAfni: 38237,
  howMuchEn:
    "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit/how-much.html",
  howMuchFr:
    "https://www.canada.ca/fr/agence-revenu/services/prestations-enfants-familles/allocation-canadienne-enfants/combien.html",
  overviewEn:
    "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit.html",
  overviewFr:
    "https://www.canada.ca/fr/agence-revenu/services/prestations-enfants-familles/allocation-canadienne-enfants.html",
} as const;

/** Child Disability Benefit, same July 2026–June 2027 period (CRA). */
export const CDB = {
  maxYear: 3480,
  maxMonth: 290,
  hrefEn: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-disability-benefit.html",
  hrefFr:
    "https://www.canada.ca/fr/agence-revenu/services/prestations-enfants-familles/prestation-enfants-handicapes.html",
} as const;

export const CWELCC_HREF = {
  en: "https://www.canada.ca/en/early-learning-child-care-agreement.html",
  fr: "https://www.canada.ca/fr/entente-apprentissage-garde-jeunes-enfants.html",
} as const;

export const MB_SUBSIDY_HREF =
  "https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html";
export const MB_SEE_HREF = "https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca";
export const MB_ZERO_FEE_EFFECTIVE_EN = "September 13, 2026";
export const MB_ZERO_FEE_EFFECTIVE_FR = "13 septembre 2026";

export const AB_SUBSIDY_HREF = "https://www.alberta.ca/child-care-subsidy";
export const AB_FEES_HREF = "https://www.alberta.ca/childcare-fees";
export const AB_ESTIMATOR_HREF = "https://www.childcaresubsidy.gov.ab.ca/ccs/ccs_public.nsf/Estimator?OpenForm";
/** Official Alberta table: kindergarten facility-based, 100 hours. */
export const AB_K_FACILITY_MAX_UNDER_50K = 644;
export const AB_K_FACILITY_NEAR_90K = 161;
export const AB_EXTENDED_HOURS = 100;
export const AB_AFFORDABILITY_FT_MONTH = 326.25;

export const ON_SUBSIDY_HREF = "https://www.ontario.ca/page/child-care-subsidies";
export const ON_CMSM_HREF =
  "https://www.ontario.ca/page/service-system-managers-child-care-and-early-years-programs";

export const BC_ACCB_HREF = "https://www.gov.bc.ca/affordablechildcarebenefit";
export const BC_ESTIMATOR_HREF = "https://myfamilyservices.gov.bc.ca/s/estimator";
export const BC_MFS_HREF = "https://myfamilyservices.gov.bc.ca/";

export function moneyEn(amount: number, decimals = 0) {
  return `$${amount.toLocaleString("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function moneyFr(amount: number, decimals = 0) {
  return `${amount.toLocaleString("fr-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}\u00a0$`;
}
