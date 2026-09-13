import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  claimNotificationHref,
  claimTitleKey,
  failClosedUnread,
  fillNotificationCopy,
  formatUnreadBadge,
  inboxNotificationHref,
  isAllowedNotificationHref,
  adminSignupHref,
  leadNotificationHref,
  leadTitleKey,
  notificationSourceKey,
  projectAdminSignupNotification,
  searchAlertHref,
  unreadFromRows,
} from "../src/lib/notifications.ts";
import { isKidEaseOperatorEmail } from "../src/lib/admin-email.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const COPY_KEYS = [
  "notifications",
  "notificationsEmpty",
  "notificationsEmptyLead",
  "notificationsUnread",
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
  "parentDesk",
  "daycareDesk",
  "settings",
];

test("unread badge fails closed — no invented counts", () => {
  assert.equal(failClosedUnread(undefined), 0);
  assert.equal(failClosedUnread(null), 0);
  assert.equal(failClosedUnread(-3), 0);
  assert.equal(failClosedUnread(Number.NaN), 0);
  assert.equal(failClosedUnread("3"), 0);
  assert.equal(failClosedUnread(2.8), 2);
  assert.equal(failClosedUnread(0), 0);
  assert.equal(formatUnreadBadge(0), "");
  assert.equal(formatUnreadBadge(1), "1");
  assert.equal(formatUnreadBadge(12), "9+");
  assert.equal(unreadFromRows([{ readAt: null }, { readAt: "2026-09-13" }]), 1);
});

test("notification deep links only hit real KidEase screens", () => {
  assert.equal(isAllowedNotificationHref("/parent?tab=enrolled"), true);
  assert.equal(isAllowedNotificationHref("/provider?desk=requests"), true);
  assert.equal(isAllowedNotificationHref("/inbox/abc"), true);
  assert.equal(isAllowedNotificationHref("/admin"), true);
  assert.equal(isAllowedNotificationHref("/claim"), true);
  assert.equal(isAllowedNotificationHref("/support"), true);
  assert.equal(isAllowedNotificationHref("https://evil.example"), false);
  assert.equal(isAllowedNotificationHref("//evil.example"), false);
  assert.equal(isAllowedNotificationHref("/login"), false);
  assert.equal(isAllowedNotificationHref("javascript:alert(1)"), false);
  assert.equal(leadNotificationHref({ audience: "parent" }), "/parent?tab=enrolled");
  assert.equal(leadNotificationHref({ audience: "provider" }), "/provider?desk=requests");
  assert.equal(leadNotificationHref({ audience: "parent", conversationId: "c1" }), "/inbox/c1");
  assert.equal(claimNotificationHref("admin"), "/admin");
  assert.equal(claimNotificationHref("provider"), "/provider");
  assert.equal(inboxNotificationHref("thread-1"), "/inbox/thread-1");
  assert.equal(searchAlertHref("/parent?tab=alerts"), "/parent?tab=alerts");
  assert.equal(searchAlertHref("https://phish"), "/parent?tab=alerts");
});

test("admin bell projects signup and listing even when email_status=failed", () => {
  const joan = projectAdminSignupNotification({
    id: "ev_joan",
    kind: "signup",
    daycare_name: "",
    provider_name: "Joan Mbabazi",
    provider_email: "kidsworlddaycare2025@gmail.com",
    email_status: "failed",
    created_at: "2026-09-13T14:33:00.000Z",
  });
  assert.ok(joan);
  assert.equal(joan.kind, "admin_signup");
  assert.equal(joan.titleKey, "notifAdminProviderSignup");
  assert.equal(joan.daycareName, "Joan Mbabazi");
  assert.equal(joan.status, "failed");
  assert.equal(joan.href, "/admin?tab=people&role=provider&q=kidsworlddaycare2025%40gmail.com");
  assert.equal(isAllowedNotificationHref(joan.href), true);
  assert.equal(adminSignupHref({ kind: "account", email: "sam@family.ca" }), "/admin?tab=people&role=parent&q=sam%40family.ca");
  const listing = projectAdminSignupNotification({
    id: "ev_list",
    kind: "listing",
    daycare_name: "Kids World Daycare",
    provider_name: "Joan Mbabazi",
    provider_email: "kidsworlddaycare2025@gmail.com",
    email_status: "failed",
    created_at: "2026-09-13T14:49:00.000Z",
  });
  assert.equal(listing?.titleKey, "notifAdminListing");
  assert.equal(projectAdminSignupNotification({ id: "x", kind: "chat", created_at: "2026-09-13" }), null);
});

test("source keys stay stable and titles stay honest", () => {
  assert.equal(notificationSourceKey("lead", "lr_1", "parent:confirmed"), "lead:lr_1:parent:confirmed");
  assert.equal(leadTitleKey({ audience: "provider", kind: "tour", status: "requested" }), "notifTourNew");
  assert.equal(leadTitleKey({ audience: "parent", kind: "spot_inquiry", status: "confirmed" }), "notifLeadUpdated");
  assert.equal(claimTitleKey("pending", "provider"), "notifClaimPending");
  assert.equal(claimTitleKey("approved", "provider"), "notifClaimApproved");
  assert.equal(claimTitleKey("pending", "admin"), "notifAdminClaim");
  assert.equal(fillNotificationCopy("New request · {name}", { name: "Sunshine" }), "New request · Sunshine");
});

