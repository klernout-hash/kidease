import { parentNavCollectsChildData } from "./child-collection.ts";
import type { CopyKey } from "./copy.ts";
import { frenchPath, isFrenchDeskPath, isFrPath, stripLocalePrefix } from "./locale-path.ts";

export type DeskId = "admin" | "support" | "daycare" | "parent";

/** Phone tabs: Today, Requests, Listings, Messages, Account. */
export const DAYCARE_PRIMARY_NAV_IDS = ["today", "requests", "listings", "messages", "account"] as const;
export type DaycarePrimaryNavId = (typeof DAYCARE_PRIMARY_NAV_IDS)[number];

/** Phone tabs: Search, Saved, Requests, Messages, Account. */
export const PARENT_PRIMARY_NAV_IDS = ["search", "saved", "bookings", "messages", "account"] as const;
export type ParentPrimaryNavId = (typeof PARENT_PRIMARY_NAV_IDS)[number];

const PHONE_PRIMARY_NAV: Partial<Record<DeskId, readonly string[]>> = {
  daycare: DAYCARE_PRIMARY_NAV_IDS,
  parent: PARENT_PRIMARY_NAV_IDS,
};

export type DeskIcon = "credit-card";

export type DeskItem = {
  id: string;
  label: string;
  hint?: string;
  labelKey?: CopyKey;
  hintKey?: CopyKey;
  href?: string;
  search?: Record<string, string>;
  icon?: DeskIcon;
  /** Hidden on the production site. Stays available in local and preview builds. */
  devOnly?: boolean;
};

