/**
 * Spec for parent Stripe invoices linked by customer email.
 *
 * An email/password signup is usable before the mailbox is confirmed.
 * A Stripe invoice with no parent id and no bill id must not attach to that
 * account. These tests fail while that unverified match still links the
 * invoice, and they pass once only a verified mailbox can be linked.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import { betterAuth } from "better-auth";
import { emailAndPasswordConfig, emailVerificationConfig } from "../src/lib/auth/email-password.ts";
import { scopeFromLinks } from "../src/lib/coparent.ts";
import { coparentEmailEnabled, coparentLinkEnabled } from "../src/lib/features.ts";
import * as alertPush from "../src/lib/alert-push.ts";
import * as familyTime from "../src/lib/family-time.ts";
import * as invoiceReadModel from "../src/lib/invoice-read-model.ts";
import * as stripeParentInvoice from "../src/lib/stripe-parent-invoice.ts";
import * as centreRoles from "../src/lib/centre-roles.ts";
import * as staffPermissions from "../src/lib/staff-permissions.ts";
import * as stripeSignature from "../src/lib/server/stripe-signature.ts";
import * as paymentState from "../src/lib/payment-state.ts";
import * as stripeNotices from "../src/lib/stripe-notices.ts";
import * as webhookProductEvents from "../src/lib/webhook-product-events.ts";
import { selectStripeWebhookSecrets } from "../src/lib/connect-payments.ts";
import * as invoicePdf from "../src/lib/invoice-pdf.ts";

const WEBHOOK_SECRET = "whsec_placeholder";
const PARENT_EMAIL = "parent.billing@example.com";
const HOSTED = "https://pay.stripe.com/invoice/example";
const PDF = "https://pay.stripe.com/invoice/example/pdf";
const storage = new AsyncLocalStorage();

function signStripe(raw, secret) {
  const stamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret).update(`${stamp}.${raw}`).digest("hex");
  return `t=${stamp},v1=${digest}`;
}

function loadModule(relative, modules) {
  const path = new URL(`../${relative}`, import.meta.url);
  const source = readFileSync(path, "utf8").replace(/import\(/g, "__import(");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path.pathname,
  }).outputText;
  const exports = {};
  const require = (id) => {
    if (!Object.prototype.hasOwnProperty.call(modules, id)) {
      throw new Error(`unmocked import ${id} from ${relative}`);
    }
    return modules[id];
  };
  new Function("require", "exports", "module", "__import", javascript)(
    require,
    exports,
    { exports },
    (id) => Promise.resolve(require(id)),
  );
  return exports;
}

function current() {
  const store = storage.getStore();
  if (!store) throw new Error("invoice test has no database context");
  return store;
}

function verifiedPredicate(statement, params) {
  if (/"emailVerified"\s*=\s*true/i.test(statement)) return true;
  return params.some((value, index) => value === true && new RegExp(`"emailVerified"\\s*=\\s*\\$${index + 1}(?!\\d)`, "i").test(statement));
}

async function runSql(statement, params) {
  const store = current();
  const normalized = statement.replace(/\s+/g, " ").trim();
  const result = await store.pg.query(statement, params);
  let rows = result.rows;
  const readsUser = /from\s+"user"/i.test(normalized);
  const filtersVerified = verifiedPredicate(normalized, params);
  if (store.mode === "lie" && readsUser && /email/i.test(normalized) && !filtersVerified && /^select/i.test(normalized)) {
    store.armedSplit = true;
  } else if (
    store.mode === "lie" &&
    store.armedSplit &&
    readsUser &&
    /"emailVerified"/i.test(normalized) &&
    !filtersVerified
  ) {
    rows = rows.map((row) => ({ ...row, emailVerified: true }));
  }
  if (store.mode === "swap" && !store.swapped && readsUser && /email/i.test(normalized) && /^select/i.test(normalized)) {
    store.swapped = true;
    await store.pg.query(`update "user" set email = $1 where id = $2`, ["moved-parent@example.com", store.parentId]);
    await store.pg.query(`update "user" set email = $1 where id = $2`, [store.invoiceEmail, store.attackerId]);
  }
  return rows;
}

function sql(parts, ...params) {
  const statement = parts.reduce((out, part, index) => out + (index ? `$${index}` : "") + part, "");
  return runSql(statement, params);
}
sql.query = (statement, params = []) => runSql(statement, params);

async function familyScopeFor(userId) {
  const enabled = coparentLinkEnabled() || coparentEmailEnabled();
  if (enabled) throw new Error("coparent flags are on; this harness has no coparent_links rows");
  return scopeFromLinks(userId, [], false);
}

const centreAccess = loadModule("src/lib/server/centre-access.ts", {
  "@/lib/access-control": { LISTING_NOT_YOURS: "not yours" },
  "@/lib/centre-roles": centreRoles,
  "@/lib/staff-permissions": staffPermissions,
  "@/lib/utils": { nid: () => "local-id" },
  "@/lib/server/roles": { resolveAdminAccess: async () => ({ ok: false }) },
});

const parentInvoices = loadModule("src/lib/server/stripe-parent-invoices.ts", {
  "@tanstack/react-start": {
    createServerFn: () => {
      let validate = (value) => value;
      const api = {
        middleware: () => api,
        validator: (fn) => {
          validate = fn;
          return api;
        },
        handler: (fn) => (input) => fn({ ...input, data: input?.data === undefined ? input?.data : validate(input.data) }),
      };
      return api;
    },
  },
  "@/lib/db": { dbSource: "pglite", getSql: async () => sql },
  "@/lib/auth/middleware": { authMiddleware: Symbol("auth") },
  "@/lib/flags": {
    evaluateFeatureFlag: (key) => key === "FEATURE_SMS",
  },
  "@/lib/transactional-mail": {
    sendTransactionalMail: async (message) => {
      current().mail.push(message);
    },
  },
  "@/lib/server/casl-consent": {
    readConsent: async () => ({ granted: true }),
    isAddressBlocked: async () => false,
  },
  "@/lib/server/sms": {
    sendSms: async (message) => {
      current().sms.push(message);
      return { ok: true };
    },
  },
  "@/lib/server/thread-access": { listCentreOwnerEmails: async () => [] },
  "@/lib/server/centre-access": centreAccess,
  "@/lib/alert-push": alertPush,
  "@/lib/family-time": familyTime,
  "@/lib/stripe-parent-invoice": stripeParentInvoice,
  "@/lib/invoice-read-model": invoiceReadModel,
  "@/lib/server/coparent": { familyScopeFor },
  "@/lib/email-layout": {
    brandedNotice: () => ({ heading: "Invoice", text: "Invoice", locale: "en" }),
    emailLocaleFor: () => "en",
  },
  "@/lib/listing-visibility": { isAdminOnlyListing: () => false },
});

const pdfRoute = loadModule("src/routes/api/invoices.$id.pdf.ts", {
  "@tanstack/react-router": { createFileRoute: () => (config) => config },
  "@/lib/invoice-pdf": invoicePdf,
  "@/lib/server/stripe-parent-invoices": parentInvoices,
  "@/lib/auth/verify.server": {
    requireUserId: async () => {
      const userId = current().sessionUserId;
      if (!userId) throw new Error("Unauthorized");
      return userId;
    },
  },
});

const webhookRoute = loadModule("src/routes/api/stripe.webhook.ts", {
  "@tanstack/react-router": { createFileRoute: () => (config) => config },
  "@/lib/server/stripe-signature": stripeSignature,
  "@/lib/server/security-events": { logSecurityEvent: async () => undefined, requestIp: () => "203.0.113.10" },
  "@/lib/server/billing": {
    applyStripeBillEvent: async () => ({ billId: null }),
    applyStripePaymentStateEvent: async () => ({ billId: null, paymentState: null }),
  },
  "@/lib/server/connect-payments": {
    applyConnectSideEffect: async () => undefined,
    applyMandateEvent: async () => ({ status: null }),
    queueMonthlyFeeTax: async () => undefined,
  },
  "@/lib/server/stripe-lifecycle": {
    applyStripeDisputeEvent: async () => ({ billId: null }),
    applyStripeSubscriptionEvent: async () => ({ userId: null }),
  },
  "@/lib/connect-payments": {
    selectStripeWebhookSecrets: (raw) => selectStripeWebhookSecrets(raw, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET }),
  },
  "@/lib/server/stripe-parent-invoices": parentInvoices,
  "@/lib/payment-state": paymentState,
  "@/lib/webhook-product-events": webhookProductEvents,
  "@/lib/stripe-notices": stripeNotices,
  "@/lib/server/stripe-notices": { applyStripeNoticeEvent: async () => ({ billId: null }) },
  "@/lib/server/product-events": { captureServerProductEvent: async () => undefined },
});

const SCHEMA = `
  create table "user" (
    id text primary key,
    name text not null,
    email text not null unique,
    "emailVerified" boolean not null,
    image text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  );
  create table profiles (
    user_id text primary key,
    locale text,
    locale_chosen boolean,
    time_zone text,
    sms_consent boolean,
    phone text,
    role text
  );
  create table daycares (
    id text primary key,
    name text,
    slug text,
    visibility text,
    is_test int,
    province text,
    address text,
    city text,
    postal_code text,
    show_public_address boolean
  );
  create table stripe_accounts (daycare_id text, stripe_account_id text);
  create table provider_daycares (daycare_id text, user_id text);
  create table centre_members (
    daycare_id text,
    user_id text,
    status text,
    role text,
    permission_preset text,
    permissions text
  );
  create table stripe_parent_invoices (
    stripe_invoice_id text primary key,
    number text not null,
    amount_cents int,
    currency text not null default 'cad',
    status text not null,
    paid_at timestamptz,
    hosted_invoice_url text,
    invoice_pdf text,
    parent_user_id text,
    daycare_id text,
    customer_email text,
    livemode boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table stripe_webhook_events (
    id text primary key,
    type text not null,
    livemode boolean not null default false,
    created_at timestamptz not null default now()
  );
  create table stripe_invoice_notices (
    id text primary key,
    event_id text not null,
    created_at timestamptz not null default now()
  );
  create table stripe_invoice_sms_holds (
    id text primary key,
    event_id text not null,
    user_id text not null,
    body text not null,
    send_after timestamptz not null,
    status text not null default 'held',
    created_at timestamptz not null default now(),
    unique (event_id, user_id)
  );
  insert into daycares (id, name, slug, visibility, is_test, province, address, city, postal_code, show_public_address)
  values ('day_1', 'Maple Room', 'maple-room', 'public', 0, 'MB', '10 Example Street', 'Winnipeg', 'R3C 0A1', true);
  insert into stripe_accounts (daycare_id, stripe_account_id) values ('day_1', 'acct_example');
`;

function stripeInvoice(id, email, emailAt = "customer_email") {
  const object = {
    id,
    object: "invoice",
    number: "KE-204",
    currency: "cad",
    amount_due: 12500,
    amount_paid: 12500,
    total: 12500,
    hosted_invoice_url: HOSTED,
    invoice_pdf: PDF,
    metadata: {},
    on_behalf_of: "acct_example",
  };
  if (emailAt === "customer_email") object.customer_email = email;
  if (emailAt === "customer") object.customer = { email };
  if (emailAt === "customer_details") object.customer_details = { email };
  if (emailAt === "receipt_email") object.receipt_email = email;
  return object;
}

async function insertUser(pg, { id, email, verified, phone }) {
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, $4)`, [
    id,
    "Parent",
    email,
    verified,
  ]);
  await pg.query(`insert into profiles (user_id, sms_consent, phone, locale_chosen) values ($1, true, $2, false)`, [
    id,
    phone,
  ]);
}

async function stored(pg, invoiceId) {
  const result = await pg.query(
    `select parent_user_id, number, amount_cents, status, hosted_invoice_url, invoice_pdf, daycare_id, customer_email
     from stripe_parent_invoices where stripe_invoice_id = $1`,
    [invoiceId],
  );
  return result.rows[0] ?? null;
}

async function smsHolds(pg, userId) {
  const result = await pg.query(`select user_id, body from stripe_invoice_sms_holds where user_id = $1`, [userId]);
  return result.rows;
}

function leaked(invoices) {
  return JSON.stringify(invoices.map((row) => ({
    id: row.id,
    number: row.number,
    amountCents: row.amountCents,
    status: row.status,
    hostedInvoiceUrl: row.hostedInvoiceUrl,
    invoicePdf: row.invoicePdf,
    daycareName: row.daycareName,
    daycareAddress: row.daycareAddress,
  })));
}

async function withDatabase(mode, fn) {
  const pg = new PGlite();
  const store = {
    pg,
    mode,
    swapped: false,
    armedSplit: false,
    parentId: "user_parent",
    attackerId: "user_attacker",
    invoiceEmail: PARENT_EMAIL,
    sessionUserId: null,
    mail: [],
    sms: [],
  };
  try {
    await pg.exec(SCHEMA);
    return await storage.run(store, () => fn(store));
  } finally {
    await pg.close();
  }
}

async function assertAttackerCannotRead(store, userId, invoiceId) {
  const row = await stored(store.pg, invoiceId);
  assert.ok(row, "the invoice is still stored when it cannot be matched to a verified parent");
  assert.equal(row.parent_user_id, null);
  assert.equal(row.number, "KE-204");
  assert.equal(row.amount_cents, 12500);
  assert.equal(row.hosted_invoice_url, HOSTED);
  assert.equal(row.invoice_pdf, PDF);
  assert.equal(row.daycare_id, "day_1");

  const listed = await parentInvoices.listMyStripeInvoices({ context: { userId } });
  assert.deepEqual(listed.invoices.map((invoice) => invoice.id), [], leaked(listed.invoices));
  const detail = await parentInvoices.getMyStripeInvoice({ context: { userId }, data: invoiceId });
  assert.equal(detail.invoice, null);

  store.sessionUserId = userId;
  const response = await pdfRoute.Route.server.handlers.GET({
    request: new Request(`https://kidease.test/api/invoices/${invoiceId}/pdf`),
    params: { id: invoiceId },
  });
  assert.equal(response.status, 401, `pdf status ${response.status} location ${response.headers.get("location")}`);
  assert.deepEqual(store.sms, []);
  assert.deepEqual(await smsHolds(store.pg, userId), []);
  const exported = await store.pg.query(
    `select stripe_invoice_id from stripe_parent_invoices where parent_user_id = $1`,
    [userId],
  );
  assert.deepEqual(exported.rows, []);
}

test("email and password signup opens a session before the mailbox is verified", async () => {
  assert.equal(emailAndPasswordConfig.enabled, true);
  assert.equal(Object.hasOwn(emailAndPasswordConfig, "requireEmailVerification"), false);
  assert.notEqual(emailAndPasswordConfig.autoSignIn, false);
  assert.equal(emailVerificationConfig.sendOnSignUp, true);

  const auth = betterAuth({
    baseURL: "http://127.0.0.1:3000",
    secret: "placeholder-auth-secret-for-this-test-only",
    emailAndPassword: { ...emailAndPasswordConfig, sendResetPassword: async () => undefined },
    emailVerification: {
      sendOnSignUp: emailVerificationConfig.sendOnSignUp,
      autoSignInAfterVerification: emailVerificationConfig.autoSignInAfterVerification,
      sendVerificationEmail: async () => undefined,
    },
  });
  const signedUp = await auth.api.signUpEmail({
    body: { name: "Parent", email: PARENT_EMAIL, password: "placeholder-password" },
  });
  assert.equal(signedUp.user.email, PARENT_EMAIL);
  assert.equal(signedUp.user.emailVerified, false);
  assert.equal(typeof signedUp.token, "string");
  assert.ok(signedUp.token.length > 10);

  const signedIn = await auth.api.signInEmail({
    body: { email: PARENT_EMAIL, password: "placeholder-password" },
  });
  assert.equal(signedIn.user.emailVerified, false);
  assert.equal(typeof signedIn.token, "string");
  assert.ok(signedIn.token.length > 10);
});

test("an unverified account is not linked from any customer email field", async () => {
  await withDatabase("plain", async (store) => {
    await insertUser(store.pg, {
      id: store.attackerId,
      email: ` ${PARENT_EMAIL.toUpperCase()} `,
      verified: false,
      phone: "+12045550100",
    });
    for (const emailAt of ["customer_email", "customer", "customer_details", "receipt_email"]) {
      const invoiceId = `in_${emailAt}`;
      const applied = await parentInvoices.applyParentStripeInvoice({
        eventId: `evt_${emailAt}`,
        type: "invoice.finalized",
        object: stripeInvoice(invoiceId, PARENT_EMAIL, emailAt),
        livemode: false,
      });
      assert.equal(applied.parentUserId, null, emailAt);
      assert.equal(applied.unlinked, "email_not_in_database", emailAt);
      await assertAttackerCannotRead(store, store.attackerId, invoiceId);
    }
  });
});

test("invoice.paid and invoice.payment_failed do not attach an unverified account", async () => {
  await withDatabase("plain", async (store) => {
    await insertUser(store.pg, {
      id: store.attackerId,
      email: PARENT_EMAIL,
      verified: false,
      phone: "+12045550100",
    });
    for (const type of ["invoice.paid", "invoice.payment_failed"]) {
      const invoiceId = `in_${type.replaceAll(".", "_")}`;
      const applied = await parentInvoices.applyParentStripeInvoice({
        eventId: `evt_${invoiceId}`,
        type,
        object: stripeInvoice(invoiceId, PARENT_EMAIL),
        livemode: false,
      });
      assert.equal(applied.parentUserId, null, type);
      await assertAttackerCannotRead(store, store.attackerId, invoiceId);
    }
  });
});

test("a repeated event does not relink a stored invoice to an unverified account", async () => {
  await withDatabase("plain", async (store) => {
    const invoiceId = "in_relink";
    const first = await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_relink",
      type: "invoice.finalized",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    assert.equal(first.parentUserId, null);
    await insertUser(store.pg, {
      id: store.attackerId,
      email: PARENT_EMAIL,
      verified: false,
      phone: "+12045550100",
    });
    const second = await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_relink",
      type: "invoice.finalized",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.parentUserId, null);
    await assertAttackerCannotRead(store, store.attackerId, invoiceId);
  });
});

test("a later paid event does not attach an invoice that arrived before the unverified signup", async () => {
  await withDatabase("plain", async (store) => {
    const invoiceId = "in_later";
    await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_later_open",
      type: "invoice.finalized",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    await insertUser(store.pg, {
      id: store.attackerId,
      email: PARENT_EMAIL,
      verified: false,
      phone: "+12045550100",
    });
    const paid = await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_later_paid",
      type: "invoice.paid",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    assert.equal(paid.parentUserId, null);
    await assertAttackerCannotRead(store, store.attackerId, invoiceId);
  });
});

test("a signed webhook does not link an unverified account, and a verified mailbox still receives the invoice", async () => {
  await withDatabase("plain", async (store) => {
    await insertUser(store.pg, {
      id: store.attackerId,
      email: PARENT_EMAIL,
      verified: false,
      phone: "+12045550100",
    });
    stripeSignature.resetStripeEventClaimsForTests();
    const invoiceId = "in_webhook";
    const raw = JSON.stringify({
      id: "evt_webhook",
      type: "invoice.finalized",
      livemode: false,
      data: { object: stripeInvoice(invoiceId, PARENT_EMAIL) },
    });
    const response = await webhookRoute.Route.server.handlers.POST({
      request: new Request("https://kidease.test/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signStripe(raw, WEBHOOK_SECRET), "content-type": "application/json" },
        body: raw,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.parentUserId, null);
    await assertAttackerCannotRead(store, store.attackerId, invoiceId);

    await store.pg.query(`update "user" set email = $1, "emailVerified" = false where id = $2`, [
      "attacker.other@example.com",
      store.attackerId,
    ]);
    await insertUser(store.pg, {
      id: store.parentId,
      email: PARENT_EMAIL,
      verified: true,
      phone: "+12045550101",
    });
    const paid = await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_webhook_paid",
      type: "invoice.paid",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    assert.equal(paid.parentUserId, store.parentId);
    const listed = await parentInvoices.listMyStripeInvoices({ context: { userId: store.parentId } });
    assert.equal(listed.invoices.length, 1);
    const invoice = listed.invoices[0];
    assert.equal(invoice.id, invoiceId);
    assert.equal(invoice.number, "KE-204");
    assert.equal(invoice.amountCents, 12500);
    assert.equal(invoice.status, "paid");
    assert.equal(invoice.daycareName, "Maple Room");
    assert.match(invoice.daycareAddress, /10 Example Street/);
    assert.match(invoice.daycareAddress, /Winnipeg/);
    assert.equal(invoice.hostedInvoiceUrl, HOSTED);
    assert.equal(invoice.invoicePdf, PDF);
    store.sessionUserId = store.parentId;
    const pdf = await pdfRoute.Route.server.handlers.GET({
      request: new Request(`https://kidease.test/api/invoices/${invoiceId}/pdf`),
      params: { id: invoiceId },
    });
    assert.equal(pdf.status, 302);
    assert.equal(pdf.headers.get("location"), PDF);
    const attackerList = await parentInvoices.listMyStripeInvoices({ context: { userId: store.attackerId } });
    assert.deepEqual(attackerList.invoices, []);
  });
});

test("a follow-up verification read cannot attach the account that is still unverified", async () => {
  await withDatabase("lie", async (store) => {
    await insertUser(store.pg, {
      id: store.attackerId,
      email: PARENT_EMAIL,
      verified: false,
      phone: "+12045550100",
    });
    const invoiceId = "in_split";
    const applied = await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_split",
      type: "invoice.finalized",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    assert.equal(applied.parentUserId, null);
    const row = await stored(store.pg, invoiceId);
    assert.equal(row.parent_user_id, null);
    const still = await store.pg.query(`select "emailVerified" from "user" where id = $1`, [store.attackerId]);
    assert.equal(still.rows[0].emailVerified, false);
  });
});

test("linking again by email cannot move the invoice onto a different account", async () => {
  await withDatabase("swap", async (store) => {
    await insertUser(store.pg, {
      id: store.parentId,
      email: PARENT_EMAIL,
      verified: true,
      phone: "+12045550101",
    });
    await insertUser(store.pg, {
      id: store.attackerId,
      email: "attacker.other@example.com",
      verified: false,
      phone: "+12045550100",
    });
    const invoiceId = "in_swap";
    const applied = await parentInvoices.applyParentStripeInvoice({
      eventId: "evt_swap",
      type: "invoice.finalized",
      object: stripeInvoice(invoiceId, PARENT_EMAIL),
      livemode: false,
    });
    assert.notEqual(applied.parentUserId, store.attackerId);
    const row = await stored(store.pg, invoiceId);
    assert.notEqual(row.parent_user_id, store.attackerId);
    if (applied.parentUserId) assert.equal(applied.parentUserId, store.parentId);
  });
});
