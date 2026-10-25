import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { campaignTagFromPayload, resendCampaignTags } from "../src/lib/email-suppressions.ts";
import { activityRoleBadge } from "../src/lib/account-notify.ts";
import { hasListedCapacity, hasVerifiedLicense } from "../src/lib/listing-verified.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Resend tag arrays become a campaign name", () => {
  assert.deepEqual(resendCampaignTags("spot-alert"), [{ name: "campaign", value: "spot-alert" }]);
  assert.equal(
    campaignTagFromPayload({ tags: [{ name: "campaign", value: "admin-notify" }] }),
    "admin-notify",
  );
  assert.equal(campaignTagFromPayload({ tags: { campaign: "spring-blast" } }), "spring-blast");
  const health = src("src/components/admin-email-health-page.tsx");
  assert.match(health, /active="email-health"/);
  assert.match(health, /Untagged is mail/);
  assert.match(src("src/lib/server/notify.ts"), /resendCampaignTags\("admin-notify"\)/);
  assert.match(src("src/lib/server/spot-alerts.ts"), /resendCampaignTags\("spot-alert"\)/);
});

test("a real licence that matches the id tail is on file, and capacity may be a string", () => {
  assert.equal(hasVerifiedLicense({ id: "bc-3572", licenseNumber: "3572" }), true);
  assert.equal(hasVerifiedLicense({ id: "bc-12", licenseNumber: "12" }), false);
  assert.equal(hasListedCapacity("40"), true);
  assert.equal(hasListedCapacity(0), false);
  assert.equal(hasListedCapacity("0"), false);
});

test("activity uses the live profile role, and French home links stay prefixed", () => {
  assert.equal(activityRoleBadge("account", null, "provider"), "Daycare provider");
  assert.equal(activityRoleBadge("account"), "Parent");
  const enroll = src("src/components/role-enroll.tsx");
  assert.match(enroll, /localePath\("\/login"/);
  assert.match(enroll, /localePath\("\/contact"/);
  assert.match(enroll, /localePath\("\/claim"/);
  assert.match(src("src/routes/__root.tsx"), /\/fr\/parent/);
});

test("production hides Chat lab and admin labels stay plain", () => {
  const nav = src("src/lib/desk-nav.ts");
  assert.match(nav, /devOnly\?: boolean/);
  assert.match(nav, /devOnly: true/);
  assert.match(nav, /import\.meta\.env\?\.PROD === true/);
  assert.match(nav, /label: "Registries"/);
  assert.match(nav, /label: "Bills"/);
  assert.doesNotMatch(nav, /label: "Trust"/);
  assert.match(nav, /id: "money", label: "Earnings"/);
  assert.match(nav, /id: "money", label: "Money", labelKey: "navMoney"/);
  const labels = Object.fromEntries(visibleDeskNav("admin").map((item) => [item.id, item.label]));
  assert.equal(labels.trust, "Registries");
  assert.equal(labels.money, "Bills");
  const daycareMoney = visibleDeskNav("daycare", { centreOwner: true, subscriptionsEnabled: true }).find((item) => item.id === "money");
  assert.equal(daycareMoney?.label, "Earnings");
  assert.match(src("src/routes/admin-chat.tsx"), /import\.meta\.env\.PROD/);
});
