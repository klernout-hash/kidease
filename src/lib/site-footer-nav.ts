import type { CopyKey } from "./copy";

export type FooterLinkDef = {
  to: string;
  localePaired?: boolean;
  search?: Record<string, string>;
  labelKey?: CopyKey;
  labelEn?: string;
  labelFr?: string;
};

export type FooterColumnId = "parents" | "daycares" | "kidease" | "support";

function copyLink(to: string, labelKey: CopyKey, extra: Partial<FooterLinkDef> = {}): FooterLinkDef {
  return { to, labelKey, ...extra };
}

/** Parents column, highest use first. No sign-in link. */
export const FOOTER_PARENTS: FooterLinkDef[] = [
  copyLink("/search", "search"),
  copyLink("/cities", "browseCities"),
  copyLink("/compare", "compare"),
  copyLink("/tour-checklist", "tourChecklist"),
  copyLink("/benefits", "benefitsTab"),
];

/** Daycares column. /jobs/post is centre hiring, not a KidEase careers page. */
export const FOOTER_DAYCARES: FooterLinkDef[] = [
  copyLink("/claim", "listYourDaycare"),
  copyLink("/plans", "navPlans"),
  copyLink("/verify", "verifyListings"),
  copyLink("/daycare-requirements", "daycareRequirements"),
  copyLink("/start-a-daycare", "startADaycare", { localePaired: true }),
  copyLink("/jobs", "findDaycareJobs", { localePaired: true }),
];

/** KidEase column. No careers link: there is no KidEase careers page. */
export const FOOTER_KIDEASE: FooterLinkDef[] = [
  copyLink("/about", "about", { localePaired: true }),
  copyLink("/team", "team"),
  copyLink("/donate", "donateToKids", { localePaired: true }),
  copyLink("/get-app", "getApp"),
];

/** Support column. Legal links sit on the bottom row. */
export const FOOTER_SUPPORT: FooterLinkDef[] = [
  copyLink("/help", "helpTitle", { localePaired: true }),
  copyLink("/faq", "faqShort"),
  copyLink("/how-it-works", "howItWorksCta", { localePaired: true }),
  copyLink("/contact", "contactTitle", { localePaired: true }),
  copyLink("/report", "reportSafetyConcern", { localePaired: true }),
];

export const FOOTER_LEGAL: FooterLinkDef[] = [
  copyLink("/privacy", "privacy", { localePaired: true }),
  copyLink("/terms", "terms", { localePaired: true }),
  copyLink("/cookies", "cookies", { localePaired: true }),
];

export const FOOTER_COLUMNS: Record<FooterColumnId, FooterLinkDef[]> = {
  parents: FOOTER_PARENTS,
  daycares: FOOTER_DAYCARES,
  kidease: FOOTER_KIDEASE,
  support: FOOTER_SUPPORT,
};

export function footerLinkLabel(
  link: FooterLinkDef,
  t: (key: CopyKey) => string,
  locale: string,
): string {
  if (link.labelKey) return t(link.labelKey);
  return locale === "fr" ? (link.labelFr ?? link.labelEn ?? "") : (link.labelEn ?? "");
}

export function footerCollator(locale: string): Intl.Collator {
  return new Intl.Collator(locale === "fr" ? "fr-CA" : "en", { sensitivity: "base" });
}

export function sortFooterLinks<T extends { label: string }>(links: readonly T[], locale: string): T[] {
  const collator = footerCollator(locale);
  return [...links].sort((a, b) => collator.compare(a.label, b.label));
}
