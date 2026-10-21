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
  assert.match(css, /html\[data-channel="app"\] \.ke-page[\s\S]*max-width: 720px/);
  assert.match(css, /html\[data-channel="app"\] \.ke-page[\s\S]*max-width: 880px/);
  assert.match(css, /html\[data-channel="app"\] \.ke-page[\s\S]*max-width: 1040px/);
  assert.doesNotMatch(css, /(?<!html\[data-channel="app"\] )\.ke-page \{\s*max-width/);
  assert.match(css, /html\[data-channel="app"\] \.ke-split[\s\S]*minmax\(min\(15rem, 42%\), min\(22rem, 48%\)\)/);
  assert.match(css, /html\[data-channel="app"\] \.ke-rail--visual[\s\S]*display: grid/);
  assert.match(css, /html\[data-channel="app"\] \.ke-apple-button[\s\S]*max-width: 375px/);
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

test("iPhone sizes, landscape, and Dynamic Type are in the viewport pass", () => {
  const phone = src("scripts/phone-viewports.mjs");
  const plist = src("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(plist, /IPHONEOS_DEPLOYMENT_TARGET = 15.0/);
  for (const size of ["320", "375", "390", "393", "402", "414", "420", "428", "430", "440", "568", "667", "812", "844", "852", "874", "896", "912", "926", "932", "956"]) {
    assert.match(phone, new RegExp(size));
  }
  assert.match(phone, /1\.35/);
  assert.match(phone, /1\.64/);
  assert.match(phone, /2\.12/);
  assert.match(src("scripts/e2e-smoke.mjs"), /runPhoneViewportPass/);
  const css = src("src/styles.css");
  assert.match(css, /--ke-text-scale/);
  assert.match(css, /--ke-safe-top: env\(safe-area-inset-top/);
  assert.match(css, /calc\(14px \* var\(--ke-text-scale, 1\)\)/);
  const bridge = src("ios/App/App/KidEaseBridgeViewController.swift");
  assert.match(bridge, /preferredContentSizeCategory/);
  assert.match(bridge, /accessibilityExtraExtraExtraLarge/);
  assert.match(bridge, /--ke-text-scale/);
  assert.match(src("capacitor.config.ts"), /contentInset: "never"/);
  assert.match(src("ios/App/App/Info.plist"), /UIInterfaceOrientationLandscapeLeft/);
  assert.doesNotMatch(src("ios/App/App/Info.plist").split("UISupportedInterfaceOrientations~ipad")[0], /UIInterfaceOrientationPortraitUpsideDown/);
});

test("fold and split-view resize stays on one page", () => {
  const fold = src("scripts/fold-resize.mjs");
  const boot = src("public/channel-boot.js");
  const bridge = src("ios/App/App/KidEaseBridgeViewController.swift");
  const video = src("src/components/video-room-panel.tsx");
  const voice = src("src/components/voice-call-panel.tsx");
  assert.match(src("scripts/e2e-smoke.mjs"), /runFoldResizePass/);
  assert.match(fold, /square-/);
  assert.match(fold, /320/);
  assert.match(fold, /1032/);
  assert.match(fold, /__keFoldMark/);
  assert.match(boot, /addEventListener\("resize", paintFrame\)/);
  assert.match(boot, /keShape/);
  assert.match(bridge, /viewWillTransition/);
  assert.doesNotMatch(bridge, /webView\?\.reload|UIScreen\.main/);
  assert.match(src("src/styles.css"), /html\[data-channel="app"\] \.ke-video-stage video:not\(\.ke-video-self\)[\s\S]*object-fit: contain/);
  assert.match(video, /object-cover/);
  assert.match(video, /data-ke-live="video"/);
  assert.match(voice, /data-ke-live="voice"/);
  assert.match(src("src/styles.css"), /object-fit: contain/);
  assert.doesNotMatch(video.slice(video.indexOf("sdk.connect"), video.indexOf("function toggleMute")), /innerWidth|resize/);
});

test("Play, Samsung, Huawei, and Windows sizes stay resizable", () => {
  const manifest = src("android/app/src/main/AndroidManifest.xml");
  const huawei = src("android/app/src/huawei/AndroidManifest.xml");
  const store = src("scripts/store-viewports.mjs");
  assert.match(manifest, /android:resizeableActivity="true"/);
  assert.match(manifest, /smallestScreenSize\|screenLayout/);
  assert.doesNotMatch(manifest, /screenOrientation|supports-screens|compatible-screens|maxAspectRatio/);
  assert.doesNotMatch(huawei, /screenOrientation|supports-screens|compatible-screens|maxAspectRatio/);
  assert.doesNotMatch(src("android/app/src/main/java/ca/kidease/app/MainActivity.java"), /onConfigurationChanged|webView\.reload|loadUrl\(/);
  assert.match(src("scripts/e2e-smoke.mjs"), /runStoreViewportPass/);
  assert.match(src("scripts/e2e-smoke.mjs"), /runDesktopVisualPass/);
  assert.match(src("scripts/desktop-visual.mjs"), /1280/);
  assert.match(src("scripts/desktop-visual.mjs"), /1440/);
  assert.match(src("scripts/desktop-visual.mjs"), /1920/);
  assert.match(src("scripts/desktop-visual.mjs"), /2560/);
  assert.match(store, /__keFoldMark/);
  assert.match(store, /KidEaseStoreSamsung/);
  assert.match(store, /KidEaseStoreHuawei/);
  assert.match(store, /KidEaseStoreMicrosoft/);
  for (const size of ["344", "360", "384", "393", "412", "480", "500", "600", "640", "673", "712", "720", "740", "768", "800", "804", "841", "854", "873", "880", "882", "884", "900", "912", "915", "960", "1040", "1080", "1104", "1138", "1280", "1368", "1440", "1920", "2560"]) {
    assert.match(store, new RegExp(`\\b${size}\\b`));
  }
  assert.match(src("src/styles.css"), /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(src("src/components/shell.tsx"), /focus-visible:ring-2/);
});
