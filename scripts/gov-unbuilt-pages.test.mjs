import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const UNBUILT = [
  "audit", "broadcasts", "settings", "exports", "fee-caps", "change-requests", "claim-notices",
  "complaint-updates", "data-requests", "escalations", "inspection-sync", "notifications", "subsidy",
];
const ALIASES = {
  complaints: "reports?tab=complaints",
  funding: "reports?tab=funding",
  incidents: "reports?tab=incidents",
  ratios: "reports?tab=ratios",
  screening: "reports?tab=screening",
  compliance: "expiries",
  demand: "analytics",
};

test("gov #31: unbuilt /gov pages show the unavailable screen in EN and FR, with no redirect", () => {
  for (const leaf of UNBUILT) {
    for (const [prefix, locale] of [["", "en"], ["fr.", "fr"]]) {
      const file = `src/routes/${prefix}gov_.${leaf}.tsx`;
      if (!existsSync(new URL(`../${file}`, import.meta.url))) {
        // No FR route: the default not-found screen renders the same GovDeskUnavailable.
        assert.equal(prefix, "fr.", `${file} exists in EN`);
        continue;
      }
      const body = src(file);
      assert.ok(!/redirect\(/.test(body), `${file} does not redirect`);
      assert.match(body, new RegExp(`<GovDeskUnavailable locale="${locale}" />`), file);
      assert.match(body, new RegExp(`guardGovDesk\\("${locale}"`), `${file} keeps the desk guard`);
    }
  }
});

test("gov #31: unknown /gov and /fr/gov paths use the same screen", () => {
  const nf = src("src/components/page-not-found.tsx");
  assert.match(nf, /<GovDeskUnavailable locale=\{path\.startsWith\("\/fr\/"\) \? "fr" : "en"\} \/>/);
  assert.match(nf, /This desk page isn’t available yet/);
  assert.match(nf, /Cette page du bureau n’est pas encore offerte/);
  assert.match(nf, /actionTo=\{french \? "\/fr\/gov" : "\/gov"\}/);
});

test("gov #31: deliberate aliases match in EN and FR", () => {
  for (const [leaf, target] of Object.entries(ALIASES)) {
    assert.ok(src(`src/routes/gov_.${leaf}.tsx`).includes(`href: "/gov/${target}"`), leaf);
    assert.ok(src(`src/routes/fr.gov_.${leaf}.tsx`).includes(`href: "/fr/gov/${target}"`), `fr ${leaf}`);
  }
});

test("gov #32: Remember this device sits before the code field, so it can be ticked before auto-submit", () => {
  const page = src("src/routes/verify-2fa.tsx");
  const remember = page.indexOf('data-ke="remember-device"');
  const code = page.indexOf("<OtpCodeField value={code}");
  assert.ok(remember > 0 && code > 0 && remember < code, "checkbox renders first");
  assert.match(page, /onChange=\{\(e\) => setRemember\(e\.target\.checked\)\}\s+disabled=\{busy\}/);
});
