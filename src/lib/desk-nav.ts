export type DeskId = "admin" | "support" | "daycare" | "parent";

export type DeskIcon = "credit-card";

export type DeskItem = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  icon?: DeskIcon;
};

/** Swap these labels anytime — ids stay stable. */
export const DESK_NAV: Record<DeskId, DeskItem[]> = {
  admin: [
    { id: "queue", label: "Waiting on you", hint: "Claims to review" },
    { id: "daycares", label: "Daycares", hint: "By province" },
    { id: "trust", label: "Trust", hint: "Registries + reports" },
    { id: "mail", label: "Mail", hint: "Titan inbox" },
    { id: "contracts", label: "Contracts", hint: "Status board until DocuSign is live" },
    { id: "money", label: "Money", hint: "Bills and fees" },
    { id: "activity", label: "Activity", hint: "Platform log" },
    { id: "reviews", label: "Reviews", hint: "Parent reviews to approve" },
    { id: "chat", label: "Chat lab", hint: "Scaffold only", href: "/admin-chat" },
    { id: "support", label: "Support", hint: "Cases and refunds", href: "/support" },
  ],
  support: [
    { id: "inbox", label: "Inbox", hint: "Open cases", href: "/support" },
    { id: "new", label: "New case", hint: "Open a case" },
  ],
  daycare: [
    { id: "requests", label: "Incoming requests", hint: "Approve, wait, decline" },
    { id: "money", label: "Money", hint: "Bills you send" },
    { id: "listings", label: "My listings", hint: "Spots, photos, fees" },
    { id: "add", label: "Add a new Daycare listing", hint: "Another location" },
    { id: "licence", label: "Licence", hint: "Trust checklist + photo" },
    { id: "contract", label: "Contract", hint: "KidEase agreement" },
    { id: "promote", label: "Promote", hint: "Priority placement" },
    { id: "subscription", label: "Subscription", hint: "Centre plans", icon: "credit-card", href: "/provider/subscription" },
    { id: "claim", label: "Claim a centre", href: "/claim" },
    { id: "messages", label: "Messages", href: "/inbox" },
  ],
  parent: [
    { id: "children", label: "Children", hint: "Up to 4 profiles" },
    { id: "bookings", label: "Enrolment", hint: "Per child, per centre" },
    { id: "saved", label: "Saved centres" },
    { id: "payments", label: "Pay", hint: "Bills from your centre" },
    { id: "messages", label: "Messages", href: "/inbox" },
    { id: "search", label: "Find care", href: "/search" },
  ],
};

export const DESK_META: Record<DeskId, { eyebrow: string; title: string }> = {
  admin: { eyebrow: "Operator", title: "Admin" },
  support: { eyebrow: "Support", title: "Cases" },
  daycare: { eyebrow: "Daycare", title: "Centre desk" },
  parent: { eyebrow: "Parent", title: "Family desk" },
};

/** Hide ghost provider Subscription unless admin (or FEATURE_PROVIDER_SUBSCRIPTIONS). */
export function visibleDeskNav(
  desk: DeskId,
  opts?: { providerSubscriptions?: boolean },
): DeskItem[] {
  return DESK_NAV[desk].filter((item) => {
    if (item.id === "subscription") return Boolean(opts?.providerSubscriptions);
    return true;
  });
}
