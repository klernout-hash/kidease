import assert from "node:assert/strict";
import test from "node:test";
import { footerLinkHrefs } from "../src/lib/site-footer-nav.ts";
import { menuGroupLinks, menuHighlight, roleSwitchTarget, uncoveredFooterHrefs } from "../src/lib/app-menu.ts";
import { earningsThisMonthCents, menuReviewSummary } from "../src/lib/menu-summary.ts";

test("every footer page is reachable from Menu", () => {
  assert.deepEqual(uncoveredFooterHrefs(footerLinkHrefs()), []);
  const shown = menuGroupLinks("resources", { native: false, plansOn: true }).map((link) => link.to);
  assert.ok(shown.includes("/claim"));
  assert.ok(shown.includes("/plans"));
  assert.ok(shown.includes("/get-app"));
  const native = menuGroupLinks("resources", { native: true, plansOn: false }).map((link) => link.to);
  assert.equal(native.includes("/donate"), false);
  assert.equal(native.includes("/plans"), false);
  assert.ok(menuGroupLinks("help", { native: true, plansOn: false }).some((link) => link.to === "/report"));
  assert.ok(menuGroupLinks("legal", { native: false, plansOn: false }).some((link) => link.to === "/privacy"));
  assert.ok(menuGroupLinks("guides", { native: false, plansOn: false }).some((link) => link.to === "/search"));
});

test("the highlighted card follows the open desk and never invents a host card", () => {
  assert.equal(menuHighlight({ role: "guest", ownsCentre: false, currentDesk: null }), "find");
  assert.equal(menuHighlight({ role: "parent", ownsCentre: false, currentDesk: "parent" }), "find");
  assert.equal(menuHighlight({ role: "provider", ownsCentre: true, currentDesk: "provider" }), "create");
  assert.equal(menuHighlight({ role: "provider", ownsCentre: true, currentDesk: "parent" }), "find");
  assert.equal(menuHighlight({ role: "admin", ownsCentre: false, currentDesk: "admin" }), "find");
  assert.equal(menuHighlight({ role: "admin", ownsCentre: true, currentDesk: "admin" }), "create");
});

test("the switch pill only offers the other parent or daycare desk", () => {
  assert.equal(roleSwitchTarget("parent", ["parent"]), null);
  assert.equal(roleSwitchTarget("provider", ["parent", "provider"]), "parent");
  assert.equal(roleSwitchTarget("parent", ["parent", "provider"]), "provider");
  assert.equal(roleSwitchTarget("admin", ["admin", "parent", "provider"]), "parent");
  assert.equal(roleSwitchTarget(null, ["parent", "provider"]), "parent");
});

test("earnings and reviews stay hidden when there is no real data", () => {
  const now = new Date(2026, 9, 15, 12, 0, 0);
  assert.equal(earningsThisMonthCents([], now), null);
  assert.equal(
    earningsThisMonthCents([{ status: "sent", netCents: 5000, period: "2026-10", paidAt: null }], now),
    null,
  );
  assert.equal(
    earningsThisMonthCents([{ status: "paid", netCents: 4200, period: "2026-09", paidAt: "2026-09-30" }], now),
    null,
  );
  assert.equal(
    earningsThisMonthCents([{ status: "paid", netCents: 4200, period: "2026-10", paidAt: "2026-10-02" }], now),
    4200,
  );
  assert.equal(menuReviewSummary([]), null);
  assert.equal(menuReviewSummary([{ ratingX10: 0, reviewCount: 4, slug: "a" }]), null);
  assert.deepEqual(menuReviewSummary([{ ratingX10: 46, reviewCount: 10, slug: "maple" }]), {
    ratingX10: 46,
    reviewCount: 10,
    slug: "maple",
  });
  const mixed = menuReviewSummary([
    { ratingX10: 40, reviewCount: 1, slug: "a" },
    { ratingX10: 50, reviewCount: 1, slug: "b" },
  ]);
  assert.equal(mixed?.ratingX10, 45);
  assert.equal(mixed?.reviewCount, 2);
  assert.equal(mixed?.slug, null);
});
