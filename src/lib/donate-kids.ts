/**
 * Official Canadian children’s hospital foundation donate URLs.
 * KidEase does not process gifts — these open in a new tab.
 */

export const SICKKIDS_DONATE_URL = "https://donate.sickkidsfoundation.com/ndf";
export const CCHF_DONATE_URL = "https://childrenshospitals.donordrive.com/cchf/donate";
export const CCHF_DONATE_URL_FR = "https://childrenshospitals.donordrive.com/cchf/donate?language=fr";

export function cchfDonateUrl(locale: string): string {
  return locale === "fr" ? CCHF_DONATE_URL_FR : CCHF_DONATE_URL;
}

export const DONATE_PATH = "/donate";
