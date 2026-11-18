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
  const state = { now: 0, reads: 0, rows: [], failure: null, errors: [], readControls: null, auditFailure: null };
  const sql = async (strings) => {
    if (state.failure) throw state.failure;
    const query = strings.join("");
    if (query.includes("select key, value from outbound_controls")) {
      state.reads += 1;
      return state.readControls ? state.readControls() : state.rows;
    }
    if (query.includes("insert into outbound_control_audit") && state.auditFailure) throw state.auditFailure;
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const savedTestRows = [
  { key: "test_mode", value: "1" },
  { key: "test_email", value: "saved@example.ca" },
];
const ordinaryMail = { to: "parent@example.ca", subject: "Spot open" };
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("concurrent cold gates share one controls refresh and keep test routing", async () => {
  const { state, server } = serverGateFixture();
  const read = deferred();
  state.readControls = () => read.promise;
  const first = server.gateOutboundEmail(ordinaryMail);
  const second = server.gateOutboundEmail(ordinaryMail);
  await nextTurn();
  read.resolve(savedTestRows);
  const results = await Promise.all([first, second]);
  assert.equal(state.reads, 1, "concurrent gates must share one pending controls read");
  for (const result of results) {
    assert.equal(result.to, "saved@example.ca");
    assert.equal(result.testMode, true);
  }
});

test("an invalidated live read cannot return or replace a newer test-mode snapshot", async () => {
  const { state, server } = serverGateFixture();
  const oldRead = deferred();
  state.readControls = () => state.reads === 1 ? oldRead.promise : savedTestRows;
  const oldGate = server.gateOutboundEmail(ordinaryMail);
  await nextTurn();
  server.clearOutboundControlsCache();
  const newer = await server.gateOutboundEmail(ordinaryMail);
  oldRead.resolve([]);
  const oldResult = await oldGate;
  const after = await server.gateOutboundEmail(ordinaryMail);
  for (const result of [newer, oldResult, after]) {
    assert.equal(result.to, "saved@example.ca", "an older live result must never authorize the real recipient");
    assert.equal(result.testMode, true);
  }
  assert.equal(state.reads, 2, "the superseded waiter can reuse the newer verified snapshot");
});

test("a late failed read cannot clear a newer pending controls refresh", async () => {
  const { state, server } = serverGateFixture();
  const oldRead = deferred();
  const newerRead = deferred();
  state.readControls = () => state.reads === 1 ? oldRead.promise : newerRead.promise;
  const oldGate = server.gateOutboundEmail(ordinaryMail);
  await nextTurn();
  server.clearOutboundControlsCache();
  const newerGate = server.gateOutboundEmail(ordinaryMail);
  await nextTurn();
  oldRead.reject(new Error("older controls read failed"));
  const oldResult = await oldGate;
  const joinedGate = server.gateOutboundEmail(ordinaryMail);
  await nextTurn();
  newerRead.resolve(savedTestRows);
  const results = await Promise.all([newerGate, joinedGate]);
  assert.deepEqual(oldResult, unavailable);
  assert.equal(state.reads, 2, "late failure must preserve the newer in-flight read for joining gates");
  for (const result of results) {
    assert.equal(result.to, "saved@example.ca");
    assert.equal(result.testMode, true);
  }
});

test("saved controls invalidate the live cache even when the audit write fails", async () => {
  const { state, server } = serverGateFixture();
  assert.equal((await server.gateOutboundEmail(ordinaryMail)).to, ordinaryMail.to);
  state.auditFailure = new Error("audit insert failed");
  await assert.rejects(
    server.saveOutboundControl({ key: "test_mode", value: "1", actorId: "synthetic-admin", actorEmail: "admin@example.ca" }),
    (err) => err === state.auditFailure,
  );
  // The controls write succeeded before the separate audit insert failed.
  state.rows = savedTestRows;
  const result = await server.gateOutboundEmail(ordinaryMail);
  assert.equal(result.to, "saved@example.ca");
  assert.equal(result.testMode, true);
  assert.equal(state.reads, 2);
});

test("a delayed controls snapshot cannot restart its expired freshness window", async () => {
  const { state, server } = serverGateFixture();
  const read = deferred();
  state.readControls = () => state.reads === 1 ? read.promise : savedTestRows;
  const gate = server.gateOutboundEmail(ordinaryMail);
  await nextTurn();
  state.now = 15_000;
  read.resolve([]);
  assert.deepEqual(await gate, unavailable, "a read that used its entire TTL must fail closed");
  const fresh = await server.gateOutboundEmail(ordinaryMail);
  assert.equal(fresh.to, "saved@example.ca");
  assert.equal(fresh.testMode, true);
  assert.equal(state.reads, 2);
});
