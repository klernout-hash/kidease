import { DAYCARE_INBOX_HREF, PARENT_REQUESTS_HREF, type LeadKind } from "./lead-requests.ts";
import type { CopyKey } from "./copy.ts";

export const NOTIFICATION_KINDS = ["lead", "tour", "claim", "inbox", "search_alert", "admin_queue", "admin_signup"] as const;
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
  "notifAdminParentSignup",
  "notifAdminProviderSignup",
  "notifAdminListing",
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
  if (input.conversationId) {
    const href =
      input.audience === "provider"
        ? `/inbox/${input.conversationId}?view=centre&detail=1`
        : `/inbox/${input.conversationId}`;
    if (isAllowedNotificationHref(href)) return href;
  }
  return input.audience === "provider" ? DAYCARE_INBOX_HREF : PARENT_REQUESTS_HREF;
}

export function claimNotificationHref(audience: "provider" | "admin"): string {
  return audience === "admin" ? "/admin" : "/provider";
}

export function inboxNotificationHref(conversationId: string, view?: "centre" | "family"): string {
  if (view === "centre") {
    return safeNotificationHref(`/inbox/${conversationId}?view=centre&detail=1`, "/inbox?view=centre");
  }
  return safeNotificationHref(`/inbox/${conversationId}`, "/inbox");
}

/** Tour request, parent message, or a declined/rejected screening-style flag. */
export function isCriticalNotification(item: {
  kind?: string | null;
  titleKey?: string | null;
  status?: string | null;
}): boolean {
  if (item.kind === "tour" || item.titleKey === "notifTourNew" || item.titleKey === "notifTourUpdated") return true;
  if (item.kind === "inbox" || item.titleKey === "notifInbox") return true;
  if (item.titleKey === "notifClaimDeclined" || item.status === "rejected" || item.status === "declined") {
    return item.kind === "claim" || item.kind === "tour";
  }
  return false;
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

export const ADMIN_SIGNUP_EVENT_KINDS = ["account", "signup", "listing"] as const;

export function adminSignupTitleKey(kind?: string | null): NotificationTitleKey | null {
  if (kind === "account") return "notifAdminParentSignup";
  if (kind === "signup") return "notifAdminProviderSignup";
  if (kind === "listing") return "notifAdminListing";
  return null;
}

export function adminSignupHref(input: { kind?: string | null; email?: string | null }): string {
  const role = input.kind === "account" ? "parent" : "provider";
  const params = new URLSearchParams({ tab: "people", role });
  const q = (input.email || "").trim();
  if (q) params.set("q", q);
  return `/admin?${params.toString()}`;
}

/** Project a platform_events row into Kyle's bell. email_status=failed still yields a row. */
export function projectAdminSignupNotification(row: {
  id: string;
  kind: string;
  daycare_name?: string | null;
  provider_name?: string | null;
  provider_email?: string | null;
  email_status?: string | null;
  created_at: string;
}): ProjectedNotification | null {
  const titleKey = adminSignupTitleKey(row.kind);
  if (!titleKey) return null;
  const name =
    (row.provider_name || "").trim() ||
    (row.daycare_name || "").trim() ||
    (row.provider_email || "").trim() ||
    "KidEase";
  return {
    kind: "admin_signup",
    titleKey,
    href: adminSignupHref({ kind: row.kind, email: row.provider_email }),
    sourceKey: notificationSourceKey("admin_signup", row.id, row.kind),
    createdAt: String(row.created_at),
    daycareName: name,
    status: row.email_status || null,
  };
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
