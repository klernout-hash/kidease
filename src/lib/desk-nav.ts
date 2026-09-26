import type { CopyKey } from "./copy.ts";

export type DeskId = "admin" | "support" | "daycare" | "parent";

/** Phone rail: Today · Messages · Listings · Money. Tour times and the rest go in More. */
export const DAYCARE_PRIMARY_NAV_IDS = ["today", "messages", "listings", "money"] as const;
export type DaycarePrimaryNavId = (typeof DAYCARE_PRIMARY_NAV_IDS)[number];

/** Phone rail: For you · Daily care · Children · Pay. Overflow (incl. Messages, Find care) goes in More. */
export const PARENT_PRIMARY_NAV_IDS = ["explore", "care", "children", "payments"] as const;
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

/** Swap these labels anytime — ids stay stable. */
export const DESK_NAV: Record<DeskId, DeskItem[]> = {
  admin: [
    { id: "queue", label: "Waiting on you", hint: "Claims to review" },
    { id: "incomplete", label: "Needs complete", hint: "Partial provider listings", labelKey: "adminIncompleteNav", hintKey: "adminIncompleteNavHint" },
    { id: "winnipeg", label: "Winnipeg gaps", hint: "Ages, fees, real photos", labelKey: "adminWinnipegNav", hintKey: "adminWinnipegNavHint" },
    { id: "verify", label: "Licence & photos", hint: "Review uploads" },
    { id: "daycares", label: "Daycares", hint: "By province" },
    { id: "trust", label: "Trust", hint: "Registries + reports" },
    { id: "screening", label: "Screening", hint: "Document review" },
    { id: "mail", label: "Mail", hint: "Titan inbox" },
    { id: "contracts", label: "Contracts", hint: "Provider agreement + enrolment packs" },
    { id: "money", label: "Money", hint: "Bills and fees" },
    { id: "people", label: "People", hint: "Parents and daycare accounts" },
    { id: "activity", label: "Activity", hint: "Platform log" },
    { id: "reviews", label: "Reviews", hint: "Publish or hide gated parent reviews" },
    { id: "chat", label: "Chat lab", hint: "Scaffold only", href: "/admin-chat" },
    { id: "support", label: "Support", hint: "Cases and refunds", href: "/support" },
    { id: "account", label: "Account", hint: "Profile and preferences", href: "/account", search: { tab: "profile", desk: "admin" } },
  ],
  support: [
    { id: "inbox", label: "Inbox", hint: "Open cases", href: "/support" },
    { id: "new", label: "New case", hint: "Open a case" },
    { id: "account", label: "Account", hint: "Profile and preferences", href: "/account", search: { tab: "profile", desk: "support" } },
  ],
  daycare: [
    { id: "today", label: "Today", hint: "What needs you now", labelKey: "todayHome", hintKey: "deskNavTodayHint" },
    { id: "messages", label: "Messages", hint: "Parent inquiries + tours", labelKey: "messages", hintKey: "deskNavMessagesHint", href: "/inbox", search: { view: "centre" } },
    { id: "tours", label: "Tour times", hint: "When families can visit", labelKey: "tourTimes", hintKey: "deskNavToursHint" },
    { id: "listings", label: "My listings", hint: "Spots, photos, fees", labelKey: "deskNavListings", hintKey: "deskNavListingsHint" },
    { id: "requests", label: "Lead inbox", hint: "Tours, waitlist, and spots", labelKey: "leadInbox", hintKey: "deskNavRequestsHint" },
    { id: "employees", label: "Employees", hint: "Add an employee", labelKey: "employeesTitle", hintKey: "deskNavEmployeesHint" },
    { id: "screening", label: "Screening", hint: "Required documents", labelKey: "listingCoachOpenScreening", hintKey: "deskNavScreeningHint" },
    { id: "money", label: "Money", hint: "Bills you send", labelKey: "deskNavMoney", hintKey: "deskNavMoneyHint" },
    { id: "licence", label: "Licence", hint: "Trust checklist + photo", labelKey: "listingCoachOpenLicence", hintKey: "deskNavLicenceHint" },
    { id: "contract", label: "Contract", hint: "Agreement + enrolment packs", labelKey: "deskNavContract", hintKey: "deskNavContractHint" },
    { id: "promote", label: "Promote", hint: "Priority placement", labelKey: "deskNavPromote", hintKey: "deskNavPromoteHint" },
    { id: "subscription", label: "Subscription", hint: "Centre plans", labelKey: "deskNavSubscription", hintKey: "deskNavSubscriptionHint", icon: "credit-card", href: "/provider/subscription" },
    { id: "claim", label: "Claim a centre", labelKey: "deskNavClaim", href: "/claim" },
    { id: "add", label: "Add a new Daycare listing", hint: "Another location", labelKey: "deskNavAddListing", hintKey: "deskNavAddListingHint" },
    { id: "account", label: "Account", hint: "Sign-in and preferences", labelKey: "account", hintKey: "deskNavAccountHint", href: "/account", search: { tab: "profile", desk: "director" } },
  ],
  parent: [
    { id: "explore", label: "For you", hint: "Matches near you", labelKey: "exploreForYou", hintKey: "deskNavForYouHint" },
    { id: "care", label: "Daily care", hint: "Presence, journal, meds, rooms", labelKey: "dailyCare", hintKey: "dailyCareHint" },
    { id: "children", label: "Children", hint: "Up to 4 profiles", labelKey: "children" },
    { id: "bookings", label: "My requests", hint: "Tours, waitlist, and spots", labelKey: "myRequests", hintKey: "deskNavBookingsHint" },
    { id: "saved", label: "My shortlist", hint: "Compare up to 5", labelKey: "myShortlist", hintKey: "deskNavShortlistHint" },
    { id: "alerts", label: "Search alerts", hint: "Saved searches + notify", labelKey: "searchAlerts", hintKey: "deskNavAlertsHint" },
    { id: "payments", label: "Pay", hint: "Bills from your centre", labelKey: "payments", hintKey: "deskNavPaymentsHint" },
    { id: "messages", label: "Messages", hint: "Centre threads + tours", labelKey: "messages", hintKey: "deskNavParentMessagesHint", href: "/inbox", search: { view: "family" } },
    { id: "search", label: "Find care", labelKey: "wayfindFindCare", href: "/search" },
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
): { tab?: "explore" | "saved" | "enrolled" | "requests" | "payments" | "alerts" | "children" | "care" } {
  if (id === "saved") return { tab: "saved" };
  if (id === "bookings") return { tab: "enrolled" };
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
]);

