/**
 * Production bills must not follow a self-chosen mailbox into Stripe test mode.
 *
 * These tests fail while that routing is present. They pass once a production
 * invoice can no longer be opened or marked paid with a test-mode session.
 * Stripe is not contacted: the stand-in answers the Checkout Session and
 * PaymentIntent fields documented by Stripe, and a second read of the same
 * session disagrees with the first so a check that fetches again still fails.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = fileURLToPath(new URL("..", import.meta.url));
const stateKey = "__qaEmailStripeSql";
const prefix = "qa-email-stripe:";
const LIVE_SECRET = "sk_live_placeholder";
const TEST_SECRET = "sk_test_placeholder";
const LIVE_PUBLISHABLE = "pk_live_placeholder";
const TEST_PUBLISHABLE = "pk_test_placeholder";
const WEBHOOK_SECRET = "whsec_placeholder";
const WEBHOOK_SECRET_TEST = "whsec_test_placeholder";
const AUTH_SECRET = "placeholder_better_auth_secret_value";
const QA_EMAIL = "kyle+qabillprobe@kidease.ca";
const REVIEWER_EMAIL = "reviewer.parent@kidease.ca";
const ORDINARY_EMAIL = "parent.ordinary@example.com";
const AMOUNT_CENTS = 150000;
const AMOUNT_CAD = 1500;

const virtual = {
  db: `export async function getSql(){ return globalThis.${stateKey}; } export function ensureDbReady(){ return Promise.resolve(); } export const dbSource = "pglite";`,
  start: `
    export function createServerFn() {
      let validate = (value) => value;
      const builder = {
        middleware() { return builder; },
        validator(fn) { validate = fn; return builder; },
        handler(fn) { return ({ context, data }) => fn({ context, data: validate(data) }); },
      };
      return builder;
    }
    export function createMiddleware() {
      return { client() { return this; }, server(run) { return { run }; } };
    }
    export function createServerOnlyFn(fn) { return fn; }
  `,
  startServer: `export function getCookie(){ return null; } export function getRequest(){ return null; }`,
  router: `export function createFileRoute(){ return (opts) => opts; }`,
};

function resolveSource(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find((candidate) => existsSync(candidate)) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start") return { url: `${prefix}start`, shortCircuit: true };
    if (specifier === "@tanstack/react-start/server") return { url: `${prefix}startServer`, shortCircuit: true };
    if (specifier === "@tanstack/react-router") return { url: `${prefix}router`, shortCircuit: true };
    const file = resolveSource(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    if (url.endsWith("/src/lib/db.ts")) return { url: `${prefix}db`, shortCircuit: true };
    return { url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(prefix)) return nextLoad(url, context);
    return { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true };
  },
});

const savedEnv = { ...process.env };
process.env.BETTER_AUTH_SECRET = AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://127.0.0.1:9";
process.env.FEATURE_TAX_RECEIPTS = "1";
process.env.STRIPE_SECRET_KEY = LIVE_SECRET;
process.env.STRIPE_PUBLISHABLE_KEY = LIVE_PUBLISHABLE;
process.env.STRIPE_SECRET_KEY_TEST = TEST_SECRET;
process.env.STRIPE_PUBLISHABLE_KEY_TEST = TEST_PUBLISHABLE;
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_WEBHOOK_SECRET_TEST = WEBHOOK_SECRET_TEST;
process.env.KIDEASE_CONNECT_LIVE = "1";
process.env.KIDEASE_CONNECT_PAYMENTS = "1";
delete process.env.DATABASE_URL;

const networkFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("network disabled in qa email stripe tests");
};

const { betterAuth } = await import("better-auth");
const { emailAndPasswordConfig, emailVerificationConfig } = await import("../src/lib/auth/email-password.ts");
const billing = await import("../src/lib/server/billing.ts");
const connect = await import("../src/lib/server/connect-payments.ts");
const receipts = await import("../src/lib/server/tax-receipts.ts");
const webhook = await import("../src/routes/api/stripe.webhook.ts");
const { setStripeFetchForTests } = await import("../src/lib/server/stripe-checkout.ts");
const { resetStripeEventClaimsForTests } = await import("../src/lib/server/stripe-signature.ts");

const pg = new PGlite();
const sql = toSql(async (text, params) => {
  const result = await pg.query(text, params);
  return result.rows;
});
globalThis[stateKey] = sql;

function toSql(run) {
  const tagged = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  tagged.query = (text, params = []) => run(text, params);
  return tagged;
}

function modeOf(authorization) {
  if (authorization === TEST_SECRET) return "test";
  if (authorization === LIVE_SECRET) return "live";
  return "other";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function missing(message) {
  return json({ error: { message, code: "resource_missing", type: "invalid_request_error" } }, 404);
}

let calls = [];

function installStripe(retrieve) {
  calls = [];
  const gets = new Map();
  setStripeFetchForTests(async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    const headers = init?.headers || {};
    const authorization = String(headers.Authorization || headers.authorization || "").replace(/^Bearer\s+/i, "");
    const mode = modeOf(authorization);
    calls.push({ url, method, mode });
    const path = new URL(url).pathname;
    if (method === "POST" && path === "/v1/customers") {
      return json({ id: "cus_fake_parent", object: "customer", address: { country: "CA" } });
    }
    if (method === "GET" && path.startsWith("/v1/customers/")) {
      return json({
        id: "cus_fake_parent",
        object: "customer",
        address: { country: "CA" },
        invoice_settings: { default_payment_method: null },
      });
    }
    if (method === "POST" && path === "/v1/checkout/sessions") {
      const test = mode === "test";
      const id = test ? "cs_test_fake_open" : "cs_live_fake_open";
      return json({
        id,
        object: "checkout.session",
        url: `https://checkout.stripe.com/c/pay/${id}`,
        payment_intent: test ? "pi_test_fake" : "pi_live_fake",
        livemode: !test,
        payment_status: "unpaid",
        amount_total: AMOUNT_CENTS,
        status: "open",
      });
    }
    if (method === "GET" && path.startsWith("/v1/checkout/sessions/")) {
      const id = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
      const seen = (gets.get(id) || 0) + 1;
      gets.set(id, seen);
      if (retrieve) return retrieve({ id, seen, mode, json, missing });
      const testSession = id.startsWith("cs_test");
      if (testSession && mode !== "test") return missing("No such checkout.session");
      if (!testSession && mode === "test") return missing("No such checkout.session");
      return json({
        id,
        object: "checkout.session",
        payment_status: "unpaid",
        livemode: !testSession,
        amount_total: AMOUNT_CENTS,
        payment_intent: "pi_fake",
        status: "open",
      });
    }
    if (method === "POST" && path === "/v1/invoices") {
      return json({ id: "in_fake_bill", object: "invoice", payment_intent: "pi_fake_bill" });
    }
    if (method === "POST" && path === "/v1/invoiceitems") return json({ id: "ii_fake", object: "invoiceitem" });
    if (method === "POST" && path.endsWith("/finalize")) {
      return json({ id: "in_fake_bill", object: "invoice", payment_intent: "pi_fake_bill" });
    }
    if (method === "GET" && path.startsWith("/v1/payment_intents/")) {
      return json({
        id: path.split("/").pop(),
        object: "payment_intent",
        client_secret: "pi_fake_secret_placeholder",
        livemode: mode === "live",
        amount: AMOUNT_CENTS,
        amount_received: 0,
        status: "requires_payment_method",
      });
    }
    if (method === "GET" && path.startsWith("/v1/payment_methods")) return json({ object: "list", data: [] });
    if (method === "POST" && path === "/v1/setup_intents") {
      return json({ id: "seti_fake", object: "setup_intent", client_secret: "seti_fake_secret_placeholder" });
    }
    return json({ id: "obj_fake", object: "unknown" });
  });
}

function stripeModes(fragment) {
  return calls.filter((call) => call.url.includes(fragment)).map((call) => call.mode);
}

async function signUp(email) {
  const auth = betterAuth({
    secret: AUTH_SECRET,
    baseURL: "http://127.0.0.1:9",
    emailAndPassword: emailAndPasswordConfig,
    emailVerification: emailVerificationConfig,
  });
  try {
    return await auth.api.signUpEmail({
      body: { name: "Probe Parent", email, password: "QaRoute9!probe" },
    });
  } catch {
    return null;
  }
}

async function insertUser(id, email, emailVerified) {
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, $4)
     on conflict (id) do update set email = excluded.email, "emailVerified" = excluded."emailVerified"`,
    [id, "Probe Parent", email, emailVerified],
  );
  await sql.query(
    `insert into profiles (user_id, role, is_test) values ($1, 'parent', 0)
     on conflict (user_id) do update set is_test = 0`,
    [id],
  );
}

let billSeq = 0;

async function sentBill({ parentId, daycareId, childId }) {
  billSeq += 1;
  const bookingId = `bk-${billSeq}`;
  await sql.query(
    `insert into bookings (id, user_id, daycare_id, child_id, status, monthly_amount)
     values ($1, $2, $3, $4, 'accepted', $5) on conflict (id) do nothing`,
    [bookingId, parentId, daycareId, childId, AMOUNT_CAD],
  );
  const draft = await billing.createBill({
    context: { userId: "user-owner" },
    data: {
      daycareId,
      parentUserId: parentId,
      childId,
      bookingId,
      amountCad: AMOUNT_CAD,
      period: "2026-11",
    },
  });
  const sent = await billing.sendBill({ context: { userId: "user-owner" }, data: draft.id });
  assert.equal(sent.status, "sent");
  const [row] = await sql.query(`select amount_cents from invoices where id = $1`, [draft.id]);
  assert.equal(Number(row.amount_cents), AMOUNT_CENTS);
  return sent;
}

async function billStatus(id) {
  const [row] = await sql.query(`select status from invoices where id = $1`, [id]);
  return row?.status ?? null;
}

function signWebhook(raw, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function postWebhook(event, secret) {
  const raw = JSON.stringify(event);
  const request = new Request("https://kidease.ca/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signWebhook(raw, secret), "content-type": "application/json" },
    body: raw,
  });
  return webhook.Route.server.handlers.POST({ request });
}

before(async () => {
  await pg.exec(`
    create table "user" (
      id text primary key,
      name text,
      email text,
      "emailVerified" boolean not null default false,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    );
    create table profiles (
      user_id text primary key,
      role text,
      is_test int not null default 0,
      stripe_customer_id text,
      locale text,
      display_name text,
      phone text,
      city text,
      created_at timestamptz
    );
    create table daycares (
      id text primary key,
      name text not null,
      slug text,
      visibility text not null default 'public',
      is_test int not null default 0,
      is_demo int not null default 0,
      province text,
      address text,
      city text,
      postal_code text,
      license_number text
    );
    create table children (
      id text primary key,
      user_id text,
      name text,
      birthdate text
    );
    create table bookings (
      id text primary key,
      user_id text,
      daycare_id text,
      child_id text,
      status text,
      monthly_amount int
    );
    create table invoices (
      id text primary key,
      number text unique not null,
      booking_id text,
      parent_user_id text not null,
      daycare_id text not null,
      child_id text,
      period text not null,
      status text not null default 'draft',
      currency text not null default 'cad',
      subtotal int not null default 0,
      platform_fee int not null default 0,
      total int not null default 0,
      due_at date,
      paid_at timestamptz,
      issued_by text not null default 'provider',
      memo text,
      created_at timestamptz not null default now(),
      created_by text,
      amount_cents int,
      platform_fee_cents int,
      net_cents int,
      stripe_checkout_session_id text,
      stripe_payment_intent_id text,
      stripe_charge_id text,
      receipt_url text,
      sent_at timestamptz,
      updated_at timestamptz not null default now(),
      stripe_invoice_id text,
      payment_state text,
      last_error_code text,
      failed_at timestamptz,
      processing_at timestamptz,
      overdue_at timestamptz,
      refunded_cents int,
      refund_state text,
      refunded_at timestamptz,
      refund_method_label text
    );
    create table stripe_accounts (
      daycare_id text primary key,
      stripe_account_id text,
      charges_enabled int not null default 0,
      payouts_enabled int not null default 0,
      details_submitted int not null default 0
    );
    create table provider_daycares (user_id text, daycare_id text);
    create table centre_members (
      user_id text,
      daycare_id text,
      status text,
      role text,
      permission_preset text,
      permissions jsonb
    );
    create table conversations (
      id text primary key,
      user_id text,
      daycare_id text,
      last_at timestamptz
    );
    create table messages (
      id text primary key,
      conversation_id text,
      sender text,
      body text,
      kind text
    );
    create table payments (
      id text primary key,
      user_id text,
      booking_id text,
      daycare_id text,
      amount int,
      method text,
      status text,
      reference text,
      invoice_id text,
      period text,
      platform_fee int,
      net_amount int,
      stripe_payment_intent text,
      stripe_charge_id text
    );
    create table "account" (
      id text,
      "userId" text,
      "providerId" text,
      password text
    );
    create table coparent_links (
      id text,
      owner_user_id text,
      member_user_id text,
      access text,
      status text,
      invite_token text
    );
    create table attendance (
      daycare_id text,
      parent_user_id text,
      child_name text,
      day date,
      status text
    );
  `);
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified") values
      ('user-owner', 'Centre Owner', 'owner.centre@example.com', true)`,
  );
  await sql.query(`insert into profiles (user_id, role, is_test) values ('user-owner', 'provider', 0)`);
  await sql.query(
    `insert into daycares (id, name, slug, visibility, is_test, is_demo, province, address, city, postal_code, license_number)
     values ('dc-elm', 'Elm Daycare', 'elm-street', 'public', 0, 0, 'MB', '1 Elm St', 'Winnipeg', 'R3C0A1', 'LIC-ELM')`,
  );
  await sql.query(
    `insert into daycares (id, name, slug, visibility, is_test, is_demo, province, address, city, postal_code, license_number)
     values ('dc-sample', 'Sample Daycare', 'sample-centre', 'public', 1, 0, 'MB', '2 Sample St', 'Winnipeg', 'R3C0A2', 'LIC-SAMPLE')`,
  );
  await sql.query(
    `insert into provider_daycares (user_id, daycare_id) values ('user-owner', 'dc-elm'), ('user-owner', 'dc-sample')`,
  );

  const qa = await signUp(QA_EMAIL);
  const reviewer = await signUp(REVIEWER_EMAIL);
  const qaEmail = qa?.user?.email || QA_EMAIL;
  const qaVerified = qa?.user?.emailVerified === true;
  assert.equal(qaEmail, QA_EMAIL);
  assert.equal(qaVerified, false);
  assert.equal(Boolean(qa?.token), true);
  assert.equal(reviewer?.user?.emailVerified === true, false);
  await insertUser("user-qa", qaEmail, false);
  await insertUser("user-reviewer", reviewer?.user?.email || REVIEWER_EMAIL, false);
  await insertUser("user-ordinary", ORDINARY_EMAIL, true);
  for (const [id, name] of [
    ["child-qa", "Ada"],
    ["child-reviewer", "Bea"],
    ["child-ordinary", "Cam"],
  ]) {
    const parentId = id.replace("child", "user");
    await sql.query(`insert into children (id, user_id, name, birthdate) values ($1, $2, $3, '2021-04-04')`, [
      id,
      parentId,
      name,
    ]);
  }
});

after(async () => {
  setStripeFetchForTests(null);
  globalThis.fetch = networkFetch;
  hooks.deregister();
  delete globalThis[stateKey];
  await pg.close();
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

test("an unverified kyle+qa mailbox cannot open a test-mode checkout for a public centre bill", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  installStripe();
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  const result = await billing.createBillCheckout({
    context: { userId: "user-qa" },
    data: { billId: bill.id },
  });
  assert.equal(result.alreadyPaid, false);
  assert.equal(stripeModes("/v1/checkout/sessions").includes("test"), false);
  assert.deepEqual(stripeModes("/v1/checkout/sessions"), ["live"]);
  assert.equal(stripeModes("/v1/customers").includes("test"), false);
});

test("the same mailbox cannot skip the live-payments switch when it is off", async () => {
  delete process.env.KIDEASE_CONNECT_LIVE;
  installStripe();
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  await assert.rejects(() =>
    billing.createBillCheckout({ context: { userId: "user-qa" }, data: { billId: bill.id } }),
  );
  assert.equal(calls.some((call) => call.mode === "test"), false);
  process.env.KIDEASE_CONNECT_LIVE = "1";
});

test("an unverified address in the QA mailbox list cannot open a test-mode checkout", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  installStripe();
  const bill = await sentBill({ parentId: "user-reviewer", daycareId: "dc-elm", childId: "child-reviewer" });
  await billing.createBillCheckout({
    context: { userId: "user-reviewer" },
    data: { billId: bill.id },
  });
  assert.equal(stripeModes("/v1/checkout/sessions").includes("test"), false);
  assert.deepEqual(stripeModes("/v1/checkout/sessions"), ["live"]);
});

test("opening the bill does not mark it paid from a test-mode Checkout Session", async () => {
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  await sql.query(`update invoices set stripe_checkout_session_id = 'cs_test_paid_bill' where id = $1`, [bill.id]);
  installStripe(({ id, seen, mode, json: respond, missing: gone }) => {
    if (mode !== "test") return gone("No such checkout.session");
    if (seen === 1) {
      return respond({
        id,
        object: "checkout.session",
        payment_status: "paid",
        livemode: false,
        amount_total: AMOUNT_CENTS,
        payment_intent: "pi_test_paid",
        status: "complete",
      });
    }
    return respond({
      id,
      object: "checkout.session",
      payment_status: "paid",
      livemode: true,
      amount_total: AMOUNT_CENTS,
      payment_intent: "pi_test_paid",
      status: "complete",
    });
  });
  const viewed = await billing.getBill({ context: { userId: "user-qa" }, data: bill.id });
  const desk = await receipts.listTaxReceipts({ context: { userId: "user-qa" }, data: { desk: "parent" } });
  assert.equal(desk.enabled, true);
  assert.equal(viewed.bill.status, "sent");
  assert.equal(await billStatus(bill.id), "sent");
  assert.equal(
    desk.groups.some((group) => group.parentUserId === "user-qa" && group.amountCents === AMOUNT_CENTS),
    false,
  );
});

test("a Checkout Session whose amount_total is not the bill amount does not mark it paid", async () => {
  const bill = await sentBill({ parentId: "user-ordinary", daycareId: "dc-elm", childId: "child-ordinary" });
  await sql.query(`update invoices set stripe_checkout_session_id = 'cs_live_short_bill' where id = $1`, [bill.id]);
  installStripe(({ id, seen, mode, json: respond, missing: gone }) => {
    if (mode !== "live") return gone("No such checkout.session");
    if (seen === 1) {
      return respond({
        id,
        object: "checkout.session",
        payment_status: "paid",
        livemode: true,
        amount_total: 100,
        payment_intent: "pi_live_short",
        status: "complete",
      });
    }
    return respond({
      id,
      object: "checkout.session",
      payment_status: "paid",
      livemode: true,
      amount_total: AMOUNT_CENTS,
      payment_intent: "pi_live_short",
      status: "complete",
    });
  });
  const viewed = await billing.getBill({ context: { userId: "user-ordinary" }, data: bill.id });
  assert.equal(viewed.bill.status, "sent");
  assert.equal(await billStatus(bill.id), "sent");
});

test("a test-mode checkout.session.completed webhook does not mark a production invoice paid", async () => {
  resetStripeEventClaimsForTests();
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  const event = {
    id: "evt_fake_checkout_test",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_webhook_bill",
        object: "checkout.session",
        livemode: false,
        payment_status: "paid",
        amount_total: AMOUNT_CENTS,
        currency: "cad",
        status: "complete",
        client_reference_id: bill.id,
        payment_intent: "pi_test_webhook",
        metadata: { bill_id: bill.id, kidease: "bill" },
      },
    },
  };
  const response = await postWebhook(event, WEBHOOK_SECRET_TEST);
  assert.equal(response.status, 200);
  assert.equal(await billStatus(bill.id), "sent");
});

test("a test-mode payment_intent.succeeded webhook does not mark a production invoice paid", async () => {
  resetStripeEventClaimsForTests();
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  const event = {
    id: "evt_fake_pi_test",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: false,
    data: {
      object: {
        id: "pi_test_webhook",
        object: "payment_intent",
        livemode: false,
        amount: AMOUNT_CENTS,
        amount_received: AMOUNT_CENTS,
        currency: "cad",
        status: "succeeded",
        metadata: { bill_id: bill.id, kidease: "bill" },
      },
    },
  };
  const response = await postWebhook(event, WEBHOOK_SECRET_TEST);
  assert.equal(response.status, 200);
  assert.equal(await billStatus(bill.id), "sent");
});

test("a live webhook whose amount_received is not the bill amount does not mark it paid", async () => {
  resetStripeEventClaimsForTests();
  const bill = await sentBill({ parentId: "user-ordinary", daycareId: "dc-elm", childId: "child-ordinary" });
  const event = {
    id: "evt_fake_pi_short",
    object: "event",
    type: "payment_intent.succeeded",
    livemode: true,
    data: {
      object: {
        id: "pi_live_short",
        object: "payment_intent",
        livemode: true,
        amount: 100,
        amount_received: 100,
        currency: "cad",
        status: "succeeded",
        metadata: { bill_id: bill.id, kidease: "bill" },
      },
    },
  };
  const response = await postWebhook(event, WEBHOOK_SECRET);
  assert.equal(response.status, 200);
  assert.equal(await billStatus(bill.id), "sent");
});

test("sending a bill at a connected centre does not create the Stripe invoice with the test secret", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  process.env.KIDEASE_CONNECT_PAYMENTS = "1";
  await sql.query(
    `insert into stripe_accounts (daycare_id, stripe_account_id, charges_enabled)
     values ('dc-elm', 'acct_fake_elm', 1)
     on conflict (daycare_id) do update set stripe_account_id = 'acct_fake_elm', charges_enabled = 1`,
  );
  installStripe();
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  assert.equal(calls.some((call) => call.mode === "test"), false);
  assert.equal(await billStatus(bill.id), "sent");
  await sql.query(`delete from stripe_accounts where daycare_id = 'dc-elm'`);
});

test("paying a connected bill with a saved card does not use the test secret", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  process.env.KIDEASE_CONNECT_PAYMENTS = "1";
  await sql.query(
    `insert into stripe_accounts (daycare_id, stripe_account_id, charges_enabled)
     values ('dc-elm', 'acct_fake_elm', 1)
     on conflict (daycare_id) do update set stripe_account_id = 'acct_fake_elm', charges_enabled = 1`,
  );
  installStripe();
  const bill = await sentBill({ parentId: "user-qa", daycareId: "dc-elm", childId: "child-qa" });
  calls = [];
  await connect.startManualPay({
    context: { userId: "user-qa" },
    data: { billId: bill.id, paymentMethodId: "pm_fake_card" },
  });
  assert.equal(calls.length > 0, true);
  assert.equal(calls.some((call) => call.mode === "test"), false);
  await sql.query(`delete from stripe_accounts where daycare_id = 'dc-elm'`);
});

test("a saved-card setup for that parent does not use the test secret", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  process.env.KIDEASE_CONNECT_PAYMENTS = "1";
  installStripe();
  const result = await connect.createWalletSetup({ context: { userId: "user-qa" } });
  assert.equal(calls.some((call) => call.mode === "test"), false);
  if (result.ok) assert.equal(stripeModes("/v1/setup_intents").includes("test"), false);
});

test("an ordinary parent at a public centre checks out with the live secret", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  installStripe();
  const bill = await sentBill({ parentId: "user-ordinary", daycareId: "dc-elm", childId: "child-ordinary" });
  await billing.createBillCheckout({ context: { userId: "user-ordinary" }, data: { billId: bill.id } });
  assert.deepEqual(stripeModes("/v1/checkout/sessions"), ["live"]);
});

test("a server-marked test centre still checks out with the test secret", async () => {
  process.env.KIDEASE_CONNECT_LIVE = "1";
  installStripe();
  const bill = await sentBill({ parentId: "user-ordinary", daycareId: "dc-sample", childId: "child-ordinary" });
  await billing.createBillCheckout({ context: { userId: "user-ordinary" }, data: { billId: bill.id } });
  assert.deepEqual(stripeModes("/v1/checkout/sessions"), ["test"]);
});

test("a live Checkout Session paid for the bill amount marks that bill paid", async () => {
  const bill = await sentBill({ parentId: "user-ordinary", daycareId: "dc-elm", childId: "child-ordinary" });
  await sql.query(`update invoices set stripe_checkout_session_id = 'cs_live_paid_bill' where id = $1`, [bill.id]);
  installStripe(({ id, mode, json: respond, missing: gone }) => {
    if (mode !== "live") return gone("No such checkout.session");
    return respond({
      id,
      object: "checkout.session",
      payment_status: "paid",
      livemode: true,
      amount_total: AMOUNT_CENTS,
      payment_intent: "pi_live_paid",
      status: "complete",
    });
  });
  const viewed = await billing.getBill({ context: { userId: "user-ordinary" }, data: bill.id });
  assert.equal(viewed.bill.status, "paid");
});