/** Swap these labels anytime. Ids stay stable. */
export const DESK_NAV: Record<DeskId, DeskItem[]> = {
  admin: [
    { id: "queue", label: "Home", hint: "Waiting on you" },
    { id: "incomplete", label: "Needs complete", hint: "Partial provider listings", labelKey: "adminIncompleteNav", hintKey: "adminIncompleteNavHint" },
    { id: "winnipeg", label: "Winnipeg gaps", hint: "Ages, fees, real photos", labelKey: "adminWinnipegNav", hintKey: "adminWinnipegNavHint" },
    { id: "verify", label: "Licence and photos", hint: "Review uploads" },
    { id: "daycares", label: "Daycares", hint: "By province" },
    { id: "trust", label: "Registries", hint: "Licensing bodies and parent reports" },
    { id: "screening", label: "Screening", hint: "Document review" },
    { id: "mail", label: "Messages", hint: "Mail" },
    { id: "contracts", label: "Contracts", hint: "Provider agreement + enrolment packs" },
    { id: "money", label: "Bills", hint: "Parent bills and fees" },
    { id: "people", label: "People", hint: "Parents and daycare accounts" },
    { id: "activity", label: "Activity", hint: "Platform log" },
    { id: "reviews", label: "Reviews", hint: "Publish or hide gated parent reviews" },
    { id: "chat", label: "Chat lab", hint: "Scaffold only", href: "/admin-chat", devOnly: true },
    { id: "ranking", label: "Demand and supply", hint: "Searches vs openings", href: "/admin-ranking" },
    { id: "truth", label: "Listing changes", hint: "Approve each change", labelKey: "adminTruthTitle", hintKey: "adminNavTruthHint", href: "/admin-truth" },
    { id: "spam", label: "Spam and fraud", hint: "High scores only", labelKey: "adminSpamTitle", hintKey: "adminNavSpamHint", href: "/admin-spam" },
    { id: "triage", label: "Support drafts", hint: "Drafts are not sent", labelKey: "adminTriageTitle", hintKey: "adminNavTriageHint", href: "/admin-triage" },
    { id: "vacancies", label: "Provincial openings", hint: "Manitoba and New Brunswick", href: "/admin-vacancies" },
    { id: "qc-home", label: "Quebec home daycares", hint: "Correction and removal requests", href: "/admin-qc-home" },
    { id: "ai", label: "AI usage", hint: "Calls, cost, failures", href: "/admin-ai" },
    { id: "features", label: "Features", hint: "On, off, or a split", labelKey: "adminNavFeatures", hintKey: "adminNavFeaturesHint", href: "/admin/features" },
    { id: "email-health", label: "Email health", hint: "Bounces and suppressed addresses", href: "/admin-email-health" },
    { id: "support", label: "Support", hint: "Cases and refunds", href: "/support" },
    { id: "profile", label: "Profile", labelKey: "profile", href: "/account", search: { tab: "profile", section: "profile", desk: "admin" } },
    { id: "appearance", label: "Appearance", labelKey: "appearance", href: "/account", search: { tab: "profile", section: "appearance", desk: "admin" } },
    { id: "delete", label: "Delete account", labelKey: "deleteAccount", href: "/account", search: { tab: "profile", section: "delete", desk: "admin" } },
    { id: "notify-prefs", label: "Notification preferences", labelKey: "notificationPrefs", href: "/account", search: { tab: "profile", section: "alerts", desk: "admin" } },
    { id: "security", label: "Login and security", labelKey: "loginSecurity", href: "/account", search: { tab: "profile", section: "security", desk: "admin" } },
    { id: "email-sms", label: "Email and SMS", labelKey: "emailAndSms", href: "/account", search: { tab: "profile", section: "email-sms", desk: "admin" } },
    { id: "account", label: "Account", hint: "Profile and preferences", href: "/account", search: { tab: "profile", desk: "admin" } },
  ],
  support: [
    { id: "inbox", label: "Inbox", hint: "Open cases", href: "/support" },
    { id: "new", label: "New case", hint: "Open a case" },
    { id: "account", label: "Account", hint: "Profile and preferences", href: "/account", search: { tab: "profile", desk: "support" } },
  ],
  daycare: [
    { id: "today", label: "Today", hint: "What needs you now", labelKey: "todayHome", hintKey: "deskNavTodayHint", href: "/provider", search: { desk: "today" } },
    { id: "messages", label: "Messages", hint: "Parent inquiries + tours", labelKey: "messages", hintKey: "deskNavMessagesHint", href: "/inbox", search: { view: "centre" } },
    { id: "tours", label: "Tour times", hint: "When families can visit", labelKey: "tourTimes", hintKey: "deskNavToursHint", href: "/provider", search: { desk: "tours" } },
    { id: "listings", label: "Listings", hint: "Spots, photos, fees", labelKey: "deskNavListings", hintKey: "deskNavListingsHint", href: "/provider", search: { desk: "listings" } },
    { id: "requests", label: "Requests", hint: "Tours, waitlist, and spots", labelKey: "navRequestsShort", hintKey: "deskNavRequestsHint", href: "/provider", search: { desk: "requests" } },
    { id: "employees", label: "Employees", hint: "Add an employee", labelKey: "employeesTitle", hintKey: "deskNavEmployeesHint", href: "/provider", search: { desk: "employees" } },
    { id: "screening", label: "Screening", hint: "Required documents", labelKey: "listingCoachOpenScreening", hintKey: "deskNavScreeningHint", href: "/provider", search: { desk: "screening" } },
    { id: "money", label: "Earnings", hint: "Payouts, invoices, and payment history", labelKey: "deskNavMoney", hintKey: "deskNavMoneyHint", href: "/provider", search: { desk: "money" } },
    { id: "licence", label: "Licence", hint: "Trust checklist + photo", labelKey: "listingCoachOpenLicence", hintKey: "deskNavLicenceHint", href: "/provider", search: { desk: "licence" } },
    { id: "contract", label: "Contract", hint: "Agreement + enrolment packs", labelKey: "deskNavContract", hintKey: "deskNavContractHint", href: "/provider", search: { desk: "contract" } },
    { id: "promote", label: "Promote", hint: "Promote and add-ons", labelKey: "deskNavPromote", hintKey: "deskNavPromoteHint", href: "/provider", search: { desk: "promote" } },
    { id: "post-job", label: "Post a daycare job", labelKey: "postDaycareJob", href: "/jobs/post" },
    { id: "subscription", label: "Upgrade", hint: "Pro, Network, and add-ons", labelKey: "deskNavSubscription", hintKey: "deskNavSubscriptionHint", icon: "credit-card", href: "/provider/subscription" },
    { id: "profile", label: "Profile", labelKey: "profile", href: "/account", search: { tab: "profile", section: "profile", desk: "director" } },
    { id: "appearance", label: "Appearance", labelKey: "appearance", href: "/account", search: { tab: "profile", section: "appearance", desk: "director" } },
    { id: "delete", label: "Delete account", labelKey: "deleteAccount", href: "/account", search: { tab: "profile", section: "delete", desk: "director" } },
    { id: "notify-prefs", label: "Notification preferences", labelKey: "notificationPrefs", href: "/account", search: { tab: "profile", section: "alerts", desk: "director" } },
    { id: "security", label: "Login and security", labelKey: "loginSecurity", href: "/account", search: { tab: "profile", section: "security", desk: "director" } },
    { id: "email-sms", label: "Email and SMS", labelKey: "emailAndSms", href: "/account", search: { tab: "profile", section: "email-sms", desk: "director" } },
    { id: "claim", label: "Claim a centre", labelKey: "deskNavClaim", href: "/claim" },
    { id: "add", label: "Add a new Daycare listing", hint: "Another location", labelKey: "deskNavAddListing", hintKey: "deskNavAddListingHint" },
    { id: "account", label: "Account", hint: "Sign-in and preferences", labelKey: "account", hintKey: "deskNavAccountHint", href: "/account", search: { tab: "profile", desk: "director" } },
  ],
  parent: [
    { id: "explore", label: "Home", hint: "Matches near you", labelKey: "exploreForYou", hintKey: "deskNavForYouHint", href: "/parent", search: { tab: "explore" } },
    { id: "care", label: "Daily care", hint: "Presence, journal, meds, rooms", labelKey: "dailyCare", hintKey: "dailyCareHint", href: "/parent", search: { tab: "care" } },
    { id: "children", label: "Children", hint: "Up to 4 profiles", labelKey: "children", hintKey: "childrenLimit", href: "/parent", search: { tab: "children" } },
    { id: "bookings", label: "Requests", hint: "Tours, waitlist, and spots", labelKey: "navRequestsShort", hintKey: "deskNavBookingsHint", href: "/parent", search: { tab: "enrolled" } },
    { id: "waitlists", label: "Waitlists", hint: "Your spot requests", labelKey: "navWaitlists", hintKey: "deskNavWaitlistsHint", href: "/parent", search: { tab: "waitlists" } },
    { id: "saved", label: "Saved", hint: "5 free · 10 on Plus", labelKey: "saved", hintKey: "deskNavShortlistHint", href: "/parent", search: { tab: "saved" } },
    { id: "alerts", label: "Search alerts", hint: "Saved searches + notify", labelKey: "searchAlerts", hintKey: "deskNavAlertsHint", href: "/parent", search: { tab: "alerts" } },
    { id: "payments", label: "Pay", hint: "Bills from your centre", labelKey: "payments", hintKey: "deskNavPaymentsHint", href: "/parent", search: { tab: "payments" } },
    { id: "messages", label: "Messages", hint: "Centre threads + tours", labelKey: "messages", hintKey: "deskNavParentMessagesHint", href: "/inbox", search: { view: "family" } },
    { id: "search", label: "Search", labelKey: "search", href: "/search" },
    { id: "upgrade", label: "Upgrade", hint: "Parent Plus", labelKey: "deskNavUpgrade", hintKey: "deskNavUpgradeHint", icon: "credit-card", href: "/parent", search: { tab: "subscription" } },
    { id: "profile", label: "Profile", labelKey: "profile", href: "/account", search: { tab: "profile", section: "profile", desk: "parent" } },
    { id: "appearance", label: "Appearance", labelKey: "appearance", href: "/account", search: { tab: "profile", section: "appearance", desk: "parent" } },
    { id: "delete", label: "Delete account", labelKey: "deleteAccount", href: "/account", search: { tab: "profile", section: "delete", desk: "parent" } },
    { id: "notify-prefs", label: "Notification preferences", labelKey: "notificationPrefs", href: "/account", search: { tab: "profile", section: "alerts", desk: "parent" } },
    { id: "security", label: "Login and security", labelKey: "loginSecurity", href: "/account", search: { tab: "profile", section: "security", desk: "parent" } },
    { id: "email-sms", label: "Email and SMS", labelKey: "emailAndSms", href: "/account", search: { tab: "profile", section: "email-sms", desk: "parent" } },
    { id: "documents", label: "Documents", hint: "Immunization records and subsidy forms", labelKey: "familyDocs", hintKey: "familyDocsHint", href: "/account", search: { tab: "profile", section: "documents", desk: "parent" } },
    { id: "account", label: "Account", hint: "Family profile and alerts", labelKey: "account", hintKey: "deskNavParentAccountHint", href: "/account", search: { tab: "profile", desk: "parent" } },
  ],
};

