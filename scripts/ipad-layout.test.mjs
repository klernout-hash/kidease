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
  assert.match(src("src/components/social-sign-in-buttons.tsx"), /ke-apple-button/);
  assert.match(src("src/components/social-sign-in-buttons.tsx"), /data-ke="social-secondary"/);
  assert.match(src("src/routes/login.tsx"), /SocialSignInButtons/);
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
  assert.match(bridge, /maximumZoomScale = 3/);
  assert.doesNotMatch(bridge, /maximumZoomScale = 1/);
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
  assert.match(bridge, /allowsBackForwardNavigationGestures = true/);
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
  const activity = src("android/app/src/main/java/ca/kidease/app/MainActivity.java");
  // Rotate and unfold must not rebuild the page. The one-time reload applies the store user agent at startup.
  assert.doesNotMatch(activity, /onConfigurationChanged/);
  assert.match(activity, /webView\.reload\(\)/);
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

test("iPhone Duo: the inner display gets the full width, the rail and two panes", () => {
  const css = src("src/styles.css");
  // One width-only variant for the wide app look. No device or orientation checks.
  assert.match(css, /@custom-variant app-wide \{\s*@media \(min-width: 900px\) \{\s*html\[data-channel="app"\] & \{\s*@slot;/);
  assert.match(css, /@media \(min-width: 900px\) \{\s*html\[data-channel="app"\] \.ke-page \{\s*max-width: min\(100%, 1040px\);/);
  // The old 1024px -> 880px step is gone: 900+ covers it.
  assert.doesNotMatch(css, /\.ke-page \{\s*max-width: 880px/);
  assert.doesNotMatch(css, /max-width: 880px/);
  // Same tabs in every pose: a rail when wider than tall, the bottom bar otherwise.
  assert.match(css, /@media \(min-width: 768px\) and \(min-aspect-ratio: 6\/5\) \{[\s\S]*\[data-ke="app-tab-bar"\][\s\S]*flex-direction: column/);
  assert.match(css, /\[data-ke="shell-frame"\]:has\(> \[data-ke="app-tab-bar"\]\)/);
  assert.doesNotMatch(css, /@media \(min-width: 768px\) \{\s*html\[data-channel="app"\] \[data-ke="app-tab-bar"\],/);
  assert.doesNotMatch(css, /orientation:\s*(landscape|portrait)/);
  const bar = src("src/components/app-tab-bar.tsx");
  assert.match(bar, /--ke-tab-cols/);
  assert.doesNotMatch(bar, /gridTemplateColumns/);
  const shell = src("src/components/shell.tsx");
  assert.match(shell, /data-ke="shell-frame"/);
  assert.match(shell, /useFoldScrollAnchor/);
  assert.match(src("src/components/shell-lite.tsx"), /data-ke="shell-frame"/);
  // List plus map in the app look from 900 wide; the website keeps 1120 and the clean look.
  const split = src("src/lib/use-split-map.ts");
  assert.match(split, /export const APP_SPLIT_MAP_QUERY = "\(min-width: 900px\) and \(min-height: 480px\)"/);
  assert.match(split, /export const SPLIT_MAP_QUERY = "\(min-width: 1120px\)"/);
  assert.match(split, /MutationObserver/);
  const search = src("src/routes/search.tsx");
  assert.match(search, /app-wide:grid-cols-2/);
  assert.match(css, /html\[data-channel="app"\] \[data-ke="search-split"\] \{\s*column-gap: 2rem;/);
  assert.match(search, /data-ke-filters=\{resultFiltersKey\}/);
  // Chips are state, not layout: folding never changes the query.
  assert.doesNotMatch(search, /mobileViewport && (licensedChip|topRatedChip)/);
  assert.match(search, /storeChannel !== "huawei"/);
  assert.match(src("src/routes/inbox.$id.tsx"), /min-\[900px\]:grid-cols-\[minmax\(0,1fr\)_minmax\(16rem,20rem\)\]/);
  assert.match(src("src/components/desk-shell.tsx"), /app-wide:w-52/);
  assert.match(src("src/lib/photo.ts"), /\(max-width: 1199px\) min\(100vw, 1040px\)/);
});

test("iPhone Duo: folding keeps the search sheet, the reader's place and the keyboard height honest", () => {
  const sheet = src("src/components/mobile-search-sheet.tsx");
  assert.match(sheet, /createPortal\(/);
  assert.match(sheet, /document\.body/);
  assert.match(sheet, /matchMedia\("\(min-width: 768px\)"\)/);
  const anchor = src("src/lib/use-fold-scroll-anchor.ts");
  assert.match(anchor, /FOLD_WIDTH_STEP = 120/);
  assert.match(anchor, /dialog\[open\]/);
  const keyboard = src("src/components/keyboard-inset.tsx");
  assert.match(keyboard, /document\.body\.style\.height = ""/);
  // Keyboard resize stays "body" on every iPhone.
  assert.match(src("capacitor.config.ts"), /resize: "body"/);
  assert.match(src("src/components/first-run.tsx"), /--ke-safe-right/);
});

test("iPhone Duo native files: arm64, no full-screen lock, centred launch logo", () => {
  const plist = src("ios/App/App/Info.plist");
  const caps = plist.split("<key>UIRequiredDeviceCapabilities</key>")[1]?.split("</array>")[0] ?? "";
  assert.match(caps, /<string>arm64<\/string>/);
  assert.doesNotMatch(plist, /armv7/);
  assert.doesNotMatch(plist, /UIRequiresFullScreen/);
  const launch = src("ios/App/App/Base.lproj/LaunchScreen.storyboard");
  assert.match(launch, /image="Splash"/);
  assert.match(launch, /contentMode="scaleAspectFit"/);
  assert.doesNotMatch(launch, /scaleAspectFill/);
  assert.match(launch, /firstAttribute="centerX"/);
  assert.match(launch, /firstAttribute="centerY"/);
  assert.match(launch, /red="0.96470588235294119" green="0.95294117647058818" blue="0.93333333333333335"/);
  assert.match(src("docs/store-review-notes.md"), /Xcode 27\.1 or later and the iOS 27\.1 SDK/);
});

test("iPhone Duo poses are in the fold pass", () => {
  const store = src("scripts/store-viewports.mjs");
  assert.match(store, /export const DUO_POSES/);
  for (const size of ["466", "678", "951", "669", "382"]) assert.match(store, new RegExp(`\\b${size}\\b`));
  const fold = src("scripts/fold-resize.mjs");
  assert.match(fold, /DUO_POSES/);
  assert.match(fold, /runDuoPass/);
  assert.match(fold, /R3T 2N2/);
  for (const file of ["scripts/fold-resize.mjs", "scripts/ipad-viewports.mjs", "scripts/store-viewports.mjs", "scripts/phone-viewports.mjs"]) {
    assert.match(src(file), /if \(width >= 900\) return Math\.min\(width, 1040\);/);
    assert.doesNotMatch(src(file), /return 880/);
  }
});
