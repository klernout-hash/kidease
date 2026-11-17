import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  CONTROL_KEYS,
  DEFAULT_DAILY_CAPS,
  controlsFromRows,
  defaultControls,
  forcedOffFlags,
  normalizeControlEdit,
  outboundDay,
} from "../src/lib/outbound-controls.ts";
import { createOutboundGate, registerOutboundGates } from "../src/lib/outbound-gate-core.ts";
import { evaluateFeatureFlag, setFlagKillsForTests } from "../src/lib/flags.ts";
import { sendTransactionalMail } from "../src/lib/transactional-mail.ts";

function memoryStore(controls = defaultControls()) {
  const usage = new Map();
  const alerted = new Set();
  return {
    controls,
    usage,
    async loadControls() {
      return this.controls;
    },
    async consume({ day, channel, units, cap, essential }) {
      const k = `${day}:${channel}`;
      const used = usage.get(k) ?? 0;
      if (!essential && used + units > cap) return false;
      usage.set(k, used + units);
      return true;
    },
    async noteBlocked({ day, channel, alert }) {
      if (!alert) return false;
      const k = `${day}:${channel}`;
      if (alerted.has(k)) return false;
      alerted.add(k);
      return true;
    },
  };
}

const quiet = () => {};

test("defaults match the agreed caps and everything starts on, test mode off", () => {
  const c = controlsFromRows([]);
  assert.deepEqual(c.caps, { sms: 200, email: 2000, push: 5000, media: 120 });
  assert.deepEqual(DEFAULT_DAILY_CAPS, c.caps);
  assert.equal(c.testMode, false);
  for (const on of Object.values(c.switches)) assert.equal(on, true);
});

test("stored rows override defaults and bad values fall back", () => {
  const c = controlsFromRows([
    { key: "switch:sms", value: "0" },
    { key: "cap:email", value: "50" },
    { key: "cap:push", value: "-3" },
    { key: "test_mode", value: "1" },
  ]);
  assert.equal(c.switches.sms, false);
  assert.equal(c.caps.email, 50);
  assert.equal(c.caps.push, 5000);
  assert.equal(c.testMode, true);
});

test("admin edits are validated", () => {
  assert.deepEqual(normalizeControlEdit("cap:sms", "150"), { ok: true, value: "150" });
  assert.equal(normalizeControlEdit("cap:sms", "lots").ok, false);
  assert.equal(normalizeControlEdit("cap:fax", "1").ok, false);
  assert.equal(normalizeControlEdit("switch:gov", "off").value, "0");
  assert.equal(normalizeControlEdit("test_phone", "204-555-0100").ok, false);
  assert.equal(normalizeControlEdit("test_phone", "+12045550100").ok, true);
  assert.equal(normalizeControlEdit("test_email", "not-an-email").ok, false);
  assert.equal(normalizeControlEdit("drop table", "1").ok, false);
});

test("days reset at midnight Winnipeg time, not UTC", () => {
  // Winnipeg is 5 or 6 hours behind UTC, so 03:00 UTC is still the day before there.
  assert.equal(outboundDay(new Date("2026-11-17T03:00:00Z")), "2026-11-16");
  assert.equal(outboundDay(new Date("2026-11-17T07:00:00Z")), "2026-11-17");
});

test("a cap stops the channel, alerts once, and essential mail still goes", async () => {
  const store = memoryStore();
  store.controls.caps.sms = 2;
  const alerts = [];
  const g = createOutboundGate({ store, env: {}, log: quiet, alertCapHit: async (a) => alerts.push(a) });
  assert.equal((await g.gate({ channel: "sms" })).allow, true);
  assert.equal((await g.gate({ channel: "sms" })).allow, true);
  const third = await g.gate({ channel: "sms" });
  assert.equal(third.allow, false);
  assert.equal(third.reason, "daily_cap");
  await g.gate({ channel: "sms" });
  assert.equal(alerts.length, 1, "Kyle is alerted once per channel per day");
  assert.equal((await g.gate({ channel: "sms", essential: true })).allow, true, "emergency text still sends");
  assert.equal((await g.gate({ channel: "email" })).allow, true, "other channels are untouched");
});

test("a switch blocks its channel but never essential messages", async () => {
  const store = memoryStore();
  store.controls.switches.email = false;
  const g = createOutboundGate({ store, env: {}, log: quiet });
  assert.equal((await g.gate({ channel: "email" })).reason, "switch_off");
  assert.equal((await g.gate({ channel: "email", essential: true })).allow, true);
  store.controls.switches.paid = false;
  assert.equal((await g.gate({ channel: "media", units: 15 })).reason, "switch_off");
});

test("video and voice minutes count toward the media cap", async () => {
  const store = memoryStore();
  const g = createOutboundGate({ store, env: {}, log: quiet });
  for (let i = 0; i < 8; i++) assert.equal((await g.gate({ channel: "media", units: 15 })).allow, true);
  assert.equal((await g.gate({ channel: "media", units: 15 })).allow, false, "120 minutes = 8 calls of 15");
});

test("test mode reroutes email and SMS and names the real recipient", async () => {
  const store = memoryStore();
  store.controls.testMode = true;
  const g = createOutboundGate({
    store,
    env: { OUTBOUND_TEST_EMAIL: "tester@example.ca", OUTBOUND_TEST_PHONE: "+12045550199" },
    log: quiet,
  });
  const mail = await g.gateEmail({ to: "parent@example.ca", subject: "Spot open" });
  assert.equal(mail.allow, true);
  assert.equal(mail.to, "tester@example.ca");
  assert.match(mail.subject, /parent@example\.ca/);
  const sms = await g.gateSms({ to: "+12045550100", body: "Hi" });
  assert.equal(sms.to, "+12045550199");
  assert.match(sms.body, /\+12045550100/);
  // Admin value wins over env.
  store.controls.testEmail = "admin-set@example.ca";
  assert.equal((await g.gateEmail({ to: "a@b.ca", subject: "x" })).to, "admin-set@example.ca");
});

