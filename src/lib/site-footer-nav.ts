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

/** Parents column — short set. The menu still has the longer list. */
export const FOOTER_PARENTS: FooterLinkDef[] = [
  copyLink("/search", "search"),
  copyLink("/cities", "browseCities"),
  copyLink("/login", "parentSignIn", {
    search: { role: "parent", desk: "parent", intent: "in", next: "/parent" },
  }),
  copyLink("/benefits", "benefitsTab"),
  copyLink("/compare", "compare"),
  copyLink("/get-app", "getApp"),
];

/** Daycares column — keep the live Daycares / Garderies label. */
export const FOOTER_DAYCARES: FooterLinkDef[] = [
  copyLink("/claim", "claimCta"),
  copyLink("/login", "providerLogin", {
    search: { role: "provider", desk: "director", intent: "in", next: "/provider" },
  }),
  copyLink("/verify", "verifyListings"),
  copyLink("/daycare-requirements", "daycareRequirements"),
  copyLink("/jobs", "findDaycareJobs", { localePaired: true }),
];

/** KidEase column — company / product. Careers stays /jobs/post (no careers route). */
export const FOOTER_KIDEASE: FooterLinkDef[] = [
  copyLink("/plans", "navPlans"),
  copyLink("/about", "about", { localePaired: true }),
  copyLink("/donate", "donateToKids", { localePaired: true }),
  copyLink("/how-it-works", "howItWorksCta", { localePaired: true }),
  copyLink("/jobs/post", "addJobsAtKidEase", { localePaired: true }),
  copyLink("/start-a-daycare", "startADaycare", { localePaired: true }),
];

/** Support column — help and legal only. Unsubscribe lives on Privacy + email, not here. */
export const FOOTER_SUPPORT: FooterLinkDef[] = [
  copyLink("/help", "helpTitle", { localePaired: true }),
  copyLink("/contact", "contactTitle", { localePaired: true }),
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
