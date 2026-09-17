/**
 * Admin summary Stat pills → list filters.
 * Centre membership matches admin.tsx counts (queueable waiting,
 * listingStatusFromClaim live / declined). Lead pills have counts only.
 */

import { isQueueableClaimStatus, listingStatusFromClaim } from "./listing-status.ts";
import { isAdminDeskTab, type AdminDeskTab } from "./account-notify.ts";

export const ADMIN_STAT_FILTERS = [
  "waiting",
  "incomplete",
  "live",
  "declined",
  "all",
  "leads-open",
  "leads-confirmed",
  "leads-answered",
  "leads-declined",
  "verify",
  "license",
  "photo",
] as const;

export type AdminStatFilter = (typeof ADMIN_STAT_FILTERS)[number];

export type AdminLeadStat = Extract<
  AdminStatFilter,
  "leads-open" | "leads-confirmed" | "leads-answered" | "leads-declined"
>;

export type AdminCentreListStat = Extract<AdminStatFilter, "waiting" | "live" | "declined" | "all">;

export const ADMIN_LEAD_STATS = [
  "leads-open",
  "leads-confirmed",
  "leads-answered",
  "leads-declined",
] as const satisfies readonly AdminLeadStat[];

export function isAdminStatFilter(raw?: string | null): raw is AdminStatFilter {
  return Boolean(raw && (ADMIN_STAT_FILTERS as readonly string[]).includes(raw));
}

export function parseAdminStatFilter(raw?: string | null): AdminStatFilter | undefined {
  return isAdminStatFilter(raw) ? raw : undefined;
}

export function defaultAdminStat(tab: string): AdminStatFilter {
  if (tab === "queue") return "waiting";
  if (tab === "incomplete") return "incomplete";
  if (tab === "verify") return "verify";
  if (tab === "daycares") return "all";
  return "all";
}

export function resolveAdminStat(tab: string, raw?: string | null): AdminStatFilter {
  return parseAdminStatFilter(raw) ?? defaultAdminStat(tab);
}

/** Drop the tab default from the URL so /admin stays the waiting queue. */
export function adminStatSearchValue(tab: string, stat: AdminStatFilter): AdminStatFilter | undefined {
  return stat === defaultAdminStat(tab) ? undefined : stat;
}

export function isAdminLeadStat(stat: AdminStatFilter): stat is AdminLeadStat {
  return (ADMIN_LEAD_STATS as readonly string[]).includes(stat);
}

export function isAdminCentreListStat(stat: AdminStatFilter): stat is AdminCentreListStat {
  return stat === "waiting" || stat === "live" || stat === "declined" || stat === "all";
}

export type AdminStatCentre = {
  claimStatus: string;
  live?: boolean;
  claimedAt?: string | null;
};

export function adminCentreListingStatus(c: AdminStatCentre) {
  return listingStatusFromClaim(c.claimStatus, { live: c.live, claimedAt: c.claimedAt });
}

/**
 * Same rules as the Waiting / Live / Declined Stat counts on /admin.
 * Waiting is queueable claim tokens (not every listingStatus "waiting").
 */
export function adminCentreMatchesStat(c: AdminStatCentre, stat: AdminStatFilter): boolean {
  if (stat === "all") return true;
  if (stat === "waiting") return isQueueableClaimStatus(c.claimStatus);
  if (stat === "live") return adminCentreListingStatus(c) === "live";
  if (stat === "declined") return adminCentreListingStatus(c) === "declined";
  return false;
}

export function filterAdminCentresByStat<T extends AdminStatCentre>(
  rows: readonly T[],
  stat: AdminStatFilter,
): T[] {
  if (isAdminLeadStat(stat) || stat === "incomplete") return [];
  return rows.filter((row) => adminCentreMatchesStat(row, stat));
}

export function tallyAdminCentreStats<T extends AdminStatCentre>(rows: readonly T[]) {
  let waiting = 0;
  let approved = 0;
  let declined = 0;
  for (const c of rows) {
    if (isQueueableClaimStatus(c.claimStatus)) waiting += 1;
    const status = adminCentreListingStatus(c);
    if (status === "live") approved += 1;
    if (status === "declined") declined += 1;
  }
  return { waiting, approved, declined, all: rows.length };
}

export type AdminStatSelection = { tab: AdminDeskTab; stat: AdminStatFilter };

/**
 * Pill click → tab + filter. Dedicated UIs win (Waiting → queue,
 * Needs complete → incomplete, In this list → daycares). Live / Declined
 * stay on queue or daycares and swap the list body.
 */
export function selectAdminStat(tab: string, next: AdminStatFilter): AdminStatSelection {
  if (next === "incomplete") return { tab: "incomplete", stat: "incomplete" };
  if (next === "verify" || next === "license" || next === "photo") {
    return { tab: "verify", stat: next };
  }
  if (next === "waiting") return { tab: "queue", stat: "waiting" };
  if (next === "all") return { tab: "daycares", stat: "all" };
  if (next === "live" || next === "declined" || isAdminLeadStat(next)) {
    if (tab === "queue" || tab === "daycares") return { tab, stat: next };
    return { tab: "daycares", stat: next };
  }
  return { tab: isAdminDeskTab(tab) ? tab : "queue", stat: next };
}

export const ADMIN_LEAD_STAT_META: Record<AdminLeadStat, { title: string; countKey: "open" | "confirmed" | "answered" | "declined" }> =
  {
    "leads-open": { title: "Open leads", countKey: "open" },
    "leads-confirmed": { title: "Leads confirmed", countKey: "confirmed" },
    "leads-answered": { title: "Leads answered", countKey: "answered" },
    "leads-declined": { title: "Leads declined", countKey: "declined" },
  };

export const ADMIN_CENTRE_STAT_COPY: Record<
  AdminCentreListStat,
  { eyebrow: string; title: string; empty: string; caughtUp?: string }
> = {
  waiting: {
    eyebrow: "Urgency",
    title: "Waiting on you",
    empty: "No submitted daycares are waiting.",
    caughtUp: "Caught up",
  },
  live: {
    eyebrow: "Listings",
    title: "Live",
    empty: "No live daycares match that search.",
  },
  declined: {
    eyebrow: "Listings",
    title: "Declined",
    empty: "No declined daycares match that search.",
  },
  all: {
    eyebrow: "Listings",
    title: "In this list",
    empty: "No daycares match that search yet.",
  },
};

export function adminLeadStatHonesty(stat: AdminLeadStat, count: number): { title: string; body: string } {
  const title = ADMIN_LEAD_STAT_META[stat].title;
  if (count <= 0) {
    return { title, body: "No lead requests in this category are recorded." };
  }
  return {
    title,
    body: `${count} lead request${count === 1 ? "" : "s"} recorded. This desk shows the count only — those rows are not listed here. Centres review tours, waitlist, and spot asks in their lead inbox.`,
  };
}
