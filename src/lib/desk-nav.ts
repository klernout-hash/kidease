export type DeskId = "admin" | "daycare" | "parent";

export type DeskItem = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
};

/** Swap these labels anytime — ids stay stable. */
export const DESK_NAV: Record<DeskId, DeskItem[]> = {
  admin: [
    { id: "queue", label: "Waiting on you", hint: "Claims to review" },
    { id: "daycares", label: "Daycares", hint: "By province" },
    { id: "contracts", label: "Contracts", hint: "DocuSign each centre" },
    { id: "money", label: "Money", hint: "Internal ledger" },
    { id: "activity", label: "Activity", hint: "Platform log" },
  ],
  daycare: [
    { id: "requests", label: "Incoming requests", hint: "Approve, wait, decline" },
    { id: "listings", label: "My listings", hint: "Spots, photos, fees" },
    { id: "licence", label: "Licence", hint: "Compliance photo" },
    { id: "contract", label: "Contract", hint: "KidEase agreement" },
    { id: "promote", label: "Promote", hint: "Priority placement" },
    { id: "claim", label: "Claim a centre", href: "/claim" },
    { id: "messages", label: "Messages", href: "/inbox" },
  ],
  parent: [
    { id: "children", label: "Children", hint: "Send profiles to centres" },
    { id: "bookings", label: "Requests", hint: "Enrolment status" },
    { id: "saved", label: "Saved centres" },
    { id: "payments", label: "Payments" },
    { id: "messages", label: "Messages", href: "/inbox" },
    { id: "search", label: "Find care", href: "/search" },
  ],
};

export const DESK_META: Record<DeskId, { eyebrow: string; title: string }> = {
  admin: { eyebrow: "Operator", title: "Admin" },
  daycare: { eyebrow: "Daycare", title: "Centre desk" },
  parent: { eyebrow: "Parent", title: "Family desk" },
};
