import { TODAY_PRIMARY_NAV_IDS, type TodayPrimaryNavId } from "@/lib/today-urgency";

export type DeskId = "admin" | "support" | "daycare" | "parent";

export type DeskIcon = "credit-card";

export type DeskItem = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  search?: Record<string, string>;
  icon?: DeskIcon;
};

/** Swap these labels anytime — ids stay stable. */
export const DESK_NAV: Record<DeskId, DeskItem[]> = {
  admin: [
    { id: "queue", label: "Waiting on you", hint: "Claims to review" },
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
    { id: "today", label: "Today", hint: "What needs you now" },
    { id: "messages", label: "Messages", hint: "Parent inquiries + tours", href: "/inbox", search: { view: "centre" } },
    { id: "tours", label: "Tour times", hint: "When families can visit" },
    { id: "listings", label: "My listings", hint: "Spots, photos, fees" },
    { id: "requests", label: "Lead inbox", hint: "Tours, waitlist, and spots" },
    { id: "employees", label: "Employees", hint: "Add an employee" },
    { id: "screening", label: "Screening", hint: "Required documents" },
    { id: "money", label: "Money", hint: "Bills you send" },
    { id: "licence", label: "Licence", hint: "Trust checklist + photo" },
    { id: "contract", label: "Contract", hint: "Agreement + enrolment packs" },
    { id: "promote", label: "Promote", hint: "Priority placement" },
    { id: "subscription", label: "Subscription", hint: "Centre plans", icon: "credit-card", href: "/provider/subscription" },
    { id: "claim", label: "Claim a centre", href: "/claim" },
    { id: "add", label: "Add a new Daycare listing", hint: "Another location" },
    { id: "account", label: "Account", hint: "Sign-in and preferences", href: "/account", search: { tab: "profile", desk: "director" } },
  ],
  parent: [
    { id: "explore", label: "For you", hint: "Matches near you" },
    { id: "children", label: "Children", hint: "Up to 4 profiles" },
    { id: "bookings", label: "My requests", hint: "Tours, waitlist, and spots" },
    { id: "saved", label: "My shortlist", hint: "Compare up to 5" },
    { id: "alerts", label: "Search alerts", hint: "Saved searches + notify" },
    { id: "payments", label: "Pay", hint: "Bills from your centre" },
    { id: "messages", label: "Messages", hint: "Centre threads + tours", href: "/inbox", search: { view: "family" } },
    { id: "search", label: "Find care", href: "/search" },
    { id: "account", label: "Account", hint: "Family profile and alerts", href: "/account", search: { tab: "profile", desk: "parent" } },
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
): { tab?: "explore" | "saved" | "enrolled" | "requests" | "payments" | "alerts" | "children" } {
  if (id === "saved") return { tab: "saved" };
  if (id === "bookings") return { tab: "enrolled" };
  if (id === "payments") return { tab: "payments" };
  if (id === "alerts") return { tab: "alerts" };
  if (id === "children") return { tab: "children" };
  if (id === "explore") return { tab: "explore" };
  return {};
}

export const DESK_META: Record<DeskId, { eyebrow: string; title: string }> = {
  admin: { eyebrow: "Operator", title: "Admin" },
  support: { eyebrow: "Support", title: "Cases" },
  daycare: { eyebrow: "Daycare", title: "Daycare desk" },
  parent: { eyebrow: "Parent", title: "Family desk" },
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

/** Daycare rail/tabs: Today, Messages, Tour times, My listings. */
export function visiblePrimaryDeskNav(
  desk: DeskId,
  opts?: { providerSubscriptions?: boolean; showPayCtas?: boolean; centreOwner?: boolean },
): DeskItem[] {
  const items = visibleDeskNav(desk, opts);
  if (desk !== "daycare") return items;
  const order = new Map(TODAY_PRIMARY_NAV_IDS.map((id, i) => [id, i]));
  return items
    .filter((item) => order.has(item.id as TodayPrimaryNavId))
    .sort((a, b) => (order.get(a.id as TodayPrimaryNavId) ?? 0) - (order.get(b.id as TodayPrimaryNavId) ?? 0));
}

/** Daycare hamburger / Account: keep every other route off the primary four. */
export function visibleSecondaryDeskNav(
  desk: DeskId,
  opts?: { providerSubscriptions?: boolean; showPayCtas?: boolean; centreOwner?: boolean },
): DeskItem[] {
  const items = visibleDeskNav(desk, opts);
  if (desk !== "daycare") return [];
  const primary = new Set<string>(TODAY_PRIMARY_NAV_IDS);
  const rest = items.filter((item) => !primary.has(item.id) && item.id !== "account");
  const account = items.filter((item) => item.id === "account");
  return [...rest, ...account];
}