test("EN and FR-CA ship the same notification copy keys", () => {
  const text = src("src/lib/copy.ts");
  for (const key of COPY_KEYS) {
    assert.equal(text.split(`${key}:`).length >= 3, true, key);
  }
  assert.match(text, /notificationsEmpty: "No notifications yet"/);
  assert.match(text, /notificationsEmpty: "Aucune notification pour l’instant"/);
});

test("routeTree and page register /notifications", () => {
  const tree = src("src/routeTree.gen.ts");
  const route = src("src/routes/notifications.tsx");
  assert.match(route, /createFileRoute\("\/notifications"\)/);
  assert.match(tree, /from '\.\/routes\/notifications'/);
  assert.match(tree, /id:\s*'\/notifications'/);
  assert.match(tree, /fullPath:\s*'\/notifications'/);
  assert.match(src("src/components/notifications-inbox.tsx"), /RedirectToSignIn/);
  assert.match(src("src/components/notifications-inbox.tsx"), /notificationsEmpty/);
  assert.match(src("src/components/notifications-inbox.tsx"), /markNotificationRead/);
});

test("signed-in header and menus show a bell; guests do not get a badge", () => {
  const shell = src("src/components/shell.tsx");
  const drawer = src("src/components/nav-drawer.tsx");
  const menu = src("src/routes/menu.tsx");
  assert.match(shell, /NotificationBell/);
  assert.match(shell, /user \? <NotificationBell/);
  assert.match(drawer, /signedIn \? \(/);
  assert.match(drawer, /to="\/notifications"/);
  assert.match(drawer, /icon="notifications"/);
  assert.match(menu, /to="\/notifications"/);
  assert.doesNotMatch(shell, /NotificationBell className="[^"]*guest/);
});

test("hamburger and /menu rows keep an icon for every category", () => {
  const drawer = src("src/components/nav-drawer.tsx");
  const menu = src("src/routes/menu.tsx");
  const required = [
    "explore",
    "saved",
    "parent",
    "daycare",
    "notifications",
    "account",
    "settings",
    "help",
    "language",
    "login",
    "logout",
    "admin",
    "compare",
    "benefits",
    "getApp",
    "about",
    "team",
    "contact",
    "profile",
    "faq",
    "privacy",
    "terms",
    "cookies",
  ];
  const icons = src("src/lib/menu-icons.ts");
  for (const id of required) {
    assert.match(icons, new RegExp(`${id}:`), id);
  }
  assert.match(src("src/components/shell.tsx"), /icon: "explore"/);
  assert.match(drawer, /icon=\{item\.icon\}/);
  assert.match(drawer, /MenuGlyph id="language"/);
  assert.match(drawer, /MenuGlyph id="logout"/);
  assert.match(drawer, /MenuGlyph id="admin"/);
  assert.match(menu, /icon="explore"/);
  assert.match(menu, /icon="saved"/);
  assert.match(menu, /icon="parent"/);
  assert.match(menu, /icon="daycare"/);
  assert.match(menu, /icon="help"/);
  assert.match(menu, /icon="login"/);
  assert.match(menu, /MenuGlyph id="logout"/);
  assert.match(src("src/components/share-button.tsx"), /Share2 className="size-5/);
  assert.match(src("src/components/rate-kidease.tsx"), /Star className="size-5/);
});

test("king-admin stays kyle-only and notifications do not invent Clerk", () => {
  assert.equal(isKidEaseOperatorEmail("kyle@kidease.ca"), true);
  assert.equal(isKidEaseOperatorEmail("other@kidease.ca"), false);
  const server = src("src/lib/server/notifications.ts");
  assert.match(server, /isKidEaseOperatorEmail/);
  assert.match(server, /notifAdminClaim/);
  assert.match(server, /projectFromPlatformSignups/);
  assert.match(server, /projectAdminSignupNotification/);
  assert.match(server, /platform_events/);
  assert.doesNotMatch(server, /clerk/i);
  assert.doesNotMatch(src("src/components/notifications-inbox.tsx"), /clerk/i);
  assert.doesNotMatch(src("src/routes/notifications.tsx"), /clerk/i);
});

test("migration persists notification rows with read_at", () => {
  const sql = src("migrations/0045_user_notifications.sql");
  assert.match(sql, /create table if not exists user_notifications/);
  assert.match(sql, /source_key/);
  assert.match(sql, /read_at/);
  assert.match(sql, /user_notifications_source_uidx/);
  const server = src("src/lib/server/notifications.ts");
  assert.match(server, /lead_requests/);
  assert.match(server, /listing_claims/);
  assert.match(server, /search_alert_notices/);
  assert.match(server, /conversation_reads/);
  assert.match(server, /failClosedUnread/);
  assert.match(server, /on conflict \(user_id, source_key\)/);
});
