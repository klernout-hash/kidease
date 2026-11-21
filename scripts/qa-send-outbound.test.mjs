import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, beforeEach, test } from "node:test";

// Exercise the real QA sender with fixtures at its database, gate and SMTP
// boundaries. No database, network connection or email is used.
const stateKey = "__kideaseQaSendOutboundFixture";
const sourceRoot = new URL("../src/", import.meta.url);
const prefix = "kidease-qa-outbound-fixture:";
const virtual = {
  db: `export async function getSql() { return globalThis.${stateKey}.sql; }`,
  mailbox: 'export function mailboxAddress() { return "qa@kidease.ca"; }',
  gate: `export async function gateOutboundEmail(input) {
    const state = globalThis.${stateKey};
    state.gateCalls.push(input);
    return state.allowed
      ? {allow:true,to:state.to ?? input.to,subject:state.subject ?? input.subject,testMode:!!state.to}
      : {allow:false,reason:'daily_cap'};
  }`,
  smtp: `export async function sendTitanMail(input) {
    globalThis.${stateKey}.sent.push(input);
    return {ok:true,via:'titan'};
  }`,
};
const mocks = {
  "@/lib/db": "db",
  "@/lib/server/titan-mail": "mailbox",
  "@/lib/server/outbound-gate": "gate",
  "@/lib/server/titan-mail.server": "smtp",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) return { url: `${prefix}${mocks[specifier]}`, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const file = fileURLToPath(new URL(`${specifier.slice(2)}.ts`, sourceRoot));
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    return url.startsWith(prefix)
      ? { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { deliverQaEmail } = await import("../src/lib/server/qa-send-mail.ts");
after(() => {
  hooks.deregister();
  delete globalThis[stateKey];
});
beforeEach(() => {
  const state = { allowed: true, gateCalls: [], sent: [], writes: 0, prior: false };
  state.sql = async (strings) => {
    const query = strings.join("?");
    if (/select status/.test(query)) return state.prior ? [{ status: "sent" }] : [];
    state.writes++;
    return [];
  };
  globalThis[stateKey] = state;
});
const input = {
  feature: "ADM-11",
  recipient: "parent@example.ca",
  subject: "After your tour",
  text: "Ask for a spot.",
  html: '<a class="ke-btn" href="https://www.kidease.ca/daycare/maple">Ask for a spot</a>',
  occurredAt: "2026-11-17T15:00:00.000Z",
  dedupeKey: "tour-follow:fixture",
  env: { QA_SEND_ALLOWLIST: "parent@example.ca", QA_SEND_SINCE: "2026-11-01T00:00:00.000Z" },
};

test("QA allowlist and dedupe checks run before the outbound gate and SMTP", async () => {
  const state = globalThis[stateKey];
  assert.equal(
    (await deliverQaEmail({ ...input, recipient: "outside@example.ca" })).deliver,
    false,
  );
  assert.equal(state.gateCalls.length, 0);
  state.prior = true;
  assert.equal((await deliverQaEmail(input)).reason, "duplicate");
  assert.equal(state.gateCalls.length, 0);
  assert.equal(state.sent.length, 0);
  assert.equal(state.writes, 0);
});

test("a denied outbound gate sends no QA email and writes no sent dedupe row", async () => {
  const state = globalThis[stateKey];
  state.allowed = false;
  const result = await deliverQaEmail(input);
  assert.equal(result.deliver, false);
  assert.equal(result.reason, "dropped");
  assert.equal(result.via, "none");
  assert.equal(state.gateCalls.length, 1);
  assert.equal(state.sent.length, 0);
  assert.equal(state.writes, 0);
});

test("QA mail preserves branded HTML while honoring outbound test-mode recipient and subject", async () => {
  const state = globalThis[stateKey];
  state.to = "admin@example.ca";
  state.subject = "[Test for parent@example.ca] After your tour";
  const result = await deliverQaEmail(input);
  assert.equal(result.deliver, true);
  assert.equal(result.via, "titan");
  assert.deepEqual(state.gateCalls[0], {
    to: input.recipient,
    subject: input.subject,
    label: "ADM-11",
  });
  assert.deepEqual(state.sent[0], {
    to: state.to,
    subject: state.subject,
    text: input.text,
    html: input.html,
  });
  assert.equal(state.writes, 1);
});
