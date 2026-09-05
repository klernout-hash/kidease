import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  canAccessAdmin,
  canAccessSupport,
  createCaseInput,
  decideSupportRefund,
  DEFAULT_SUPPORT_REFUND_MAX_CENTS,
  REFUND_REHEARSED_COPY,
  refundAmountAllowed,
  refundIdempotencyKey,
  SUPPORT_INBOX_EMAIL,
  stripeDashboardPaymentUrl,
  supportRefundMaxCents,
} from "../src/lib/support.ts";
import { desksFor, parseAppRole } from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("canAccessSupport is admin or support / support_lead only", () => {
  assert.equal(canAccessSupport("admin"), true);
  assert.equal(canAccessSupport("support"), true);
  assert.equal(canAccessSupport("support_lead"), true);
  assert.equal(canAccessSupport("provider"), false);
  assert.equal(canAccessSupport("parent"), false);
  assert.equal(canAccessSupport(""), false);
  assert.equal(canAccessAdmin("support"), false);
  assert.equal(canAccessAdmin("support_lead"), false);
  assert.equal(canAccessAdmin("admin"), true);
});

test("support staff do not get the admin desk", () => {
  assert.deepEqual(desksFor({ role: "support" }), ["support", "parent"]);
  assert.ok(!desksFor({ role: "support" }).includes("admin"));
  assert.ok(desksFor({ role: "admin" }).includes("support"));
  assert.equal(parseAppRole("support_lead"), "support_lead");
});

test("case create validates subject and type", () => {
  const created = createCaseInput({ subject: "Refund for March", type: "billing", priority: "high" });
  assert.equal(created.subject, "Refund for March");
  assert.equal(created.type, "billing");
  assert.equal(created.priority, "high");
  assert.throws(() => createCaseInput({ subject: "ab" }), /3 characters/);
  assert.equal(createCaseInput({ subject: "Hello there", type: "nope" }).type, "other");
});

test("refund no-ops (rehearses) when Stripe is not live", () => {
  const rehearsed = decideSupportRefund({
    stripeLive: false,
    paymentId: "pi_abc",
    amountCents: 2500,
    role: "support",
    maxCents: 10_000,
  });
  assert.equal(rehearsed.path, "rehearse");
  assert.equal(rehearsed.reason, REFUND_REHEARSED_COPY);

  const blockedNoPay = decideSupportRefund({
    stripeLive: true,
    paymentId: "",
    amountCents: 2500,
    role: "admin",
  });
  assert.equal(blockedNoPay.path, "blocked");

  const live = decideSupportRefund({
    stripeLive: true,
    paymentId: "pi_abc",
    amountCents: 2500,
    role: "support",
    maxCents: 10_000,
  });
  assert.equal(live.path, "live");
});

test("agent refund cap; lead and admin unlimited", () => {
  assert.equal(refundAmountAllowed({ role: "support", amountCents: 10_000, maxCents: 10_000 }), true);
  assert.equal(refundAmountAllowed({ role: "support", amountCents: 10_001, maxCents: 10_000 }), false);
  assert.equal(refundAmountAllowed({ role: "support_lead", amountCents: 50_000, maxCents: 10_000 }), true);
  assert.equal(refundAmountAllowed({ role: "admin", amountCents: 50_000, maxCents: 10_000 }), true);
  assert.equal(supportRefundMaxCents({}), DEFAULT_SUPPORT_REFUND_MAX_CENTS);
  assert.equal(supportRefundMaxCents({ SUPPORT_REFUND_MAX_CENTS: "25000" }), 25_000);
  assert.equal(refundIdempotencyKey({ caseId: "sc_1", billId: "bl_1", amountCents: 500 }), "ke-refund-sc_1-bl_1-500");
  assert.match(stripeDashboardPaymentUrl("pi_123", true) ?? "", /dashboard\.stripe\.com\/payments\/pi_123/);
});