export type DaycareDesk =
  | "today"
  | "requests"
  | "money"
  | "listings"
  | "tours"
  | "licence"
  | "contract"
  | "promote"
  | "employees"
  | "screening";

export function providerNavSearch(id: string): { desk: DaycareDesk } {
  if (
    id === "today" ||
    id === "money" ||
    id === "listings" ||
    id === "tours" ||
    id === "licence" ||
    id === "contract" ||
    id === "promote" ||
    id === "employees" ||
    id === "screening"
  ) {
    return { desk: id };
  }
  if (id === "add") return { desk: "listings" };
  if (id === "requests") return { desk: "requests" };
  return { desk: "today" };
}

export function parentNavSearch(
  id: string,
): { tab?: "explore" | "saved" | "enrolled" | "requests" | "payments" | "alerts" | "children" | "care" | "waitlists" } {
  if (id === "saved") return { tab: "saved" };
  if (id === "bookings") return { tab: "enrolled" };
  if (id === "waitlists") return { tab: "waitlists" };
  if (id === "payments") return { tab: "payments" };
  if (id === "alerts") return { tab: "alerts" };
  if (id === "children") return { tab: "children" };
  if (id === "care") return { tab: "care" };
  if (id === "explore") return { tab: "explore" };
  return {};
}

/** Parent desk stays on /fr when the page is already French. */
export function parentDeskPath(pathname: string): "/parent" | "/fr/parent" {
  return isFrPath(pathname) ? "/fr/parent" : "/parent";
}

