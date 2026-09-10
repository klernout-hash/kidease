import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listingStatusFromClaim,
  listingStatusLabel,
  isWaitingClaim,
} from "../src/lib/listing-status.ts";
import {
  DESK_LABEL,
  DESK_PATH,
  desksFor,
  deskFromPathname,
  deskQueryValue,
  landingPath,
  loginRoleFromDesk,
  nextStoredRole,
  parseAppRole,
  parseDeskQuery,
  pickLandingDesk,
  primaryDesk,
  headerDesks,
  canSeeAdminDesk,
  canVisitDesk,
  sanitizeStickyDesk,
  showDeskSwitcher,
  resolvePostLoginPath,
  sanitizePostLoginNext,
  isAuthLoopPath,
  postLoginDestKind,
  funnelDestPath,
  accountSearch,
  homeLandPath,
  highlightDesk,
  stickyFromStores,
} from "../src/lib/desks.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripeChargesLive, INTERNAL_LEDGER_LABEL } from "../src/lib/stripe-live.ts";
import { paymentSourceLabel, paymentSourceOfTruth } from "../src/lib/payment-source.ts";
import { parseSentryDsn } from "../src/lib/sentry-shared.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("listing status words are Waiting / Live / Declined only", () => {
  assert.equal(listingStatusLabel("pending"), "Waiting");
  assert.equal(listingStatusLabel("waiting"), "Waiting");
  assert.equal(listingStatusLabel("verified"), "Waiting");
  assert.equal(listingStatusLabel("submitted"), "Waiting");
  assert.equal(listingStatusLabel("approved"), "Live");
  assert.equal(listingStatusLabel("live"), "Live");
  assert.equal(listingStatusLabel("declined"), "Declined");
  assert.equal(listingStatusLabel("rejected"), "Declined");
  assert.equal(listingStatusLabel(null, { live: true }), "Live");
  assert.equal(listingStatusFromClaim("pending"), "waiting");
  assert.equal(isWaitingClaim("pending"), true);
  assert.equal(isWaitingClaim("approved"), false);
});

test("admin role unlocks all four desks; provider also gets parent", () => {
  assert.deepEqual(desksFor({ role: "admin" }), ["admin", "support", "provider", "parent"]);
  assert.deepEqual(desksFor({ role: "support" }), ["support", "parent"]);
  assert.deepEqual(desksFor({ role: "support_lead" }), ["support", "parent"]);
  assert.deepEqual(desksFor({ role: "provider" }), ["provider", "parent"]);
  assert.deepEqual(desksFor({ role: "parent" }), ["parent"]);
  assert.deepEqual(desksFor({ role: "parent", ownsCentre: true }), ["provider", "parent"]);
  assert.equal(primaryDesk(["parent", "provider"]), "provider");
  assert.equal(primaryDesk(["support", "parent"]), "support");
  assert.equal(landingPath(["admin", "support", "provider", "parent"]), "/admin");
  assert.equal(landingPath(["support", "parent"]), "/support");
  assert.equal(landingPath(["provider", "parent"]), "/provider");
  assert.equal(landingPath(["parent"]), "/parent");
  assert.equal(showDeskSwitcher(["parent"]), false);
  assert.equal(showDeskSwitcher(["provider", "parent"]), true);
  assert.equal(showDeskSwitcher(["admin", "support", "provider", "parent"], "admin"), true);
  assert.equal(showDeskSwitcher(["admin", "parent"], "parent"), false);
  assert.equal(showDeskSwitcher(["admin", "parent", "provider"], "parent"), true);
  assert.deepEqual(headerDesks(["admin", "parent", "provider"], "parent"), ["parent", "provider"]);
  assert.deepEqual(headerDesks(["admin", "support", "provider", "parent"], "admin"), [
    "admin",
    "parent",
    "provider",
  ]);
  assert.deepEqual(headerDesks(["admin", "parent", "provider"], "parent"), ["parent", "provider"]);
  assert.deepEqual(headerDesks(["provider", "parent"], "provider"), ["provider", "parent"]);
  assert.deepEqual(headerDesks(["support", "parent"], "support"), ["support", "parent"]);
  assert.equal(headerDesks(desksFor({ role: "parent" }), "parent").includes("admin"), false);
  assert.equal(headerDesks(desksFor({ role: "provider" }), "provider").includes("admin"), false);
  assert.equal(headerDesks(desksFor({ role: "parent", ownsCentre: true }), "parent").includes("admin"), false);
  assert.equal(canSeeAdminDesk("parent"), false);
  assert.equal(canSeeAdminDesk("provider"), false);
  assert.equal(canSeeAdminDesk("support"), false);
  assert.equal(canSeeAdminDesk("admin"), true);
  assert.equal(canSeeAdminDesk("admin", "kyle@kidease.ca"), true);
  assert.equal(canSeeAdminDesk("admin", "parent@example.com"), false);
  assert.equal(canSeeAdminDesk("parent", "kyle@kidease.ca"), false);
  assert.equal(headerDesks(["admin", "parent", "provider"], "admin", "parent@example.com").includes("admin"), false);
  assert.deepEqual(headerDesks(["admin", "parent", "provider"], "admin", "kyle@kidease.ca"), [
    "admin",
    "parent",
    "provider",
  ]);
  assert.equal(canVisitDesk(["admin", "parent"], "admin", "admin"), true);
  assert.equal(canVisitDesk(["admin", "parent"], "admin", "parent"), false);
  assert.equal(canVisitDesk(["admin", "parent"], "admin", null), false);
  assert.equal(canVisitDesk(["parent"], "admin", "parent"), false);
  assert.equal(canVisitDesk(["provider", "parent"], "provider", "provider"), true);
  assert.equal(canVisitDesk(["provider", "parent"], "admin", "provider"), false);
  assert.equal(sanitizeStickyDesk("admin", ["parent"], "parent"), null);
  assert.equal(sanitizeStickyDesk("admin", ["admin", "parent"], "parent"), null);
  assert.equal(sanitizeStickyDesk("admin", ["admin", "parent"], "admin"), "admin");
  assert.equal(sanitizeStickyDesk("parent", ["admin", "parent"], "admin"), "parent");
  assert.equal(sanitizeStickyDesk(null, ["admin", "parent"], "admin"), null);
});