export function visibleDeskNav(
  desk: DeskId,
  opts?: { providerSubscriptions?: boolean; showPayCtas?: boolean; centreOwner?: boolean },
): DeskItem[] {
  return DESK_NAV[desk].filter((item) => {
    if (item.id === "subscription") {
      if (!opts?.providerSubscriptions) return false;
      if (opts.centreOwner === false) return false;
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
export function visiblePrimaryDeskNav(
  desk: DeskId,
  opts?: { providerSubscriptions?: boolean; showPayCtas?: boolean; centreOwner?: boolean },
): DeskItem[] {
  const items = visibleDeskNav(desk, opts);
  const ids = PHONE_PRIMARY_NAV[desk];
  if (!ids) return items;
  const order = new Map(ids.map((id, i) => [id, i]));
  return items
    .filter((item) => order.has(item.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Phone More sheet: every remaining Parent / Daycare destination. Account last. */
export function visibleSecondaryDeskNav(
  desk: DeskId,
  opts?: { providerSubscriptions?: boolean; showPayCtas?: boolean; centreOwner?: boolean },
): DeskItem[] {
  const items = visibleDeskNav(desk, opts);
  const ids = PHONE_PRIMARY_NAV[desk];
  if (!ids) return [];
  const primary = new Set<string>(ids);
  const rest = items.filter((item) => !primary.has(item.id) && item.id !== "account");
  const account = items.filter((item) => item.id === "account");
  return [...rest, ...account];
}
