import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { plansOpenInShell, plansVisibleInShell } from "../src/lib/native-entitlements.ts";
import { detectBrowserWallets } from "../src/lib/wallets.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("store apps show no plan cards even when subscriptions are on", () => {
  assert.deepEqual(plansVisibleInShell([{ id: "plus" }, { id: "pro" }, { id: "alerts" }], true), []);
  assert.equal(plansVisibleInShell([{ id: "plus" }], false).length, 1);
  assert.equal(plansOpenInShell({ subscriptionsOn: true, channel: "apple" }), false);
  assert.equal(plansOpenInShell({ subscriptionsOn: true, channel: "web" }), true);
  assert.equal(plansOpenInShell({ subscriptionsOn: false, channel: "web" }), false);
  assert.match(src("src/routes/plans.tsx"), /plansOpen/);
  assert.match(src("src/routes/fr.plans.tsx"), /plansOpen/);
});

test("fonts, sign-in aliases, Interac, and public admin words match the queue", () => {
  assert.match(src("src/styles.css"), /format\("woff2"\)/);
  assert.doesNotMatch(src("src/styles.css"), /woff2-variations/);
  assert.match(src("vercel.json"), /"source": "\/sign-in"/);
  assert.match(src("vercel.json"), /"destination": "\/signup"/);
  const terms = src("src/lib/legal-copy.ts");
  assert.match(terms, /Interac e-Transfer is reviewed by KidEase staff/);
  assert.match(terms, /support@kidease\.ca/);
  assert.doesNotMatch(terms, /may be added later/);
  assert.doesNotMatch(terms, /pourront s’ajouter plus tard/);
  assert.doesNotMatch(src("src/lib/safety.ts"), /admin queue|file d’administration/);
  assert.match(src("src/lib/safety.ts"), /KidEase staff review open reports/);
  assert.match(src("src/routes/admin.tsx"), /beforeLoadAdminDesk/);
});

test("French labels, sponsored mark, native store copy, and wallets", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /menu: "Menu"/);
  assert.match(copy, /menu: "Ouvrir le menu"/);
  assert.match(copy, /sponsored: "Commandité"/);
  assert.match(copy, /parentPlusTitle: "Plus parents"/);
  assert.doesNotMatch(copy, /not public yet|ne sont pas encore publiques/);
  assert.doesNotMatch(copy, /nativeVideoNeedsPlus: ".*Parent Plus|nativeVideoNeedsPlus: ".*Plus parents/);
  assert.match(src("src/components/shell.tsx"), /aria-label=\{t\("menu"\)\}/);
  assert.match(src("src/routes/search.tsx"), /DaycareCard/);
  assert.match(src("src/components/daycare-card.tsx"), /SponsoredMark show=\{item\.featuredCity\}/);
  assert.match(src("src/routes/get-app.tsx"), /hideCommerce \? \[\] : comingSoonStores/);
  assert.match(src("src/routes/menu.tsx"), /hideCommerce \? null :/);
  assert.doesNotMatch(src("src/components/site-footer.tsx"), /comingSoonStores/);
  assert.doesNotMatch(src("src/components/site-footer.tsx"), /App Store/);
  const iphone = detectBrowserWallets({
    native: false,
    platform: "ios",
    applePayCapable: true,
    paymentRequest: true,
    userAgent: "iPhone",
  });
  const mac = detectBrowserWallets({
    native: false,
    platform: "web",
    applePayCapable: true,
    paymentRequest: true,
    userAgent: "Macintosh",
  });
  assert.equal(iphone.applePay, true);
  assert.equal(iphone.googlePay, false);
  assert.equal(mac.applePay, false);
  assert.equal(mac.googlePay, false);
});

test("Apple privacy files and the signed-in CI job stay in the repo", () => {
  const manifest = src("ios/App/App/PrivacyInfo.xcprivacy");
  assert.match(manifest, /NSPrivacyCollectedDataTypeHealth/);
  const vercel = src("vercel.json");
  assert.match(vercel, /microphone=\(self\)/);
  assert.match(src("android/app/build.gradle"), /useLegacyPackaging = false/);
  assert.match(src("src/lib/legal-copy.ts"), /microphone are used only while that call is open|microphone servent seulement/);
  assert.match(src(".github/workflows/ci.yml"), /signed-in-e2e/);
  assert.match(src(".github/workflows/live-smoke.yml"), /VERCEL_TOKEN/);
  assert.doesNotMatch(src(".github/workflows/live-smoke.yml"), /branch.protection|required_status_checks/);
  assert.match(src("docs/guardrails.md"), /signed-in-e2e/);
});