test("desk switcher is for any multi-desk session, not admin-only", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const src = readFileSync(join(root, "src/components/desk-switcher.tsx"), "utf8");
  assert.match(src, /showDeskSwitcher/);
  assert.doesNotMatch(src, /session\.role !== "admin"/);
  assert.match(src, /do not call setRole/);
  assert.match(src, /setSticky/);
  assert.match(src, /deskDirector/);
  assert.match(src, /headerDesks/);
});

test("?desk= aliases map to role desks without colliding with provider tabs", () => {
  assert.equal(parseDeskQuery("parent"), "parent");
  assert.equal(parseDeskQuery("director"), "provider");
  assert.equal(parseDeskQuery("centre"), "provider");
  assert.equal(parseDeskQuery("admin"), "admin");
  assert.equal(parseDeskQuery("listings"), null);
  assert.equal(parseDeskQuery("money"), null);
  assert.equal(deskQueryValue("provider"), "director");
  assert.equal(loginRoleFromDesk("provider"), "provider");
  assert.equal(loginRoleFromDesk("admin"), "admin");
  assert.equal(deskFromPathname("/provider"), "provider");
  assert.equal(deskFromPathname("/admin/queue"), "admin");
  assert.equal(pickLandingDesk(["provider", "parent"], "parent"), "parent");
  assert.equal(pickLandingDesk(["parent"], "admin"), "parent");
  assert.equal(DESK_PATH[pickLandingDesk(["admin", "provider", "parent"], "provider")], "/provider");
  assert.equal(DESK_LABEL.provider, "Daycare");
});

test("sticky desk persists across tabs and home landing honors it", () => {
  assert.equal(stickyFromStores("parent", "director"), "parent");
  assert.equal(stickyFromStores(null, "director"), "provider");
  assert.equal(stickyFromStores(null, null), null);
  assert.equal(homeLandPath({ role: "admin" }), "/admin");
  assert.equal(homeLandPath({ role: "admin", sticky: "parent" }), null);
  assert.equal(homeLandPath({ role: "admin", sticky: "provider" }), "/provider");
  assert.equal(homeLandPath({ role: "provider", sticky: "parent" }), null);
  assert.equal(homeLandPath({ role: "parent" }), null);
  assert.equal(highlightDesk("/account", "parent", "provider"), "provider");
  assert.deepEqual(accountSearch("provider"), { tab: "profile", desk: "director" });
  assert.deepEqual(accountSearch("admin"), { tab: "profile", desk: "admin" });
  assert.deepEqual(accountSearch(null), { tab: "profile" });
});