test("test mode never reroutes sign-in codes, resets or emergency notices", async () => {
  const store = memoryStore();
  store.controls.testMode = true;
  const g = createOutboundGate({ store, env: { OUTBOUND_TEST_EMAIL: "t@example.ca" }, log: quiet });
  const r = await g.gateEmail({ to: "parent@example.ca", subject: "Your code", essential: true });
  assert.equal(r.to, "parent@example.ca");
  assert.equal(r.testMode, false);
  const empty = createOutboundGate({ store, env: {}, log: quiet });
  assert.equal((await empty.gateSms({ to: "+12045550100", body: "Emergency", essential: true })).allow, true);
});

test("test mode falls back to Kyle's operator contacts", async () => {
  const store = memoryStore();
  store.controls.testMode = true;
  const g = createOutboundGate({ store, env: { ADMIN_EMAIL: "ops@example.ca", ADMIN_SMS: "+12045550111" }, log: quiet });
  assert.equal((await g.gateEmail({ to: "p@example.ca", subject: "x" })).to, "ops@example.ca");
  assert.equal((await g.gateSms({ to: "+12045550100", body: "x" })).to, "+12045550111");
});

test("test mode with no test address sends nothing rather than the real person", async () => {
  const store = memoryStore();
  store.controls.testMode = true;
  const g = createOutboundGate({ store, env: {}, log: quiet });
  const r = await g.gateEmail({ to: "parent@example.ca", subject: "x" });
  assert.equal(r.allow, false);
  assert.equal(r.reason, "no_test_recipient");
});

test("a broken counter does not stop mail", async () => {
  const store = memoryStore();
  store.consume = async () => {
    throw new Error("db down");
  };
  const errors = [];
  const g = createOutboundGate({ store, env: {}, log: quiet, onError: (e) => errors.push(e) });
  assert.equal((await g.gate({ channel: "email" })).allow, true);
  assert.equal(errors.length, 1);
});

test("group switches force their flags off and only off", () => {
  const c = defaultControls();
  c.switches.gov = false;
  const off = forcedOffFlags(c);
  assert.ok(off.has("FEATURE_GOV_PORTAL"));
  assert.ok(!off.has("FEATURE_SMS"), "base SMS flag stays so emergency texts can go");
  setFlagKillsForTests(["FEATURE_GOV_PORTAL"]);
  try {
    process.env.FEATURE_GOV_PORTAL = "1";
    assert.equal(evaluateFeatureFlag("FEATURE_GOV_PORTAL"), false);
    setFlagKillsForTests([]);
    assert.equal(evaluateFeatureFlag("FEATURE_GOV_PORTAL"), true);
  } finally {
    delete process.env.FEATURE_GOV_PORTAL;
    setFlagKillsForTests(null);
  }
});

test("transactional mail asks the gate and stops when blocked", async () => {
  let fetched = 0;
  const result = await sendTransactionalMail(
    { purpose: "spot_offer", to: "parent@example.ca", subject: "Spot", text: "t", html: "<p>t</p>" },
    {
      env: { RESEND_API_KEY: "re_test" },
      fetch: async () => {
        fetched += 1;
        return new Response("{}", { status: 200 });
      },
      gate: async () => ({ allow: false, reason: "daily_cap" }),
      log: quiet,
    },
  );
  assert.equal(result.status, "logged");
  assert.equal(result.reason, "outbound_blocked");
  assert.equal(fetched, 0);
});

test("password reset is marked essential for the gate", async () => {
  const seen = [];
  await sendTransactionalMail(
    { purpose: "password_reset", to: "parent@example.ca", subject: "Reset", text: "t", html: "<p>t</p>" },
    {
      env: { RESEND_API_KEY: "re_test" },
      fetch: async () => new Response("{}", { status: 200 }),
      gate: async (input) => {
        seen.push(input);
        return { allow: true, to: input.to, subject: input.subject, testMode: false };
      },
      log: quiet,
    },
  );
  assert.equal(seen[0].essential, true);
});

test("registered gates are read from one place and can be cleared", () => {
  registerOutboundGates(null);
  const core = readFileSync(new URL("../src/lib/outbound-gate-core.ts", import.meta.url), "utf8");
  assert.match(core, /__kideaseOutboundGates__/);
});

test("every direct Resend or Twilio send in server code goes through the gate", () => {
  const dir = new URL("../src/lib/server/", import.meta.url);
  const exempt = new Set(["admin-mail.ts"]); // Kyle's own hand-typed replies.
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts") || exempt.has(name)) continue;
    const src = readFileSync(new URL(name, dir), "utf8");
    if (src.includes('"https://api.resend.com/emails"')) {
      assert.match(src, /gateOutboundEmail\(/, `${name} sends email without the outbound gate`);
    }
  }
  const sms = readFileSync(new URL("sms.ts", dir), "utf8");
  assert.match(sms, /outboundGates\(\)\.sms/);
  const push = readFileSync(new URL("push-send.ts", dir), "utf8");
  assert.match(push, /outboundGates\(\)\.gate/);
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(server, /import "@\/lib\/server\/outbound-gate"/);
});

test("toggle changes write an audit row", () => {
  const src = readFileSync(new URL("../src/lib/server/outbound-gate.ts", import.meta.url), "utf8");
  assert.match(src, /insert into outbound_control_audit/);
  const sql = readFileSync(new URL("../migrations/0210_outbound_controls.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists outbound_control_audit/);
  assert.ok(CONTROL_KEYS.testMode);
});
