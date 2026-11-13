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

/** Status page stays up for operators. Help links to /status. Parents do not get a System item. */

export const FOOTER_COLUMNS: Record<FooterColumnId, FooterLinkDef[]> = {
  parents: FOOTER_PARENTS,
  daycares: FOOTER_DAYCARES,
  kidease: FOOTER_KIDEASE,
  support: FOOTER_SUPPORT,
};

/** Every page linked from the big footer, in column order, then legal. */
export function footerPageLinks(): FooterLinkDef[] {
  return [...FOOTER_PARENTS, ...FOOTER_DAYCARES, ...FOOTER_SUPPORT, ...FOOTER_KIDEASE, ...FOOTER_LEGAL];
}

export function footerLinkHrefs(links: readonly FooterLinkDef[] = footerPageLinks()): string[] {
  return [...new Set(links.map((link) => link.to))];
}

function isPlansPath(to: string): boolean {
  const bare = String(to || "").split("?")[0].replace(/\/$/, "") || "/";
  return bare === "/plans" || bare === "/fr/plans" || bare.endsWith("/plans");
}

/**
 * Same pages the footer would show. Plans stay hidden unless subscriptions are on.
 * A native shell hides donate and plans, matching the footer.
 */
export function footerLinksForShell(
  input: { native: boolean; plansOn: boolean },
  links: readonly FooterLinkDef[] = footerPageLinks(),
): FooterLinkDef[] {
  return links.filter((link) => {
    if (!input.plansOn && isPlansPath(link.to)) return false;
    if (input.native && (isPlansPath(link.to) || link.to === "/donate" || link.to === "/fr/donate")) return false;
    return true;
  });
}

type FooterMenuGroup = { id: string; titleKey: CopyKey; links: FooterLinkDef[] };

/** A single support group owns help links in the drawer and the app menu. */
export function footerMenuGroupsForShell(input: {
  native: boolean;
  plansOn: boolean;
  omit?: readonly string[];
}): FooterMenuGroup[] {
  const hidden = new Set(input.omit ?? []);
  const groups: FooterMenuGroup[] = [
    { id: "find", titleKey: "navFindCare", links: FOOTER_PARENTS },
    { id: "daycares", titleKey: "navForDaycares", links: FOOTER_DAYCARES },
    { id: "help", titleKey: "menuGetHelp", links: FOOTER_SUPPORT },
    { id: "about", titleKey: "about", links: FOOTER_KIDEASE },
    { id: "legal", titleKey: "menuPrivacyLegal", links: FOOTER_LEGAL },
  ];
  return groups
    .map((group) => ({
      ...group,
      links: footerLinksForShell(input, group.links).filter((link) => !hidden.has(link.to)),
    }))
    .filter((group) => group.links.length > 0);
}

/** Guest drawer owns these complete groups; the lower More section omits them. */
export const GUEST_DRAWER_FOOTER_OMIT = [...FOOTER_PARENTS, ...FOOTER_DAYCARES].map((link) => link.to);

export function guestDrawerMenuGroupsForShell(input: { native: boolean; plansOn: boolean }): FooterMenuGroup[] {
  return footerMenuGroupsForShell(input)
    .filter((group) => group.id === "find" || group.id === "daycares")
    .map((group) => group.id === "find"
      ? { ...group, links: [group.links[0], copyLink("/search", "navMap", { search: { view: "map" } }), ...group.links.slice(1)] }
      : group);
}

/** Hrefs the phone menu is built from before the shell filter. */
export function mobileMenuHrefs(): string[] {
  return footerLinkHrefs();
}

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
