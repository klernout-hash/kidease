import type { NotificationItem } from "./notifications.ts";

/**
 * Collapse repeats in the bell list: five "New message" rows for the same
 * thread read as one row with a count (B03a). Only neighbours that share the
 * title, the link and the centre fold together, so order stays newest first.
 */
export type NotificationGroup = {
  /** Newest row of the group. Title, link and time come from it. */
  lead: NotificationItem;
  ids: string[];
  count: number;
  unread: boolean;
};

function groupKey(item: NotificationItem): string {
  return `${item.titleKey}|${item.href}|${item.daycareName ?? ""}`;
}

export function groupNotifications(items: readonly NotificationItem[]): NotificationGroup[] {
  const out: NotificationGroup[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && groupKey(last.lead) === groupKey(item)) {
      last.ids.push(item.id);
      last.count += 1;
      if (!item.readAt) last.unread = true;
      continue;
    }
    out.push({ lead: item, ids: [item.id], count: 1, unread: !item.readAt });
  }
  return out;
}

/** "Nov 23, 6:30 p.m." in the viewer's zone (America/Winnipeg by default). */
export function notificationTimeLabel(iso: string, locale: string, timeZone = "America/Winnipeg"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    return date.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
}

/** Marks rows read locally so the dot and the button update before the refetch. */
export function markItemsRead(items: readonly NotificationItem[], ids: readonly string[] | "all", at = new Date().toISOString()): NotificationItem[] {
  const pick = ids === "all" ? null : new Set(ids);
  return items.map((item) => (item.readAt || (pick && !pick.has(item.id)) ? item : { ...item, readAt: at }));
}
