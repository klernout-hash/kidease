import type { CopyKey } from "./copy.ts";

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
};

/** Swap these labels anytime. Ids stay stable. */
export const DESK_NAV: Record<DeskId, DeskItem[]> = {
  admin: [
    { id: "queue", label: "Home", hint: "Waiting on you" },
    { id: "incomplete", label: "Needs complete", hint: "Partial provider listings", labelKey: "adminIncompleteNav", hintKey: "adminIncompleteNavHint" },
    { id: "winnipeg", label: "Winnipeg gaps", hint: "Ages, fees, real photos", labelKey: "adminWinnipegNav", hintKey: "adminWinnipegNavHint" },
    { id: "verify", label: "Licence and photos", hint: "Review uploads" },
    { id: "daycares", label: "Daycares", hint: "By province" },
    { id: "trust", label: "Trust", hint: "Registries + reports" },
    { id: "screening", label: "Screening", hint: "Document review" },
    { id: "mail", label: "Messages", hint: "Mail" },
    { id: "contracts", label: "Contracts", hint: "Provider agreement + enrolment packs" },
    { id: "money", label: "Money", hint: "Bills and fees" },
    { id: "people", label: "People", hint: "Parents and daycare accounts" },
    { id: "activity", label: "Activity", hint: "Platform log" },
    { id: "reviews", label: "Reviews", hint: "Publish or hide gated parent reviews" },
    { id: "chat", label: "Chat lab", hint: "Scaffold only", href: "/admin-chat" },
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
    { id: "notify-prefs", label: "Notification preferences", labelKey: "notificationPrefs", href: "/notifications" },
    { id: "security", label: "Login and security", labelKey: "loginSecurity", href: "/account", search: { tab: "profile", section: "profile", desk: "admin" } },
    { id: "email-sms", label: "Email and SMS", labelKey: "emailAndSms", href: "/unsubscribe" },
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
    { id: "subscription", label: "Subscription", hint: "Pro, Network, and add-ons", labelKey: "deskNavSubscription", hintKey: "deskNavSubscriptionHint", icon: "credit-card", href: "/provider/subscription" },
    { id: "profile", label: "Profile", labelKey: "profile", href: "/account", search: { tab: "profile", section: "profile", desk: "director" } },
    { id: "appearance", label: "Appearance", labelKey: "appearance", href: "/account", search: { tab: "profile", section: "appearance", desk: "director" } },
    { id: "delete", label: "Delete account", labelKey: "deleteAccount", href: "/account", search: { tab: "profile", section: "delete", desk: "director" } },
    { id: "notify-prefs", label: "Notification preferences", labelKey: "notificationPrefs", href: "/notifications" },
    { id: "security", label: "Login and security", labelKey: "loginSecurity", href: "/account", search: { tab: "profile", section: "profile", desk: "director" } },
    { id: "email-sms", label: "Email and SMS", labelKey: "emailAndSms", href: "/unsubscribe" },
    { id: "claim", label: "Claim a centre", labelKey: "deskNavClaim", href: "/claim" },
    { id: "add", label: "Add a new Daycare listing", hint: "Another location", labelKey: "deskNavAddListing", hintKey: "deskNavAddListingHint" },
    { id: "account", label: "Account", hint: "Sign-in and preferences", labelKey: "account", hintKey: "deskNavAccountHint", href: "/account", search: { tab: "profile", desk: "director" } },
  ],
  parent: [
    { id: "explore", label: "Home", hint: "Matches near you", labelKey: "exploreForYou", hintKey: "deskNavForYouHint", href: "/parent", search: { tab: "explore" } },
    { id: "care", label: "Daily care", hint: "Presence, journal, meds, rooms", labelKey: "dailyCare", hintKey: "dailyCareHint" },
    { id: "children", label: "Children", hint: "Up to 4 profiles", labelKey: "children" },
    { id: "bookings", label: "Requests", hint: "Tours, waitlist, and spots", labelKey: "navRequestsShort", hintKey: "deskNavBookingsHint" },
    { id: "waitlists", label: "Waitlists", hint: "Your spot requests", labelKey: "navWaitlists", hintKey: "deskNavWaitlistsHint" },
    { id: "saved", label: "Saved", hint: "5 free · 10 on Plus", labelKey: "saved", hintKey: "deskNavShortlistHint" },
    { id: "alerts", label: "Search alerts", hint: "Saved searches + notify", labelKey: "searchAlerts", hintKey: "deskNavAlertsHint" },
    { id: "payments", label: "Pay", hint: "Bills from your centre", labelKey: "payments", hintKey: "deskNavPaymentsHint" },
    { id: "messages", label: "Messages", hint: "Centre threads + tours", labelKey: "messages", hintKey: "deskNavParentMessagesHint", href: "/inbox", search: { view: "family" } },
    { id: "search", label: "Search", labelKey: "search", href: "/search" },
    { id: "upgrade", label: "Subscription", hint: "Parent Plus", labelKey: "deskNavUpgrade", hintKey: "deskNavUpgradeHint", icon: "credit-card", href: "/parent", search: { tab: "subscription" } },
    { id: "profile", label: "Profile", labelKey: "profile", href: "/account", search: { tab: "profile", section: "profile", desk: "parent" } },
    { id: "appearance", label: "Appearance", labelKey: "appearance", href: "/account", search: { tab: "profile", section: "appearance", desk: "parent" } },
    { id: "delete", label: "Delete account", labelKey: "deleteAccount", href: "/account", search: { tab: "profile", section: "delete", desk: "parent" } },
    { id: "notify-prefs", label: "Notification preferences", labelKey: "notificationPrefs", href: "/notifications" },
    { id: "security", label: "Login and security", labelKey: "loginSecurity", href: "/account", search: { tab: "profile", section: "profile", desk: "parent" } },
    { id: "email-sms", label: "Email and SMS", labelKey: "emailAndSms", href: "/unsubscribe" },
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

export const DESK_META: Record<DeskId, { eyebrow: string; title: string; eyebrowKey?: CopyKey; titleKey?: CopyKey }> = {
  admin: { eyebrow: "Operator", title: "Admin" },
  support: { eyebrow: "Support", title: "Cases" },
  daycare: { eyebrow: "Daycare", title: "Daycare desk", eyebrowKey: "deskDirector", titleKey: "daycareDeskTitle" },
  parent: { eyebrow: "Parent", title: "Family desk", eyebrowKey: "deskParent", titleKey: "familyDeskTitle" },
};

type DeskNavOpts = {
  providerSubscriptions?: boolean;
  showPayCtas?: boolean;
  /** When false, hide the parent Subscription item. Daycare subscription stays. */
  subscriptionsEnabled?: boolean;
  centreOwner?: boolean;
  /** Active centre member. Subscription stays hidden for staff unless this is true. */
  centreLinked?: boolean;
};

/** Hide Subscription only when the live director flag is off. Hide Promote pay chrome when SHOW_PAY_CTAS is off. */
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
    if (item.id === "upgrade") {
      if (desk === "parent" && opts?.subscriptionsEnabled === false) return false;
      return true;
    }
    if (item.id === "subscription") {
      if (opts?.centreOwner === false && opts?.centreLinked !== true) return false;
      return true;
    }
    if (item.id === "promote") {
      if (opts?.showPayCtas === false) return false;
      if (opts?.centreOwner === false) return false;
      return true;
    }
    if (OWNER_ONLY_NAV.has(item.id) && opts?.centreOwner === false) return false;
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
    { id: "search-tools", label: "Search tools", labelKey: "navSearchTools", itemIds: ["search", "alerts"] },
    { id: "account", label: "Account", labelKey: "account", itemIds: ["profile", "appearance", "upgrade", "delete"] },
    { id: "settings", label: "Settings", labelKey: "settings", itemIds: ["notify-prefs", "security", "email-sms"] },
  ],
  daycare: [
    { id: "desk", label: "Daycare desk", labelKey: "daycareDeskTitle", open: true, itemIds: ["today", "requests", "tours", "listings", "messages"] },
    { id: "business", label: "Business", labelKey: "navBusiness", open: true, itemIds: ["money", "promote"] },
    { id: "team", label: "Team", labelKey: "navTeam", itemIds: ["employees", "screening"] },
    { id: "compliance", label: "Compliance", labelKey: "navCompliance", itemIds: ["licence", "contract"] },
    { id: "grow", label: "Grow", labelKey: "navGrow", itemIds: ["post-job", "add", "claim"] },
    { id: "account", label: "Account", labelKey: "account", itemIds: ["profile", "appearance", "subscription", "delete"] },
    { id: "settings", label: "Settings", labelKey: "settings", itemIds: ["notify-prefs", "security", "email-sms"] },
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
