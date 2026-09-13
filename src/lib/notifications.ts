import { DAYCARE_INBOX_HREF, PARENT_REQUESTS_HREF, type LeadKind } from "./lead-requests.ts";
import type { CopyKey } from "./copy.ts";

export const NOTIFICATION_KINDS = ["lead", "tour", "claim", "inbox", "search_alert", "admin_queue"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_TITLE_KEYS = [
  "notifLeadNew",
  "notifLeadUpdated",
  "notifTourNew",
  "notifTourUpdated",
  "notifClaimPending",
  "notifClaimApproved",
  "notifClaimDeclined",
  "notifClaimWaiting",
  "notifInbox",
  "notifSearchAlert",
  "notifAdminClaim",
  "notifAdminQueue",
] as const;
export type NotificationTitleKey = (typeof NOTIFICATION_TITLE_KEYS)[number];

export const PARENT_ALERTS_HREF = "/parent?tab=alerts";
export const NOTIFICATIONS_PATH = "/notifications";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  titleKey: NotificationTitleKey;
  href: string;
  sourceKey: string;
  createdAt: string;
  readAt: string | null;
  daycareName: string | null;
  status: string | null;
};

export type ProjectedNotification = {
  kind: NotificationKind;
  titleKey: NotificationTitleKey;
  href: string;
  sourceKey: string;
  createdAt: string;
  readAt?: string | null;
  daycareName?: string | null;
  status?: string | null;
};

const ALLOWED_PREFIXES = [
  "/parent",
  "/provider",
  "/inbox",
  "/admin",
  "/claim",
  "/support",
  "/account",
  "/notifications",
] as const;

export function isNotificationKind(value: string | null | undefined): value is NotificationKind {
  return NOTIFICATION_KINDS.includes(value as NotificationKind);
}

export function isNotificationTitleKey(value: string | null | undefined): value is NotificationTitleKey {
  return NOTIFICATION_TITLE_KEYS.includes(value as NotificationTitleKey);
}

/** Badge / count: never invent a number. Invalid or missing → 0. */
export function failClosedUnread(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, Math.floor(n));
}

export function formatUnreadBadge(n: number): string {
  const count = failClosedUnread(n);
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

export function notificationSourceKey(kind: NotificationKind, id: string, extra?: string | null): string {
  const tail = (extra || "").trim();
  return tail ? `${kind}:${id}:${tail}` : `${kind}:${id}`;
}

export function isAllowedNotificationHref(href: string | null | undefined): boolean {
  const raw = String(href || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return false;
  if (raw.includes("://") || raw.includes("\\")) return false;
  const path = raw.split("?")[0] || "";
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}

export function safeNotificationHref(href: string | null | undefined, fallback: string): string {
  if (isAllowedNotificationHref(href)) return String(href);
  return isAllowedNotificationHref(fallback) ? fallback : NOTIFICATIONS_PATH;
}

export function leadNotificationHref(input: {
  audience: "parent" | "provider";
  conversationId?: string | null;
}): string {
  if (input.conversationId && isAllowedNotificationHref(`/inbox/${input.conversationId}`)) {
    return `/inbox/${input.conversationId}`;
  }
  return input.audience === "provider" ? DAYCARE_INBOX_HREF : PARENT_REQUESTS_HREF;
}

export function claimNotificationHref(audience: "provider" | "admin"): string {
  return audience === "admin" ? "/admin" : "/provider";
}

export function inboxNotificationHref(conversationId: string): string {
  return safeNotificationHref(`/inbox/${conversationId}`, "/inbox");
}

export function searchAlertHref(linkPath?: string | null): string {
  return safeNotificationHref(linkPath, PARENT_ALERTS_HREF);
}

export function leadTitleKey(input: {
  audience: "parent" | "provider";
  kind: LeadKind | string;
  status: string;
}): NotificationTitleKey {
  if (input.kind === "tour") {
    return input.audience === "parent" && input.status !== "requested" ? "notifTourUpdated" : "notifTourNew";
  }
  if (input.audience === "parent" && input.status !== "requested") return "notifLeadUpdated";
  return "notifLeadNew";
}

export function claimTitleKey(status: string, audience: "provider" | "admin"): NotificationTitleKey {
  if (audience === "admin") return "notifAdminClaim";
  if (status === "approved") return "notifClaimApproved";
  if (status === "declined") return "notifClaimDeclined";
  if (status === "waiting") return "notifClaimWaiting";
  return "notifClaimPending";
}

export function notificationCopyKey(titleKey: string | null | undefined): CopyKey {
  return isNotificationTitleKey(titleKey) ? titleKey : "notifications";
}

export function fillNotificationCopy(template: string, vars: { name?: string | null; kind?: string | null }): string {
  return template
    .replaceAll("{name}", (vars.name || "").trim() || "KidEase")
    .replaceAll("{kind}", (vars.kind || "").trim() || "request");
}

export function unreadFromRows(rows: ReadonlyArray<{ readAt?: string | null }>): number {
  return failClosedUnread(rows.filter((row) => !row.readAt).length);
}
