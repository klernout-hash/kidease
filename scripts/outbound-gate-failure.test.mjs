import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as controls from "../src/lib/outbound-controls.ts";
import * as core from "../src/lib/outbound-gate-core.ts";
import { sendTransactionalMail } from "../src/lib/transactional-mail.ts";

const quiet = () => {};
const unavailable = { allow: false, reason: "controls_unavailable" };
const testEnv = { OUTBOUND_TEST_EMAIL: "tester@example.ca", OUTBOUND_TEST_PHONE: "+12045550199" };

function failingStore() {
  const failure = new Error("controls store unavailable");
  const calls = { consume: 0, noteBlocked: 0, alerts: 0, errors: [] };
  const store = {
    async loadControls() {
      throw failure;
    },
    async consume() {
      calls.consume += 1;
      return true;
    },
    async noteBlocked() {
      calls.noteBlocked += 1;
      return true;
    },
  };
  const gate = core.createOutboundGate({
    store,
    env: testEnv,
    log: quiet,
    onError: (err) => calls.errors.push(err),
    alertCapHit: async () => {
      calls.alerts += 1;
    },
  });
  return { store, gate, calls, failure };
}

test("unavailable controls block every nonessential channel before usage or cap alerts", async () => {
  const { gate, calls, failure } = failingStore();
  for (const channel of controls.OUTBOUND_CHANNELS) {
    assert.deepEqual(await gate.gate({ channel }), unavailable, channel);
  }
  assert.deepEqual(
    await gate.gateEmail({ to: "parent@example.ca", subject: "Spot open" }),
    unavailable,
  );
  assert.deepEqual(await gate.gateSms({ to: "+12045550100", body: "Spot open" }), unavailable);
  assert.equal(calls.consume, 0);
  assert.equal(calls.noteBlocked, 0);
  assert.equal(calls.alerts, 0);
  assert.deepEqual(calls.errors, Array(6).fill(failure));
});

test("a controls getter reports failure instead of inventing live settings", async () => {
  const { gate, calls, failure } = failingStore();
  await assert.rejects(gate.controls(), (err) => err === failure);
  assert.deepEqual(calls.errors, [failure]);
});

test("recovery reads the saved test recipients and a later read failure blocks again", async () => {
  const { store, gate, failure } = failingStore();
  assert.deepEqual(
    await gate.gateEmail({ to: "parent@example.ca", subject: "Spot open" }),
    unavailable,
  );
  const saved = {
    ...controls.defaultControls(),
    testMode: true,
    testEmail: "saved@example.ca",
    testPhone: "+12045550188",
  };
  store.loadControls = async () => saved;
  assert.deepEqual(await gate.gateEmail({ to: "parent@example.ca", subject: "Spot open" }), {
    allow: true,
    to: "saved@example.ca",
    subject: "[TEST → parent@example.ca] Spot open",
    testMode: true,
  });
  assert.deepEqual(await gate.gateSms({ to: "+12045550100", body: "Spot open" }), {
    allow: true,
    to: "+12045550188",
    body: "[TEST → +12045550100] Spot open",
    testMode: true,
  });
  store.loadControls = async () => {
    throw failure;
  };
  assert.deepEqual(
    await gate.gateEmail({ to: "parent@example.ca", subject: "Spot open" }),
    unavailable,
  );
});

test("essential auth and emergency messages retain their recipient during controls and counter outages", async () => {
  const { store, gate, calls, failure } = failingStore();
  store.consume = async ({ essential }) => {
    assert.equal(essential, true);
    calls.consume += 1;
    throw failure;
  };
  assert.deepEqual(
    await gate.gateEmail({ to: "parent@example.ca", subject: "Reset password", essential: true }),
    {
      allow: true,
      to: "parent@example.ca",
      subject: "Reset password",
      testMode: false,
    },
  );
  assert.deepEqual(await gate.gateSms({ to: "+12045550100", body: "Emergency", essential: true }), {
    allow: true,
    to: "+12045550100",
    body: "Emergency",
    testMode: false,
  });
  assert.equal(calls.consume, 2);
  assert.deepEqual(calls.errors, Array(4).fill(failure));
});

