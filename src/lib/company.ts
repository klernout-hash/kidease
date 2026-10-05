/**
 * One place for the legal operator facts governments ask to see.
 * Leave a string empty to hide that line. Never render a bracket placeholder.
 */

export const COMPANY_LEGAL_NAME = "10037493 Manitoba Ltd.";
export const CRA_BUSINESS_NUMBER = "725275721";

/** Street address. Empty hides the line on About and Privacy. */
export const COMPANY_ADDRESS_EN = "91 William Gibson Bay, Winnipeg, Manitoba, Canada, R2C 5L7";
/** French postal form. Empty hides the line. */
export const COMPANY_ADDRESS_FR = "91 William Gibson Bay, Winnipeg (Manitoba) Canada R2C 5L7";

/** Empty hides the personal name and keeps the title plus privacy email. */
export const PRIVACY_OFFICER_NAME = "Kyle Lernout";
export const PRIVACY_CONTACT_EMAIL = "privacy@kidease.ca";

const PRIVACY_OFFICER_TITLE_EN = "Privacy Officer";
const PRIVACY_OFFICER_TITLE_FR = "Responsable de la protection des renseignements personnels";

export function companyOperatorLine(locale: "en" | "fr"): string {
  if (locale === "fr") {
    return `KidEase est exploité par ${COMPANY_LEGAL_NAME}, une société canadienne. Numéro d’entreprise de l’ARC : ${CRA_BUSINESS_NUMBER}.`;
  }
  return `KidEase is operated by ${COMPANY_LEGAL_NAME}, a Canadian corporation. CRA Business Number: ${CRA_BUSINESS_NUMBER}.`;
}

export function companyAddress(locale: "en" | "fr"): string {
  const value = locale === "fr" ? COMPANY_ADDRESS_FR : COMPANY_ADDRESS_EN;
  return value.trim();
}

export function privacyOfficerTitle(locale: "en" | "fr"): string {
  return locale === "fr" ? PRIVACY_OFFICER_TITLE_FR : PRIVACY_OFFICER_TITLE_EN;
}

/** Name when set, otherwise title and privacy email with no placeholder. */
export function privacyOfficerLine(locale: "en" | "fr"): string {
  const title = privacyOfficerTitle(locale);
  const name = PRIVACY_OFFICER_NAME.trim();
  if (!name) return `${title}, ${PRIVACY_CONTACT_EMAIL}`;
  return `${name}, ${title}, ${PRIVACY_CONTACT_EMAIL}`;
}
