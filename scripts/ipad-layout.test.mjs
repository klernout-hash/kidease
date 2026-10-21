import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { copy } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("iPad keeps all four orientations", () => {
  const plist = src("ios/App/App/Info.plist");
  const block = plist.split("UISupportedInterfaceOrientations~ipad")[1]?.split("</array>")[0] ?? "";
  for (const name of [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight",
  ]) {
    assert.match(block, new RegExp(name));
  }
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.match(plist, /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
});

test("iPad layout caps the page and splits list plus detail", () => {
  const css = src("src/styles.css");
  assert.match(css, /\.ke-page[\s\S]*max-width: 720px/);
  assert.match(css, /max-width: 880px/);
  assert.match(css, /max-width: 1040px/);
  assert.match(css, /\.ke-split[\s\S]*grid-template-columns: minmax\(15rem, 22rem\) minmax\(0, 1fr\)/);
  assert.match(css, /\.ke-rail--visual[\s\S]*display: grid/);
  assert.match(css, /\.ke-apple-button[\s\S]*max-width: 375px/);
  assert.match(css, /var\(--ke-keyboard, 0px\)/);
  const shell = src("src/components/shell.tsx");
  assert.match(shell, /data-ke="page"/);
  assert.match(shell, /safe-area-inset-left/);
  assert.match(shell, /safe-area-inset-right/);
  assert.match(src("src/components/keyboard-inset.tsx"), /visualViewport/);
  assert.match(src("src/components/keyboard-inset.tsx"), /keyboardWillShow/);
});

test("messages, children, care, calls, and Apple use the wide layout", () => {
  assert.match(src("src/routes/inbox.tsx"), /data-ke="inbox-split"/);
  assert.match(src("src/components/parent-desk.tsx"), /data-ke="children-split"/);
  assert.match(src("src/components/daily-care-desk.tsx"), /data-ke="care-split"/);
  assert.match(src("src/routes/call.$conversationId.tsx"), /data-ke="call-stage"/);
  assert.match(src("src/components/video-room-panel.tsx"), /data-ke="video-room"/);
  assert.match(src("src/routes/login.tsx"), /ke-apple-button/);
  assert.match(src("src/routes/login.tsx"), /data-ke="social-secondary"/);
  assert.match(src("src/routes/video.$roomId.tsx"), /primeCallMedia\("video"\)/);
  assert.match(src("src/components/voice-call-panel.tsx"), /primeCallMedia\("audio"\)/);
  assert.equal(copy.en.mediaPermissionNote.length > 0, true);
  assert.equal(copy.fr.mediaPermissionDenied.length > 0, true);
  assert.doesNotMatch(copy.fr.mediaPermissionNote, /—/);
  assert.doesNotMatch(copy.fr.inboxPickThreadLead, /—/);
});

test("share sheets on iPad have a popover anchor", () => {
  const share = src("node_modules/@capacitor/share/ios/Sources/SharePlugin/SharePlugin.swift");
  assert.match(share, /popover\.sourceView/);
  assert.match(share, /popover\.sourceRect/);
  const app = src("ios/App/App/AppleSignInPlugin.swift");
  assert.match(app, /presentationAnchor/);
  assert.doesNotMatch(src("ios/App/App/KidEaseBridgeViewController.swift"), /UIActivityViewController|UIAlertController/);
});

test("iPad viewport pass is part of the e2e smoke", () => {
  assert.match(src("scripts/e2e-smoke.mjs"), /runIpadViewportPass/);
  assert.match(src("scripts/ipad-viewports.mjs"), /1032/);
  assert.match(src("scripts/ipad-viewports.mjs"), /1376/);
  assert.match(src("scripts/ipad-viewports.mjs"), /834/);
  assert.match(src("scripts/ipad-viewports.mjs"), /1194/);
  assert.match(src("scripts/ipad-viewports.mjs"), /320/);
  assert.match(src("scripts/ipad-viewports.mjs"), /688/);
  assert.match(src("scripts/ipad-viewports.mjs"), /917/);
});