/** Inbox list stays on /fr when the page is already French. */
export function inboxListPath(pathname: string): "/inbox" | "/fr/inbox" {
  return isFrPath(pathname) ? "/fr/inbox" : "/inbox";
}

/** Account stays on /fr when the page is already French. */
export function accountDeskPath(pathname: string): "/account" | "/fr/account" {
  return isFrPath(pathname) ? "/fr/account" : "/account";
}

/** Menu stays on /fr when the page is already French. */
export function menuDeskPath(pathname: string): "/menu" | "/fr/menu" {
  return isFrPath(pathname) ? "/fr/menu" : "/menu";
}

/** Daycare desk stays on /fr when the page is already French. Child routes stay English. */
export function providerDeskPath(pathname: string): "/provider" | "/fr/provider" {
  return isFrPath(pathname) ? "/fr/provider" : "/provider";
}

/** Support desk stays on /fr when the page is already French. */
export function supportDeskPath(pathname: string): "/support" | "/fr/support" {
  return isFrPath(pathname) ? "/fr/support" : "/support";
}

/** Thread links stay on /fr when the page is already French. */
export function inboxThreadTo(pathname: string): "/inbox/$id" | "/fr/inbox/$id" {
  return isFrPath(pathname) ? "/fr/inbox/$id" : "/inbox/$id";
}

export const DESK_META: Record<DeskId, { eyebrow: string; title: string; eyebrowKey?: CopyKey; titleKey?: CopyKey }> = {
  admin: { eyebrow: "Operator", title: "Admin" },
  support: { eyebrow: "Support", title: "Cases" },
  daycare: { eyebrow: "Daycare", title: "Daycare desk", eyebrowKey: "deskDirector", titleKey: "daycareDeskTitle" },
  parent: { eyebrow: "Parent", title: "Family desk", eyebrowKey: "deskParent", titleKey: "familyDeskTitle" },
};