test("a failed counter cannot bypass verified test-mode routing", async () => {
  const { store, gate, failure } = failingStore();
  store.loadControls = async () => ({ ...controls.defaultControls(), testMode: true });
  store.consume = async () => {
    throw failure;
  };
  const mail = await gate.gateEmail({ to: "parent@example.ca", subject: "Spot open" });
  assert.equal(mail.to, testEnv.OUTBOUND_TEST_EMAIL);
  assert.equal(mail.testMode, true);
  const sms = await gate.gateSms({ to: "+12045550100", body: "Spot open" });
  assert.equal(sms.to, testEnv.OUTBOUND_TEST_PHONE);
  assert.equal(sms.testMode, true);
});

test("transactional nonessential mail never calls a provider when controls fail", async () => {
  const { gate } = failingStore();
  let fetched = 0;
  const result = await sendTransactionalMail(
    {
      purpose: "spot_offer",
      to: "parent@example.ca",
      subject: "Spot open",
      text: "Spot open",
      html: "<p>Spot open</p>",
    },
    {
      env: { RESEND_API_KEY: "re_test" },
      gate: gate.gateEmail,
      fetch: async () => {
        fetched += 1;
        return new Response("{}", { status: 200 });
      },
      log: quiet,
    },
  );
  assert.equal(result.reason, "outbound_blocked");
  assert.equal(fetched, 0);
});

// Run the real server store with SQL, time and registration injected. No DB or sender is imported.
function serverGateFixture() {
  const state = { now: 0, reads: 0, rows: [], failure: null, errors: [] };
  const sql = async (strings) => {
    if (state.failure) throw state.failure;
    if (strings.join("").includes("select key, value from outbound_controls")) {
      state.reads += 1;
      return state.rows;
    }
    return [{ used: 1 }];
  };
  const imports = {
    "@/lib/db": { getSql: async () => sql },
    "@/lib/admin-email": { KIDEASE_OPERATOR_EMAIL: "operator@example.ca" },
    "@/lib/flags": { registerFlagKillLoader: quiet },
    "@/lib/observe": { reportError: (err) => state.errors.push(err) },
    "@/lib/outbound-controls": controls,
    "@/lib/outbound-gate-core": {
      ...core,
      registerOutboundGates: quiet,
      createOutboundGate: (deps) => core.createOutboundGate({ ...deps, env: testEnv, log: quiet }),
    },
  };
  const source = readFileSync(
    new URL("../src/lib/server/outbound-gate.ts", import.meta.url),
    "utf8",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(javascript, {
    exports,
    Date: { now: () => state.now },
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), `unexpected server dependency: ${name}`);
      return imports[name];
    },
  });
  return { state, server: exports };
}

test("the SQL gate blocks cold read failures and media returns a retryable explanation", async () => {
  const { state, server } = serverGateFixture();
  state.failure = new Error("SQL unavailable");
  assert.deepEqual(
    await server.gateOutboundEmail({ to: "parent@example.ca", subject: "Spot open" }),
    unavailable,
  );
  const media = await server.gateMediaSession("video");
  assert.equal(media.ok, false);
  assert.equal(media.error, core.blockedMessage("controls_unavailable"));
  assert.match(media.error, /try again/i);
});

test("an expired live cache cannot authorize sends after a failed refresh and recovers into test mode", async () => {
  const { state, server } = serverGateFixture();
  const input = { to: "parent@example.ca", subject: "Spot open" };
  assert.equal((await server.gateOutboundEmail(input)).to, input.to);
  state.now = 14_999;
  assert.equal((await server.gateOutboundEmail(input)).to, input.to);
  assert.equal(state.reads, 1, "the existing 15-second cache remains intact");
  state.now = 15_000;
  state.failure = new Error("refresh unavailable");
  assert.deepEqual(await server.gateOutboundEmail(input), unavailable);
  state.failure = null;
  state.rows = [
    { key: "test_mode", value: "1" },
    { key: "test_email", value: "saved@example.ca" },
  ];
  const recovered = await server.gateOutboundEmail(input);
  assert.equal(recovered.to, "saved@example.ca");
  assert.equal(recovered.testMode, true);
  assert.equal(state.reads, 2);
  state.now = 30_000;
  state.failure = new Error("another refresh unavailable");
  assert.deepEqual(await server.gateOutboundEmail(input), unavailable);
});