test("post-login dest honors /parent for admin instead of dumping them on Provider", () => {
  const adminDesks = ["admin", "support", "provider", "parent"];
  assert.equal(
    resolvePostLoginPath({ next: "/parent", role: "parent", desks: adminDesks }),
    "/parent",
  );
  assert.equal(
    resolvePostLoginPath({ desk: "parent", role: "parent", desks: adminDesks }),
    "/parent",
  );
  assert.equal(
    resolvePostLoginPath({ role: "parent", desks: adminDesks }),
    "/parent",
  );
  assert.equal(
    resolvePostLoginPath({ role: "provider", desks: adminDesks }),
    "/provider",
  );
  assert.equal(resolvePostLoginPath({ desks: adminDesks }), "/admin");
  assert.equal(resolvePostLoginPath({ next: "/search", desks: ["parent"] }), "/search");
  assert.equal(resolvePostLoginPath({ next: "/login?next=/parent", desks: adminDesks }), "/parent");
  assert.equal(resolvePostLoginPath({ next: "/verify-2fa?next=/provider" }), "/provider");
  assert.equal(resolvePostLoginPath({ next: "/", role: "parent" }), "/parent");
  assert.equal(resolvePostLoginPath({}), "/parent");
  assert.equal(sanitizePostLoginNext("/login"), null);
  assert.equal(sanitizePostLoginNext("//evil.example"), null);
  assert.equal(sanitizePostLoginNext("/login?next=/login"), null);
  assert.equal(sanitizePostLoginNext("/parent?tab=saved"), "/parent?tab=saved");
  assert.equal(isAuthLoopPath("/verify-2fa"), true);
  assert.equal(postLoginDestKind("/parent"), "desk");
  assert.equal(postLoginDestKind("/search"), "public");
  assert.equal(funnelDestPath("/daycare/some-slug?x=1"), "/daycare");
  assert.equal(funnelDestPath("/delete-account"), "/delete-account");
  assert.equal(funnelDestPath("/unsubscribe"), "/unsubscribe");
  assert.equal(canSeeAdminDesk("parent"), false);
});

test("setRole never demotes staff and never elevates parent/provider to admin", () => {
  assert.equal(nextStoredRole("admin", "provider"), "admin");
  assert.equal(nextStoredRole("admin", "parent"), "admin");
  assert.equal(nextStoredRole("support", "provider"), "support");
  assert.equal(nextStoredRole("support_lead", "parent"), "support_lead");
  assert.equal(nextStoredRole("parent", "provider"), "provider");
  assert.equal(nextStoredRole("parent", "admin"), "parent");
  assert.equal(nextStoredRole("provider", "admin"), "provider");
  assert.equal(parseAppRole("ADMIN"), "admin");
  assert.equal(parseAppRole("support_lead"), "support_lead");
});

test("only sk_live_ keys count as Stripe live charges", () => {
  assert.equal(stripeChargesLive(""), false);
  assert.equal(stripeChargesLive("sk_test_abc"), false);
  assert.equal(stripeChargesLive("sk_live_abc"), true);
  assert.equal(INTERNAL_LEDGER_LABEL, "Internal ledger (not charged)");
  assert.equal(paymentSourceOfTruth(false), "internal_ledger");
  assert.equal(paymentSourceOfTruth(true), "stripe");
  assert.equal(paymentSourceLabel(false), INTERNAL_LEDGER_LABEL);
  assert.equal(paymentSourceLabel(true), "Stripe (source of truth)");
  assert.match(src("src/lib/server/roles.ts"), /paymentSourceLabel/);
  assert.match(src("src/lib/payment-source.ts"), /does not change Checkout/);
});

test("Sentry DSN parse is optional and never throws", () => {
  assert.equal(parseSentryDsn("not-a-dsn"), null);
  const parsed = parseSentryDsn("https://abc123@o0.ingest.sentry.io/456");
  assert.equal(parsed?.key, "abc123");
  assert.match(parsed?.store ?? "", /\/api\/456\/store\/$/);
});
