import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { notificationSettingsCopy } from "../src/lib/notification-settings-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("bell screen renders feed only, links to menu settings", () => {
  const inbox = src("src/components/notifications-inbox.tsx");
  assert.match(inbox, /<UnifiedAlertPanel mode="feed" \/>/);
  assert.doesNotMatch(inbox, /<LifecyclePrefs/);
  assert.match(inbox, /screen: "notifications"/);
  assert.match(inbox, /data-ke="bell-settings-link"/);
});

test("panel gates settings form and feed by mode", () => {
  const panel = src("src/components/unified-alert-panel.tsx");
  assert.match(panel, /mode = "all"/);
  assert.match(panel, /showSettings = mode !== "feed"/);
  assert.match(panel, /showFeed = mode !== "settings"/);
});

test("menu route accepts screen=notifications and renders settings screen", async () => {
  const menu = src("src/routes/menu.tsx");
  assert.match(menu, /s\.screen === "notifications"/);
  assert.match(menu, /<NotificationSettingsScreen \/>/);
  const screen = src("src/components/notification-settings-screen.tsx");
  assert.match(screen, /<NotificationPreferences embedded \/>/);
  assert.doesNotMatch(screen, /<UnifiedAlertPanel mode="settings"/);
  assert.match(screen, /<LifecyclePrefs \/>/);
  assert.match(src("src/components/app-menu-screen.tsx"), /marker="notification-settings"/);
});

test("EN and FR-CA copy present and distinct", () => {
  const en = notificationSettingsCopy("en");
  const fr = notificationSettingsCopy("fr");
  for (const key of Object.keys(en)) {
    assert.ok(en[key] && fr[key], key);
  }
  assert.equal(en.title, "Notification settings");
  assert.equal(fr.title, "Paramètres des notifications");
});