test("support server fns gate on requireSupport; admin tools stay requireAdmin", () => {
  const support = readFileSync(join(root, "src/lib/server/support.ts"), "utf8");
  assert.match(support, /requireSupport/);
  assert.match(support, /Refund rehearsed|rehearse/);
  assert.match(support, /createStripeRefund/);
  assert.match(support, /charge\.refunded/);
  assert.doesNotMatch(support, /from ["']@\/lib\/auth\/preview/);
  assert.doesNotMatch(support, /sk_live_/);

  const adminMoney = readFileSync(join(root, "src/lib/server/admin-money.ts"), "utf8");
  assert.match(adminMoney, /requireAdmin/);
  assert.doesNotMatch(adminMoney, /requireSupport/);

  const adminCentres = readFileSync(join(root, "src/lib/server/admin-centres.ts"), "utf8");
  assert.match(adminCentres, /requireAdmin/);

  const adminPage = readFileSync(join(root, "src/routes/admin.tsx"), "utf8");
  assert.match(adminPage, /desks\.includes\("admin"\)/);
  assert.doesNotMatch(adminPage, /desks\.includes\("support"\)/);

  const supportPage = readFileSync(join(root, "src/routes/support.tsx"), "utf8");
  assert.match(supportPage, /desks\.includes\("support"\)/);
  assert.match(supportPage, /noindex/);
});

test("public help moved to /help; /support is the staff desk", () => {
  const help = readFileSync(join(root, "src/routes/help.tsx"), "utf8");
  assert.match(help, /createFileRoute\("\/help"\)/);
  assert.match(help, /kind: "support"/);

  const footer = readFileSync(join(root, "src/components/site-footer.tsx"), "utf8");
  assert.match(footer, /to="\/help"/);
  assert.doesNotMatch(footer, /to="\/support"/);

  const store = readFileSync(join(root, "src/lib/store-listing.ts"), "utf8");
  assert.match(store, /supportPath: "\/help"/);

  const env = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(env, /SUPPORT_REFUND_MAX_CENTS/);
  assert.doesNotMatch(env, /sk_live_[A-Za-z0-9]+/);

  const docs = readFileSync(join(root, "docs/support.md"), "utf8");
  assert.match(docs, /\/support\*/);
  assert.match(docs, /SUPPORT_REFUND_MAX_CENTS/);
  assert.match(docs, /Cloudflare Access/);
  assert.equal(SUPPORT_INBOX_EMAIL, "support@kidease.ca");
  assert.match(docs, /support@kidease\.ca/);
  assert.match(docs, /billing/);
  assert.match(docs, /not the case router/);
  assert.doesNotMatch(docs, /refund@kidease\.ca as the/);
  const desk = readFileSync(join(root, "src/components/support-desk.tsx"), "utf8");
  assert.match(desk, /SUPPORT_INBOX_EMAIL/);
});

test("public Help / contact / legal copy use SUPPORT_INBOX_EMAIL, not kyle@", () => {
  const publicFacing = [
    "src/routes/help.tsx",
    "src/routes/contact.tsx",
    "src/routes/claim.tsx",
    "src/routes/__root.tsx",
    "src/components/site-footer.tsx",
    "src/components/legal-doc.tsx",
    "src/components/listing-contact.tsx",
    "src/lib/copy.ts",
    "src/lib/help-knowledge.ts",
  ];
  for (const rel of publicFacing) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.doesNotMatch(src, /kyle@kidease\.ca/, rel);
    assert.match(src, /SUPPORT_INBOX_EMAIL/, rel);
  }

  const legal = readFileSync(join(root, "src/lib/legal-copy.ts"), "utf8");
  assert.match(legal, /SUPPORT_INBOX_EMAIL/);
  assert.match(legal, /Email \$\{SUPPORT_INBOX_EMAIL\} if a deposit looks wrong/);
  assert.match(legal, /Notify kyle@kidease\.ca of new accounts/);
  assert.match(legal, /operator mail for kyle@kidease\.ca/);

  const docs = readFileSync(join(root, "docs/support.md"), "utf8");
  assert.doesNotMatch(docs, /still offers kyle@kidease\.ca/);

  const notify = readFileSync(join(root, "src/lib/server/notify.ts"), "utf8");
  assert.match(notify, /ADMIN_EMAIL.*kyle@kidease\.ca/);
  assert.match(notify, /mailto:\$\{SUPPORT_INBOX_EMAIL\}/);
  assert.match(notify, /actorConfirmationReplyTo\(SUPPORT_INBOX_EMAIL\)/);
});
