import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { helpChatQuestion, scrubHelpChatText } from "../src/lib/ai/help-bubble.ts";
import { helpLauncherFor } from "../src/lib/help-launcher.ts";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const ROLES = ["guest", "parent", "provider", "admin"];
const CHANNELS = ["web", "native"];
const SHOWN = ["/", "/search", "/fr/search", "/parent", "/fr/parent", "/provider", "/account", "/menu", "/inbox", "/help", "/admin", "/daycare/aleph", "/login"];

test("the help launcher is on the main routes for every role and channel", () => {
  for (const role of ROLES) {
    for (const channel of CHANNELS) {
      for (const pathname of SHOWN) {
        assert.equal(helpLauncherFor({ pathname, role, channel }), true, `${role} ${channel} ${pathname}`);
      }
    }
  }
  assert.equal(helpLauncherFor({ pathname: "/video/room-1", role: "parent", channel: "native" }), false);
  assert.equal(helpLauncherFor({ pathname: "/call/abc", role: "provider", channel: "web" }), false);
  assert.equal(helpLauncherFor({ pathname: "/fr/video/room-1", role: "guest", channel: "native" }), false);
});

test("the launcher is mounted once, above the tab bar, and not under a search hide", () => {
  const rootDoc = read("src/routes/__root.tsx");
  const shell = read("src/components/shell.tsx");
  const lite = read("src/components/shell-lite.tsx");
  const css = read("src/styles.css");
  assert.equal((rootDoc.match(/<LiveChatSlot/g) ?? []).length, 1);
  assert.doesNotMatch(shell, /LiveChatSlot/);
  assert.doesNotMatch(lite, /LiveChatSlot|HelpBot/);
  assert.doesNotMatch(shell, /pathname\.startsWith\("\/search"\)/);
  assert.doesNotMatch(css, /ke-app-search\) \.ke-help-bot/);
  assert.match(css, /html\[data-channel="app"\] \.ke-help-bot/);
  assert.match(css, /html\[data-runtime="native"\] \.ke-help-bot/);
  assert.match(css, /z-index:\s*45/);
  const tab = css.indexOf("[data-ke=\"app-tab-bar\"]");
  const tabRule = css.slice(tab, tab + 500);
  assert.match(tabRule, /z-index:\s*50/);
});

test("help chat drops a child's name, birthdate, and health details", () => {
  const raw = "My child is Sam, born April 13, 2019, allergies: peanuts. How do I find a daycare?";
  const clean = scrubHelpChatText(raw);
  assert.equal(clean.includes("Sam"), false);
  assert.equal(clean.includes("April 13, 2019"), false);
  assert.equal(clean.includes("peanuts"), false);
  assert.match(clean, /find a daycare/i);
  assert.equal(helpChatQuestion("My child is Sam"), null);
  assert.equal(helpChatQuestion("2019-04-13"), null);
  assert.equal(helpChatQuestion("allergies: peanuts"), null);
  assert.match(helpChatQuestion("How do I request a tour?") || "", /request a tour/i);
  for (const locale of ["en", "fr"]) {
    const note = tx(locale, "helpBotPrivacy");
    assert.match(note, /name|nom/i);
    assert.match(note, /birth|naissance/i);
    assert.match(note, /health|santé/i);
  }
  const stored = read("src/lib/server/support-chat.ts");
  assert.match(stored, /scrubHelpChatText/);
  assert.match(stored, /storedVisitorBody/);
});
