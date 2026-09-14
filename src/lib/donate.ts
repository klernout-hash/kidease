/**
 * Official foundation donate URLs. KidEase does not process these gifts —
 * buttons open the charity’s own form in a new tab.
 *
 * SickKids: donate.sickkidsfoundation.com is the Foundation’s donation form.
 * CCHF: childrenshospitals.donordrive.com/cchf/donate is the network’s
 * public DonorDrive form (childrenshospitals.ca).
 */

export const SICKKIDS_DONATE_URL = "https://donate.sickkidsfoundation.com/ndf?type=One-time";

export const CCHF_DONATE_URL = "https://childrenshospitals.donordrive.com/cchf/donate";

export function cchfDonateUrl(locale: string): string {
  const language = locale === "fr" ? "fr" : "en";
  return `${CCHF_DONATE_URL}?language=${language}`;
}

export function sickKidsDonateUrl(_locale?: string): string {
  return SICKKIDS_DONATE_URL;
}
