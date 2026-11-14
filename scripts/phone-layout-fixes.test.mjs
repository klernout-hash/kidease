import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  hrefFor,
  labelKeyForLocation,
  recordScreen,
  resetScreenHistory,
  resolveHistoryBack,
} from "../src/lib/screen-history.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("back from profile follows history to Menu, and wallet does not loop", () => {
  resetScreenHistory();
  recordScreen(0, { href: "/menu", labelKey: "navMenu" });
  recordScreen(1, { href: hrefFor("/account", { desk: "director", tab: "profile" }), labelKey: "profile" });
  recordScreen(2, { href: hrefFor("/account", { desk: "director", section: "wallet", tab: "profile" }), labelKey: "walletTitle" });

  const wallet = resolveHistoryBack({
    index: 2,
    currentHref: hrefFor("/account", { desk: "director", section: "wallet", tab: "profile" }),
    fallbackHref: "/account?tab=profile",
    fallbackLabelKey: "profile",
  });
  assert.equal(wallet.via, "history");
  assert.equal(wallet.labelKey, "profile");
  assert.match(wallet.href, /tab=profile/);
  assert.doesNotMatch(wallet.href, /section=wallet/);

  recordScreen(1, { href: hrefFor("/account", { desk: "director", tab: "profile" }), labelKey: "profile" });
  const profile = resolveHistoryBack({
    index: 1,
    currentHref: hrefFor("/account", { desk: "director", tab: "profile" }),
    fallbackHref: "/provider",
    fallbackLabelKey: "daycareDeskTitle",
  });
  assert.equal(profile.via, "history");
  assert.equal(profile.href, "/menu");
  assert.equal(profile.labelKey, "navMenu");
});

test("a cold profile falls back to the parent desk instead of inventing history", () => {
  resetScreenHistory();
  const decision = resolveHistoryBack({
    index: 0,
    currentHref: "/account?tab=profile",
    fallbackHref: "/provider",
    fallbackLabelKey: "daycareDeskTitle",
  });
  assert.equal(decision.via, "fallback");
  assert.equal(decision.href, "/provider");
  assert.equal(decision.labelKey, "daycareDeskTitle");
});

test("the same screen is not treated as a previous screen", () => {
  resetScreenHistory();
  const href = hrefFor("/account", { tab: "profile" });
  recordScreen(0, { href, labelKey: "profile" });
  recordScreen(1, { href, labelKey: "profile" });
  const decision = resolveHistoryBack({
    index: 1,
    currentHref: href,
    fallbackHref: "/menu",
    fallbackLabelKey: "navMenu",
  });
  assert.equal(decision.via, "fallback");
  assert.equal(decision.labelKey, "navMenu");
});

test("screen labels name the place a parent or daycare came from", () => {
  assert.equal(labelKeyForLocation("/menu", {}), "navMenu");
  assert.equal(labelKeyForLocation("/fr/menu", {}), "navMenu");
  assert.equal(labelKeyForLocation("/provider", { desk: "listings" }), "daycareDeskTitle");
  assert.equal(labelKeyForLocation("/parent", { tab: "saved" }), "familyDeskTitle");
  assert.equal(labelKeyForLocation("/account", { tab: "profile", desk: "director" }), "profile");
  assert.equal(labelKeyForLocation("/account", { section: "wallet", tab: "profile" }), "walletTitle");
  assert.equal(labelKeyForLocation("/search", { q: "Seven Oaks" }), "search");
  assert.equal(hrefFor("/account", { tab: "profile", desk: "director" }), "/account?desk=director&tab=profile");
});

test("phone layout source keeps history back, photo frames, and the launcher above the tab bar", () => {
  const account = src("src/routes/account.tsx");
  const css = src("src/styles.css");
  const tabs = src("src/components/app-tab-bar.tsx");
  const menu = src("src/components/app-menu-screen.tsx");
  const vacancy = src("src/components/vacancy-confirm.tsx");
  const legal = src("src/components/legal-doc.tsx");
  const carousel = src("src/components/photo-carousel.tsx");
  assert.match(account, /HistoryBack/);
  assert.match(account, /accountBackDaycare/);
  assert.doesNotMatch(account, /router\.history\.back/);
  assert.doesNotMatch(tabs, /RoleSwitchPill/);
  assert.match(menu, /RoleSwitchPill/);
  assert.match(css, /\.ke-photo-frame/);
  assert.match(css, /object-fit:\s*cover/);
  assert.match(css, /aspect-ratio:\s*4 \/ 3/);
  assert.match(css, /html\[data-channel="app"\] \.ke-help-bot/);
  assert.match(css, /4\.75rem \+ 0\.75rem \+ var\(--ke-safe-bottom/);
  assert.match(css, /\[data-ke="legal-page"\]/);
  assert.match(css, /\.ke-see-all-row/);
  assert.match(css, /\.ke-explore-filter-bar > \[data-chip-carousel\] \{\s*flex: 1 1 0;\s*max-width: 100%;/);
  assert.match(css, /margin-left:\s*calc\(-1 \* max\(16px, env\(safe-area-inset-left/);
  assert.doesNotMatch(css, /clamp\(12px, 3vw, 40px\)/);
  assert.match(legal, /data-ke="legal-page"/);
  assert.match(carousel, /ke-photo-frame/);
  assert.match(vacancy, /flex-col/);
  assert.match(vacancy, /whitespace-normal/);
  assert.match(src("src/components/history-back.tsx"), /history\.back\(\)/);
  assert.match(src("src/components/history-back.tsx"), /history\.replace/);
});