type DeskNavOpts = {
  providerSubscriptions?: boolean;
  showPayCtas?: boolean;
  /** Daycare Subscription and parent plan chrome. Off until SUBSCRIPTIONS_ENABLED. */
  subscriptionsEnabled?: boolean;
  centreOwner?: boolean;
  /** Active centre member. Owner-only items stay hidden for staff unless this is true. */
  centreLinked?: boolean;
};

/**
 * Hide Upgrade and daycare Subscription unless SUBSCRIPTIONS_ENABLED is on.
 * Promote stays in the sidebar. The promote page itself still says plans are
 * not offered while pay buttons are off.
 */
const OWNER_ONLY_NAV = new Set([
  "money",
  "licence",
  "contract",
  "promote",
  "subscription",
  "add",
  "claim",
  "employees",
  "post-job",
]);

export function visibleDeskNav(desk: DeskId, opts?: DeskNavOpts): DeskItem[] {
  return DESK_NAV[desk].filter((item) => {
    if (item.devOnly && import.meta.env?.PROD === true) return false;
    if (item.id === "upgrade" || item.id === "subscription") return opts?.subscriptionsEnabled === true;
    if (item.id === "promote") return opts?.centreOwner !== false;
    if (OWNER_ONLY_NAV.has(item.id) && opts?.centreOwner === false) return false;
    if (desk === "parent" && !parentNavCollectsChildData(item.id)) return false;
    return true;
  });
}

