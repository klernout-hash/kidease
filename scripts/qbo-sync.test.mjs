import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  QBO_ACCOUNTING_SCOPE,
  QBO_REQUIRED_ENV,
  gstHstForFee,
  qboAuthorizeUrl,
  qboJournal,
  qboJournalBalances,
  qboJournalBody,
  qboMissingEnv,
  qboTokenRequest,
} from "../src/lib/qbo-sync.ts";
import { openQboToken, sealQboToken } from "../src/lib/qbo-seal.ts";

const empty = {
  INTUIT_CLIENT_ID: "",
  INTUIT_CLIENT_SECRET: "",
  INTUIT_REDIRECT_URI: "",
  INTUIT_ENVIRONMENT: "",
  QBO_TOKEN_KEY: "",
};

test("QuickBooks stays disconnected until every Intuit setting exists", () => {
  assert.deepEqual(qboMissingEnv(empty), [...QBO_REQUIRED_ENV]);
  const ready = qboMissingEnv({
    INTUIT_CLIENT_ID: "public-client",
    INTUIT_CLIENT_SECRET: "secret-value",
    INTUIT_REDIRECT_URI: "https://www.kidease.ca/provider?desk=money",
    INTUIT_ENVIRONMENT: "sandbox",
    QBO_TOKEN_KEY: "11".repeat(32),
  });
  assert.deepEqual(ready, []);
});

test("the connect link uses the accounting scope and leaves the secret out", () => {
  const url = new URL(qboAuthorizeUrl({
    clientId: "public-client",
    redirectUri: "https://www.kidease.ca/provider?desk=money",
    state: "id_state1234",
  }));
  assert.equal(url.searchParams.get("scope"), QBO_ACCOUNTING_SCOPE);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_secret"), null);
  const request = qboTokenRequest({
    clientId: "public-client",
    clientSecret: "secret-value",
    code: "auth-code",
    redirectUri: "https://www.kidease.ca/provider?desk=money",
  });
  assert.equal(request.body.includes("client_secret"), false);
  assert.match(request.headers.Authorization, /^Basic /);
});

test("a paid Ontario bill balances and keeps the parent fee exempt", () => {
  const lines = qboJournal({ invoiceCents: 10000, feeCents: 300, province: "ON" });
  assert.equal(qboJournalBalances(lines), true);
  const parent = lines.find((line) => line.account === "parent_fees");
  assert.equal(parent?.tax, "exempt");
  assert.equal(parent?.creditCents, 10000);
  assert.equal(gstHstForFee("ON")?.bps, 1300);
  assert.equal(gstHstForFee("BC")?.tax, "gst");
  assert.equal(gstHstForFee("AB")?.bps, 500);
  const unknown = qboJournal({ invoiceCents: 10000, feeCents: 300, province: "" });
  assert.equal(qboJournalBalances(unknown), true);
  assert.equal(unknown.some((line) => line.account === "gst_itc"), false);
});

test("export waits for the centre's own account numbers", () => {
  const lines = qboJournal({ invoiceCents: 5000, feeCents: 150, province: "BC" });
  const missing = qboJournalBody({ lines, accounts: {}, txnDate: "2026-11-09", docNumber: "KE-1" });
  assert.equal(missing.ok, false);
  const ready = qboJournalBody({
    lines,
    accounts: { parent_fees: "1", stripe_clearing: "2", platform_fee: "3", gst_itc: "4" },
    txnDate: "2026-11-09",
    docNumber: "KE-1",
  });
  assert.equal(ready.ok, true);
});

test("stored QuickBooks tokens round-trip and a bad key returns nothing", () => {
  const env = { QBO_TOKEN_KEY: "11".repeat(32) };
  const sealed = sealQboToken("token-value", env);
  assert.equal(sealed?.startsWith("keq1:"), true);
  assert.equal(openQboToken(sealed, env), "token-value");
  assert.equal(openQboToken(sealed, { QBO_TOKEN_KEY: "" }), null);
  assert.equal(sealed?.includes("token-value"), false);
});

test("the provider desk opens Money when QuickBooks sends the centre back", () => {
  const provider = readFileSync(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
  assert.match(provider, /if \(out\.qboCode && out\.qboState && out\.realmId\) out\.desk = "money"/);
  assert.match(provider, /<QboPanel daycareId=\{deskListings\[0\]\.id\} \/>/);
});

test("QuickBooks source does not print or store a credential", () => {
  const files = ["src/lib/qbo-sync.ts", "src/lib/qbo-seal.ts", "src/lib/server/qbo.ts", "src/components/qbo-panel.tsx"];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(text.includes("sk_live"), false);
    assert.equal(text.includes("BEGIN PRIVATE"), false);
  }
});
