import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listingStatusFromClaim,
  listingStatusLabel,
  isWaitingClaim,
} from "../src/lib/listing-status.ts";
import { desksFor, landingPath, nextStoredRole, parseAppRole, primaryDesk, showDeskSwitcher } from "../src/lib/desks.ts";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripeChargesLive, INTERNAL_LEDGER_LABEL } from "../src/lib/stripe-live.ts";
import { parseSentryDsn } from "../src/lib/sentry-shared.ts";

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
  assert.equal(showDeskSwitcher(["admin", "support", "provider", "parent"]), true);
});

test("desk switcher is for any multi-desk session, not admin-only", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const src = readFileSync(join(root, "src/components/desk-switcher.tsx"), "utf8");
  assert.match(src, /showDeskSwitcher/);
  assert.doesNotMatch(src, /session\.role !== "admin"/);
  assert.match(src, /do not call setRole/);
});

function walkTs(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, acc);
    else if (/\.(tsx|ts)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

test("useSessionDesks is defined and imported at every call site", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const hookFile = join(root, "src/components/desk-switcher.tsx");
  const hookSrc = readFileSync(hookFile, "utf8");
  assert.match(hookSrc, /export function useSessionDesks\(/);

  const missing = [];
  for (const file of walkTs(join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    if (!/\buseSessionDesks\s*\(/.test(text)) continue;
    const defines = /export function useSessionDesks\s*\(/.test(text);
    const imported = /import\s*\{[^}]*\buseSessionDesks\b[^}]*\}\s*from\s*["']@\/components\/desk-switcher["']/.test(
      text,
    );
    if (!defines && !imported) missing.push(file.slice(root.length + 1));
  }
  assert.deepEqual(missing, [], `useSessionDesks() used without import: ${missing.join(", ")}`);
});

test("setRole never demotes staff", () => {
  assert.equal(nextStoredRole("admin", "provider"), "admin");
  assert.equal(nextStoredRole("admin", "parent"), "admin");
  assert.equal(nextStoredRole("support", "provider"), "support");
  assert.equal(nextStoredRole("support_lead", "parent"), "support_lead");
  assert.equal(nextStoredRole("parent", "provider"), "provider");
  assert.equal(parseAppRole("ADMIN"), "admin");
  assert.equal(parseAppRole("support_lead"), "support_lead");
});

test("only sk_live_ keys count as Stripe live charges", () => {
  assert.equal(stripeChargesLive(""), false);
  assert.equal(stripeChargesLive("sk_test_abc"), false);
  assert.equal(stripeChargesLive("sk_live_abc"), true);
  assert.equal(INTERNAL_LEDGER_LABEL, "Internal ledger (not charged)");
});

test("Sentry DSN parse is optional and never throws", () => {
  assert.equal(parseSentryDsn("not-a-dsn"), null);
  const parsed = parseSentryDsn("https://abc123@o0.ingest.sentry.io/456");
  assert.equal(parsed?.key, "abc123");
  assert.match(parsed?.store ?? "", /\/api\/456\/store\/$/);
});