/** Phone primaries for Parent / Daycare. Admin and Support stay a full list. */
export function visiblePrimaryDeskNav(desk: DeskId, opts?: DeskNavOpts): DeskItem[] {
  const items = visibleDeskNav(desk, opts);
  const ids = PHONE_PRIMARY_NAV[desk];
  if (!ids) return items;
  const order = new Map(ids.map((id, i) => [id, i]));
  return items
    .filter((item) => order.has(item.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Phone More sheet: every remaining Parent / Daycare destination. Account last. */
export function visibleSecondaryDeskNav(desk: DeskId, opts?: DeskNavOpts): DeskItem[] {
  const items = visibleDeskNav(desk, opts);
  const ids = PHONE_PRIMARY_NAV[desk];
  if (!ids) return [];
  const primary = new Set<string>(ids);
  const rest = items.filter((item) => !primary.has(item.id) && item.id !== "account");
  const account = items.filter((item) => item.id === "account" && !primary.has(item.id));
  return [...rest, ...account];
}

export type DeskGroup = {
  id: string;
  label: string;
  labelKey?: CopyKey;
  /** First paint. Visitors can still collapse the group. */
  open?: boolean;
  itemIds: readonly string[];
};

/** Same groups in the desktop sidebar and the phone sheet. */
export const DESK_GROUPS: Record<DeskId, DeskGroup[]> = {
  parent: [
    { id: "family", label: "Family desk", labelKey: "familyDeskTitle", open: true, itemIds: ["explore", "saved", "bookings", "waitlists", "messages"] },
    { id: "my-family", label: "My family", labelKey: "navMyFamily", open: true, itemIds: ["children", "care", "payments"] },
    { id: "search-tools", label: "Search tools", labelKey: "navSearchTools", open: true, itemIds: ["search", "alerts"] },
    { id: "account", label: "Account", labelKey: "account", open: true, itemIds: ["profile", "appearance", "upgrade", "delete"] },
    { id: "settings", label: "Settings", labelKey: "settings", open: true, itemIds: ["notify-prefs", "security", "email-sms"] },
  ],
  daycare: [
    { id: "desk", label: "Daycare desk", labelKey: "daycareDeskTitle", open: true, itemIds: ["today", "requests", "tours", "listings", "messages"] },
    { id: "business", label: "Business", labelKey: "navBusiness", open: true, itemIds: ["money", "promote"] },
    { id: "team", label: "Team", labelKey: "navTeam", itemIds: ["employees", "screening"] },
    { id: "compliance", label: "Compliance", labelKey: "navCompliance", itemIds: ["licence", "contract"] },
    { id: "grow", label: "Grow", labelKey: "navGrow", itemIds: ["post-job", "add", "claim"] },
    { id: "account", label: "Account", labelKey: "account", open: true, itemIds: ["profile", "appearance", "subscription", "delete"] },
    { id: "settings", label: "Settings", labelKey: "settings", open: true, itemIds: ["notify-prefs", "security", "email-sms"] },
  ],
  admin: [
    { id: "ops", label: "Operations", labelKey: "navOperations", open: true, itemIds: ["queue", "mail"] },
    { id: "review", label: "Review", labelKey: "navReview", open: true, itemIds: ["verify", "truth", "reviews", "screening", "spam", "trust"] },
    { id: "listings-data", label: "Listings data", labelKey: "navListingsData", itemIds: ["daycares", "incomplete", "winnipeg", "vacancies", "ranking"] },
    { id: "support", label: "Support", labelKey: "support", itemIds: ["support", "triage"] },
    { id: "people", label: "People and money", labelKey: "navPeopleMoney", itemIds: ["people", "money", "contracts"] },
    { id: "system", label: "System", labelKey: "navSystem", itemIds: ["activity", "ai", "features", "email-health", "chat"] },
    { id: "account", label: "Account", labelKey: "account", itemIds: ["profile", "appearance", "delete"] },
    { id: "settings", label: "Settings", labelKey: "settings", itemIds: ["notify-prefs", "security", "email-sms"] },
  ],
  support: [
    { id: "cases", label: "Support", labelKey: "support", open: true, itemIds: ["inbox", "new"] },
    { id: "account", label: "Account", labelKey: "account", itemIds: ["account"] },
  ],
};

const DESK_GROUP_KEY = "ke-desk-group";

export function deskGroupStorageKey(desk: string, groupId: string): string {
  return `${DESK_GROUP_KEY}:${desk}:${groupId}`;
}

/** Remember which sidebar groups the visitor left open. A route change must not snap them shut. */
export function readDeskGroupOpen(desk: string, groupId: string, fallback: boolean): boolean {
  if (typeof sessionStorage === "undefined") return fallback;
  try {
    const saved = sessionStorage.getItem(deskGroupStorageKey(desk, groupId));
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    /* private mode */
  }
  return fallback;
}

export function writeDeskGroupOpen(desk: string, groupId: string, open: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(deskGroupStorageKey(desk, groupId), open ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function bindDeskGroup(
  node: HTMLDetailsElement | null,
  desk: string,
  groupId: string,
  fallback: boolean,
): void {
  if (!node || node.dataset.keGroup === "1") return;
  node.dataset.keGroup = "1";
  node.open = readDeskGroupOpen(desk, groupId, fallback);
}

/** Stable id for one sidebar destination. Buttons without a URL use their id. */
export function sidebarDestination(item: DeskItem): string {
  if (!item.href) return `id:${item.id}`;
  const query = item.search ? new URLSearchParams(item.search).toString() : "";
  return query ? `${item.href}?${query}` : item.href;
}

/** Every sidebar link a desk shows, for the owner and flag options given. */
export function sidebarDestinations(desk: DeskId, opts?: DeskNavOpts): string[] {
  return visibleDeskGroups(desk, visibleDeskNav(desk, opts))
    .flatMap((row) => row.items.map(sidebarDestination))
    .sort();
}

/** Desk links stay on /fr when the page is already French. */
export function deskHrefForLocale(href: string, pathname: string): string {
  if (!isFrPath(pathname)) return href;
  const q = href.indexOf("?");
  const pathOnly = q >= 0 ? href.slice(0, q) : href;
  const search = q >= 0 ? href.slice(q) : "";
  if (!isFrenchDeskPath(pathOnly)) return href;
  return `${frenchPath(pathOnly)}${search}`;
}

export function deskPathIsCurrent(href: string, pathname: string): boolean {
  const pathOnly = (href.split("?")[0] || href).replace(/\/$/, "") || "/";
  const here = stripLocalePrefix(pathname);
  const there = stripLocalePrefix(pathOnly);
  return here === there || (there !== "/" && here.startsWith(`${there}/`));
}

export function visibleDeskGroups(
  desk: DeskId,
  items: DeskItem[],
): { group: DeskGroup; items: DeskItem[] }[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return DESK_GROUPS[desk]
    .map((group) => ({
      group,
      items: group.itemIds.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      }),
    }))
    .filter((row) => row.items.length > 0);
}
