import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CAP_APP_ID,
  CAP_APP_NAME,
  CAP_PROD_HOSTNAME,
  CAP_PROD_SERVER_URL,
  LOCATION_WHEN_IN_USE_EN,
  LOCATION_WHEN_IN_USE_FR,
} from "./native-permissions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Capacitor production config", () => {
  it("defaults the native WebView to https://www.kidease.ca", () => {
    const cap = read("capacitor.config.ts");
    assert.match(cap, /appId:\s*CAP_APP_ID|appId:\s*"ca\.daycarenearme\.app"/);
    assert.match(cap, /appName:\s*CAP_APP_NAME|appName:\s*"KidEase"/);
    assert.match(cap, /https:\/\/www\.kidease\.ca/);
    assert.match(cap, /www\.kidease\.ca/);
    assert.doesNotMatch(cap, /hostname:\s*"kidease\.app"/);
    assert.match(cap, /CAP_SERVER_URL/);
    assert.doesNotMatch(cap, /ACCESS_BACKGROUND_LOCATION|NSLocationAlways/);
    assert.equal(CAP_APP_ID, "ca.daycarenearme.app");
    assert.equal(CAP_APP_NAME, "KidEase");
    assert.equal(CAP_PROD_SERVER_URL, "https://www.kidease.ca");
    assert.equal(CAP_PROD_HOSTNAME, "www.kidease.ca");
  });

  it("exposes prepare scripts and does not invent store secrets", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.scripts["cap:sync"], "npx cap sync");
    assert.equal(pkg.scripts["cap:assets"], "node scripts/sync-native-assets.mjs");
    assert.equal(pkg.scripts["cap:permissions"], "node scripts/patch-native-permissions.mjs");
    assert.match(read(".env.example"), /CAP_SERVER_URL=/);
    assert.doesNotMatch(read(".env.example"), /CAP_SERVER_URL=http\S+/);
    const gitignore = read(".gitignore");
    assert.match(gitignore, /android\/key\.properties/);
    assert.doesNotMatch(gitignore, /^android$/m);
    assert.doesNotMatch(gitignore, /^ios$/m);
    assert.doesNotMatch(gitignore, /^native-www$/m);
  });
});

describe("when-in-use location purpose", () => {
  it("names the parent daycare finder and forbids background tracking", () => {
    assert.match(LOCATION_WHEN_IN_USE_EN, /licensed daycares near you/i);
    assert.match(LOCATION_WHEN_IN_USE_EN, /not used in the background/i);
    assert.match(LOCATION_WHEN_IN_USE_FR, /garderies/i);
    assert.doesNotMatch(LOCATION_WHEN_IN_USE_EN, /always|background tracking/i);
    const patch = read("scripts/patch-native-permissions.mjs");
    assert.match(patch, /NSLocationWhenInUseUsageDescription/);
    assert.match(patch, /ACCESS_FINE_LOCATION/);
    assert.match(patch, /ACCESS_COARSE_LOCATION/);
    assert.match(patch, /stripAndroidPermission[\s\S]*ACCESS_BACKGROUND_LOCATION/);
    assert.match(patch, /stripPlistKey[\s\S]*NSLocationAlways/);
  });
});

describe("native project scaffolding", () => {
  it("keeps a fallback webDir and generated resources", () => {
    assert.equal(existsSync(join(root, "native-www/index.html")), true);
    assert.match(read("native-www/index.html"), /https:\/\/www\.kidease\.ca/);
    const icon = join(root, "resources/icon.png");
    const splash = join(root, "resources/splash.png");
    assert.equal(existsSync(icon), true, "resources/icon.png");
    assert.equal(existsSync(splash), true, "resources/splash.png");
    assert.ok(statSync(icon).size > 500);
    assert.deepEqual(readFileSync(icon).subarray(0, 4), PNG_MAGIC);
    assert.ok(statSync(splash).size > 500);
  });

  it("checks in ios + android projects with when-in-use permission strings", () => {
    const info = read("ios/App/App/Info.plist");
    assert.match(info, /NSLocationWhenInUseUsageDescription/);
    assert.match(info, /licensed daycares near you/);
    assert.doesNotMatch(info, /NSLocationAlways/);
    assert.doesNotMatch(info, /<string>location<\/string>/);

    const manifest = read("android/app/src/main/AndroidManifest.xml");
    assert.match(manifest, /ACCESS_COARSE_LOCATION/);
    assert.match(manifest, /ACCESS_FINE_LOCATION/);
    assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);

    const strings = read("android/app/src/main/res/values/strings.xml");
    assert.match(strings, /location_permission_rationale/);
    assert.match(strings, /licensed daycares near you/);
    assert.match(read("android/app/src/main/res/values-fr/strings.xml"), /garderies/);
    assert.match(read("ios/App/App/en.lproj/InfoPlist.strings"), /NSLocationWhenInUseUsageDescription/);
    assert.match(read("ios/App/App/fr.lproj/InfoPlist.strings"), /garderies/);

    const gradle = read("android/app/build.gradle");
    assert.match(gradle, /ca\.daycarenearme\.app|applicationId/);
    assert.match(gradle, /key\.properties/);
    assert.match(read("ios/App/App.xcodeproj/project.pbxproj"), /ca\.daycarenearme\.app/);
    assert.match(read("ios/App/App/capacitor.config.json"), /https:\/\/www\.kidease\.ca/);
    assert.match(read("android/app/src/main/assets/capacitor.config.json"), /https:\/\/www\.kidease\.ca/);
  });
});

describe("mobile build docs stay honest", () => {
  it("documents cap sync, Archive, bundleRelease, and a device smoke list", () => {
    const doc = read("docs/mobile-builds.md");
    assert.match(doc, /npx cap sync|npm run cap:sync/);
    assert.match(doc, /Product → Archive/);
    assert.match(doc, /TestFlight/);
    assert.match(doc, /bundleRelease/);
    assert.match(doc, /Play internal|Internal testing/);
    assert.match(doc, /Physical device smoke checklist/);
    assert.match(doc, /https:\/\/www\.kidease\.ca/);
    assert.match(doc, /ca\.daycarenearme\.app/);
    assert.doesNotMatch(doc, /store listing is live|listed on the App Store/i);
    assert.match(doc, /not\*\* live|are \*\*not\*\* live/);
    assert.doesNotMatch(doc, /-----BEGIN|AuthKey_|sk_live_|AIza[0-9A-Za-z_-]{20,}/);
  });
});
