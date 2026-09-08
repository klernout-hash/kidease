import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { applyLocalRegistryTrust } from "../src/lib/server/license-match.ts";
import { lookupRegistry, registryLookupIsLive } from "../src/lib/server/registry-adapters.ts";
import { stripeChargesLive, stripePayoutsLive } from "../src/lib/stripe-live.ts";
import { MANUAL_STUB_ADAPTER_CODES } from "../src/lib/province-registry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("footer How we verify listings goes to /verify, not /about", () => {
  const footer = src("src/components/site-footer.tsx");
  assert.match(footer, /to="\/verify"/);
  assert.match(footer, /verifyListings/);
  assert.doesNotMatch(footer, /to="\/about">\{t\("verifyListings"\)\}/);
  assert.match(src("src/routes/verify.tsx"), /createFileRoute\("\/verify"\)/);
  assert.match(src("src/routes/verify.tsx"), /verifyLeadPage/);
  assert.match(src("src/lib/sitemap.ts"), /"\/verify"/);
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/verify/);
  assert.match(src("src/routeTree.gen.ts"), /from '\.\/routes\/verify'/);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/verify'/);
});

test("claim and help copy stay honest until Stripe payouts are live", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /perkPay:\s*\n\s*"In-app payments are in setup/);
  assert.match(copy, /perkPayLive: "Payments processed in the app and paid to you directly, quickly"/);
  assert.match(src("src/routes/claim.tsx"), /payoutsLive \? "perkPayLive" : "perkPay"/);
  assert.match(src("src/routes/claim.tsx"), /stripePayoutsLive/);
  assert.match(src("src/lib/help-knowledge.ts"), /Bank payouts stay off until Stripe finishes review/);
  assert.doesNotMatch(src("src/lib/help-knowledge.ts"), /payments paid to you/);
  assert.equal(stripeChargesLive(""), false);
  assert.equal(stripePayoutsLive("sk_live_example", ""), false);
  assert.equal(stripePayoutsLive("sk_live_example", "0"), false);
  assert.equal(stripePayoutsLive("sk_test_example", "1"), false);
  assert.equal(stripePayoutsLive("sk_live_example", "1"), true);
  assert.match(src(".env.example"), /STRIPE_PAYOUTS_LIVE/);
});

test("non-MB registry stubs never light a live government match", () => {
  for (const code of [...MANUAL_STUB_ADAPTER_CODES, "NB", "NS", "PE", "NL", "YT", "NT", "NU"]) {
    const lookup = lookupRegistry(code, "FAKE-LICENCE-1");
    assert.equal(lookup.ok, false, code);
    assert.equal(registryLookupIsLive(lookup), false, code);
    const leftover = applyLocalRegistryTrust({
      id: `${code.toLowerCase()}-stale`,
      province: code,
      licenseNumber: "FAKE-LICENCE-1",
      licenseStatus: "matched",
      registryMatchState: "matched",
    });
    assert.equal(leftover.licenseStatus, "unverified", code);
    assert.equal(leftover.registryMatchState, "unmatched", code);
  }
  const trust = src("src/lib/trust.ts");
  assert.match(trust, /isHonestLicenseMatch/);
  assert.match(trust, /trustCatalogueMatched/);
  assert.match(src("src/lib/copy.ts"), /trustCatalogueMatched: "Catalogue-matched"/);
  assert.match(src("src/lib/copy.ts"), /trustLicensedMatched: "Registry-checked"/);
});

test("home quotes and hero do not invent gated parent reviews", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /heroSub: "See monthly fees and open spots before you tour\."/);
  assert.doesNotMatch(copy, /heroSub: "See monthly fees, open spots, and reviews before you tour\."/);
  assert.match(copy, /quotesLead:/);
  assert.match(copy, /we do not invent testimonials/i);
  assert.match(src("src/routes/index.tsx"), /quotesLead/);
});

test("support desks settle instead of hanging on Loading", () => {
  const desks = src("src/components/session-desks.tsx");
  assert.match(desks, /get-desks-timeout/);
  assert.match(desks, /SESSION_SETTLE_MS/);
  const support = src("src/routes/support.tsx");
  assert.match(support, /SESSION_SETTLE_MS/);
  assert.match(support, /\(isPending \|\| !ready\) && !settled/);
  assert.match(src("src/routes/support.$caseId.tsx"), /\(isPending \|\| !ready\) && !settled/);
});

test("search SSR loader seeds first paint instead of an empty null list", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /loader: async/);
  assert.match(search, /searchDaycares/);
  assert.match(search, /WINNIPEG/);
  assert.match(search, /pendingComponent: BootPending/);
  assert.match(search, /boot\.items\.length > 0 \? boot\.items : null/);
  assert.match(search, /items === null \? \(/);
});
