export type NotificationReceipt = { id: string; source: "projected" | "unified" };

export type FeedNotification<T> = {
  key: string;
  data: T;
  createdAt: string;
  readAt: string | null;
  receipts: NotificationReceipt[];
};

export function notificationEventKey(source: NotificationReceipt["source"], key: string): string {
  const message = /^(?:inbox:message|parent_new_message|daycare_new_message):(.+)$/.exec(key);
  return message ? `message:${message[1]}` : `${source}:${key}`;
}

/** Projected rows come first so merged message alerts keep the thread link. */
export function mergeNotificationEvents<T>(items: readonly FeedNotification<T>[]): FeedNotification<T>[] {
  const events = new Map<string, FeedNotification<T>>();
  for (const item of items) {
    const existing = events.get(item.key);
    events.set(item.key, existing ? {
      ...existing,
      readAt: existing.readAt ?? item.readAt,
      receipts: [...existing.receipts, ...item.receipts],
    } : item);
  }
  return [...events.values()].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.key.localeCompare(b.key),
  );
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
