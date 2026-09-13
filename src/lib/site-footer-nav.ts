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

function literalLink(to: string, labelEn: string, labelFr: string, extra: Partial<FooterLinkDef> = {}): FooterLinkDef {
  return { to, labelEn, labelFr, ...extra };
}

/** Parents column — product links. Destinations unchanged from the four-column footer. */
export const FOOTER_PARENTS: FooterLinkDef[] = [
  copyLink("/search", "search"),
  copyLink("/login", "parentSignIn", {
    search: { role: "parent", desk: "parent", intent: "in", next: "/parent" },
  }),
  literalLink("/parent", "Parent desk", "Espace parent"),
  copyLink("/benefits", "benefitsTab"),
  copyLink("/tour-checklist", "tourChecklist"),
  copyLink("/compare", "compare"),
  copyLink("/parent", "saved", { search: { tab: "saved" } }),
  copyLink("/get-app", "getApp"),
  // Web footer is website-only; same destination as rateKidEaseFromMenu() on www.
  copyLink("/get-app", "rateKidEase"),
];

/** Daycares column — keep the live Daycares / Garderies label. */
export const FOOTER_DAYCARES: FooterLinkDef[] = [
  copyLink("/claim", "claimCta"),
  copyLink("/login", "providerLogin", {
    search: { role: "provider", desk: "director", intent: "in", next: "/provider" },
  }),
  literalLink("/provider", "Daycare desk", "Espace garderie"),
  copyLink("/verify", "verifyListings"),
  copyLink("/jobs", "findDaycareJobs", { localePaired: true }),
];

/** KidEase column (was Caregivers & jobs) — jobs links live here. */
export const FOOTER_KIDEASE: FooterLinkDef[] = [
  copyLink("/jobs", "findDaycareJobs", { localePaired: true }),
  copyLink("/jobs/post", "addJobsAtKidEase", { localePaired: true }),
];

/** Support column (was KidEase) — help, contact, legal. */
export const FOOTER_SUPPORT: FooterLinkDef[] = [
  copyLink("/help", "helpTitle", { localePaired: true }),
  copyLink("/contact", "contactTitle", { localePaired: true }),
  literalLink("/faq", "FAQ", "FAQ", { localePaired: true }),
  copyLink("/how-it-works", "howItWorksCta", { localePaired: true }),
  copyLink("/about", "about", { localePaired: true }),
  copyLink("/team", "team"),
  copyLink("/verify", "verifyListings"),
  copyLink("/privacy", "privacy", { localePaired: true }),
  copyLink("/terms", "terms", { localePaired: true }),
  copyLink("/cookies", "cookies", { localePaired: true }),
  copyLink("/unsubscribe", "unsubscribe"),
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
