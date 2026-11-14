import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exercise the actual dispatch, tour effects, recipient policy and alert decisions.
// SQL and transport boundaries are fixtures: no database, mail or HTTP is used.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__kideaseTourAlertIsolation";
const prefix = "kidease-tour-alert-fixture:";
const virtual = {
  db: `export async function getSql() { return globalThis.${stateKey}.sql; }`,
  utils: `export function nid() { return 'fixture-' + (++globalThis.${stateKey}.ids); }`,
  features: `export const subscriptionsEnabled = () => globalThis.${stateKey}.subscriptions;`,
  readiness: `
    export const pushArmed = () => globalThis.${stateKey}.pushOn;
    export const pushSendEnabled = () => globalThis.${stateKey}.pushOn;`,
  pushConfig: `
    export const pushLive = () => globalThis.${stateKey}.nativeLive;
    export const vapidPrivateKey = () => 'fixture-private';
    export const vapidPublicKey = () => 'fixture-public';
    export const vapidSubject = () => 'mailto:fixture@example.invalid';
    export const webPushCredentialsPresent = () => true;`,
  crypto: `
    export const vapidKeysMatch = () => true;
    export const encryptWebPushPayload = () => { throw new Error('Unexpected encryption in read-failure fixture'); };
    export const vapidAuthorization = () => { throw new Error('Unexpected authorization in read-failure fixture'); };`,
  push: `export async function sendPushNotification(input) {
    const s = globalThis.${stateKey}; s.nativeCalls.push(input);
    if (s.nativeThrows) throw new Error('synthetic transport detail');
    if (s.nativeOpaqueFailure) return {ok:false,skipped:true,dryRun:true,error:'opaque'};
    return s.pushOn ? {ok:true,sent:1,failed:s.nativeFailed,skipped:0,tokenCount:1}
      : {ok:false,skipped:true,error:'off'};
  }`,
  web: `export async function sendWebPushToUser(input,options) {
    const s = globalThis.${stateKey}; s.webCalls.push(input);
    if (s.useActualWeb) return s.realWebSend(input,options);
    if (s.webThrows) throw new Error('synthetic transport detail');
    return {sent:s.webOn?1:0,failed:s.webFailed,removed:0,skipped:!s.webOn,reason:s.webReason};
  }`,
  notify: `export async function notifyThreadParty(input) {
    const s = globalThis.${stateKey}; s.mail.push(input);
    if (s.mailThrows) throw new Error('synthetic recipient detail');
    return {status:!input.to?'skipped':s.mailFailed?'failed':/\\[QA\\]/.test(input.daycareName)?'logged':'sent'};
  }`,
  centreAccess: `export const loadCentreRole = async () => null;`,
  roles: `export const resolveAdminAccess = async () => ({ok:false});`,
  intake: `export async function rememberCentreLead(_sql,input) {
    const s = globalThis.${stateKey}; s.intake.push(input);
    if (s.intakeThrows) throw new Error('synthetic intake rejection');
    return {ok:!s.intakeFailed};
  }`,
};
const mockFiles = new Map(
  [
    ["src/lib/db.ts", "db"],
    ["src/lib/utils.ts", "utils"],
    ["src/lib/features.ts", "features"],
    ["src/lib/channel-readiness.ts", "readiness"],
    ["src/lib/push.ts", "pushConfig"],
    ["src/lib/web-push-crypto.ts", "crypto"],
    ["src/lib/server/push.server.ts", "push"],
    ["src/lib/server/web-push-send.ts", "web"],
    ["src/lib/server/notify.ts", "notify"],
    ["src/lib/server/centre-access.ts", "centreAccess"],
    ["src/lib/server/roles.ts", "roles"],
    ["src/lib/server/lead-intake-write.ts", "intake"],
  ].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]),
);
function resolveSource(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:"))
    file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const file = resolveSource(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    return { url: mockFiles.has(url) ? `${prefix}${mockFiles.get(url)}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    return url.startsWith(prefix)
      ? { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { dispatchCustomerAlert, dispatchTourCustomerAlert } =
  await import("../src/lib/server/alert-dispatch.ts");
const { notifyTourParties, syncLeadFromTour } =
  await import("../src/lib/server/tour-hold-notify.ts");
const { alertPushCopy } = await import("../src/lib/alert-push.ts");
// Bypass only the transport mock to test the actual helper's query policy.
const { sendWebPushToUser: actualWebPush } = await import(
  new URL("../src/lib/server/web-push-send.ts?actual-query-fixture", import.meta.url).href
);
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("Network is forbidden in tour alert fixtures");
};
after(() => {
  hooks.deregister();
  delete globalThis[stateKey];
  globalThis.fetch = originalFetch;
});

const daytime = new Date("2026-11-14T17:00:00.000Z");
const input = (updates = {}) => ({
  conversationId: "conversation-a",
  daycareId: "centre-a",
  daycareName: "Fixture Nursery",
  parentUserId: "parent-a",
  parentEmail: "fallback@example.invalid",
  parentName: "Fallback",
  subject: "Tour hold expired: Fixture Nursery",
  preview: "The tour hold expired.",
  now: daytime,
  ...updates,
});
function reset() {
  const s = {
    ids: 0,
    subscriptions: false,
    pushOn: true,
    webOn: true,
    nativeLive: true,
    nativeFailed: 0,
    webFailed: 0,
    webReason: undefined,
    nativeCalls: [],
    webCalls: [],
    mail: [],
    intake: [],
    calls: [],
    drainReads: 0,
    failSql: null,
    prefs: {},
    zones: {},
    locales: { "parent-a": "fr", "owner-a": "en" },
    users: [{ email: "parent@example.invalid", name: "Auth Name" }],
    profiles: [{ display_name: "Display Name" }],
    owners: [
      { id: "owner-a", email: "owner@example.invalid", name: "Owner" },
      { id: "owner-b", email: "OWNER@example.invalid", name: "Duplicate mailbox" },
    ],
    tours: [
      { user_id: "parent-a", daycare_id: "centre-a", child_id: "child-a", child_name: "Child" },
    ],
    leadUpdates: [],
    outbox: [
      {
        id: "unrelated-other",
        user_id: "unrelated-user",
        category: "message",
        locale: "en",
        title: "Unrelated",
        body: "Other",
        href: "/inbox/other",
        critical: 1,
        email_fallback: 0,
        dedupe_key: "other",
        sent_at: null,
      },
      {
        id: "unrelated-same",
        user_id: "parent-a",
        category: "waitlist",
        locale: "en",
        title: "Unrelated same parent",
        body: "Other",
        href: "/inbox/unrelated",
        critical: 1,
        email_fallback: 0,
        dedupe_key: "same-parent-other",
        sent_at: null,
      },
    ],
  };
  async function query(text, values = []) {
    s.calls.push({ text, values });
    if (s.failSql && s.failSql.test(text))
      throw new Error("synthetic SQL detail must stay private");
    if (/create table/i.test(text)) return [];
    if (/select email, name, "emailVerified" from "user"/.test(text)) return s.users;
    if (/select display_name, phone, city from profiles/.test(text)) return s.profiles;
    if (/from provider_daycares p/.test(text)) return s.owners;
    if (/from web_push_subscriptions/.test(text)) return [];
    if (/from notification_prefs/.test(text)) return s.prefs[values[0]] ?? [];
    if (/select time_zone from profiles/.test(text))
      return [{ time_zone: s.zones[values[0]] ?? "UTC" }];
    if (/select locale from profiles/.test(text)) return [{ locale: s.locales[values[0]] ?? "en" }];
    if (/select.*from notification_outbox/s.test(text)) {
      s.drainReads++;
      return s.outbox.filter((row) => !row.sent_at);
    }
    if (/insert into notification_outbox/.test(text)) {
      const [
        id,
        user_id,
        category,
        locale,
        title,
        body,
        href,
        dedupe_key,
        critical,
        email_fallback,
        send_after,
      ] = values;
      if (s.outbox.some((row) => row.user_id === user_id && row.dedupe_key === dedupe_key))
        return [];
      s.outbox.push({
        id,
        user_id,
        category,
        locale,
        title,
        body,
        href,
        dedupe_key,
        critical,
        email_fallback,
        send_after,
        sent_at: null,
      });
      return [{ id }];
    }
    if (/update notification_outbox set sent_at/.test(text)) {
      s.outbox.find((row) => row.id === values[0]).sent_at = "fixture-sent";
      return [];
    }
    if (/from tour_requests where id/.test(text)) return s.tours;
    if (/update lead_requests/.test(text)) {
      s.leadUpdates.push(values);
      return [];
    }
    throw new Error(`Unexpected fixture SQL: ${text}`);
  }
  s.sql = (parts, ...values) =>
    query(
      parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
      values,
    );
  s.sql.query = query;
  globalThis[stateKey] = s;
  return s;
}
const state = () => globalThis[stateKey];
beforeEach(reset);
const tourAlert = (updates = {}) => ({
  userId: "parent-a",
  category: "tour",
  vars: { name: "Fixture Nursery" },
  href: "/inbox/conversation-a",
  dedupeKey: "tour-only",
  emailFallback: false,
  now: daytime,
  ...updates,
});
function assertUnrelatedUnchanged() {
  assert.equal(state().drainReads, 0);
  assert.deepEqual(
    state()
      .outbox.filter((row) => row.id.startsWith("unrelated"))
      .map((row) => row.sent_at),
    [null, null],
  );
  assert.ok(
    state().nativeCalls.every((call) => call.userId === "parent-a" || call.userId === "owner-a"),
  );
  assert.ok(
    state().webCalls.every((call) => call.userId === "parent-a" || call.userId === "owner-a"),
  );
}

test("actual tour fanout delivers only its own parent and deduped owner alerts", async () => {
  const result = await notifyTourParties(state().sql, input());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assertUnrelatedUnchanged();
  assert.deepEqual(
    state().mail.map((mail) => [mail.to, mail.name]),
    [
      ["parent@example.invalid", "Display Name"],
      ["owner@example.invalid", "Owner"],
    ],
  );
  assert.equal(state().outbox.length, 4);
  const rows = state().outbox.slice(2);
  assert.deepEqual(
    rows.map((row) => [row.user_id, row.category, row.email_fallback]),
    [
      ["parent-a", "tour", 0],
      ["owner-a", "enquiry", 0],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.dedupe_key),
    [
      "tour:conversation-a:parent-a:Tour hold expired: Fixture Nursery",
      "tour:conversation-a:owner-a:Tour hold expired: Fixture Nursery",
    ],
  );
  assert.equal(rows[0].title, alertPushCopy("tour", "fr", { name: "Fixture Nursery" }).title);
  assert.equal(rows[1].href, "/inbox/conversation-a?view=centre&detail=1");
  assert.equal(state().nativeCalls[0].url.endsWith("/inbox/conversation-a"), true);
  assert.equal(state().webCalls[1].url, "/inbox/conversation-a?view=centre&detail=1");
});

test("ordinary dispatch retains the existing shared drain behavior", async () => {
  const result = await dispatchCustomerAlert(tourAlert());
  assert.equal(result.status, "delivered");
  assert.equal(state().drainReads, 1);
  assert.deepEqual(
    state()
      .outbox.slice(0, 2)
      .map((row) => row.sent_at),
    ["fixture-sent", "fixture-sent"],
  );
  assert.ok(state().nativeCalls.some((call) => call.userId === "unrelated-user"));
});

test("tour category preferences stay authoritative without draining any queued alerts", async () => {
  state().prefs["parent-a"] = [{ category: "tour", enabled: 0 }];
  const result = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(result.ok, true);
  assert.equal(result.reason, "opt_out");
  assert.equal(state().outbox.length, 2);
  assert.equal(state().nativeCalls.length, 0);
  assertUnrelatedUnchanged();
});

test("tour alerts still wait through quiet hours and retain their dedupe identity", async () => {
  const result = await dispatchTourCustomerAlert(
    tourAlert({ now: new Date("2026-11-14T03:00:00.000Z") }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "held");
  assert.equal(state().outbox[2].send_after.toISOString(), "2026-11-14T08:00:00.000Z");
  assert.equal(state().nativeCalls.length, 0);
  assertUnrelatedUnchanged();
});

test("repeated tour dispatch does not resend its own push or touch other rows", async () => {
  await dispatchTourCustomerAlert(tourAlert());
  const second = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(second.ok, true);
  assert.equal(second.reason, "duplicate");
  assert.equal(state().nativeCalls.length, 1);
  assert.equal(state().webCalls.length, 1);
  assertUnrelatedUnchanged();
});

test("guest recipient and QA mail boundary input are preserved without a guest alert", async () => {
  state().pushOn = false;
  state().nativeLive = false;
  state().webOn = false;
  const result = await notifyTourParties(
    state().sql,
    input({ parentUserId: "guest:fixture", daycareName: "[QA] Nursery" }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.mail, ["logged", "logged"]);
  assert.equal(state().mail[0].to, "fallback@example.invalid");
  assert.equal(state().mail[0].name, "Fallback");
  assert.ok(state().mail.every((mail) => mail.daycareName === "[QA] Nursery"));
  assert.deepEqual(
    state().nativeCalls.map((call) => call.userId),
    ["owner-a"],
  );
  assertUnrelatedUnchanged();
});

test("disabled transports remain an intentional skip rather than a scheduler failure", async () => {
  state().pushOn = false;
  state().nativeLive = false;
  state().webOn = false;
  const result = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(result.ok, true);
  assert.equal(result.pushed, false);
  assert.equal(result.emailed, false);
  assert.deepEqual(result.errors, []);
  assertUnrelatedUnchanged();
});

for (const [pattern, label] of [
  [/from notification_prefs/, "alert_preferences_failed"],
  [/select time_zone from profiles/, "alert_time_zone_failed"],
  [/select locale from profiles/, "alert_locale_failed"],
  [/insert into notification_outbox/, "alert_outbox_insert_failed"],
  [/update notification_outbox set sent_at/, "alert_outbox_completion_failed"],
])
  test(`isolated alert surfaces ${label} without reporting a duplicate or successful phase`, async () => {
    state().failSql = pattern;
    const result = await dispatchTourCustomerAlert(tourAlert());
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(label));
    assert.equal(JSON.stringify(result).includes("synthetic SQL detail"), false);
    assertUnrelatedUnchanged();
  });

test("explicit partial transport failures reach the tour phase result", async () => {
  state().nativeFailed = 1;
  state().webFailed = 1;
  const result = await notifyTourParties(state().sql, input());
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("native_push_failed"));
  assert.ok(result.errors.includes("web_push_failed"));
  assert.equal(state().mail.length, 2);
  assertUnrelatedUnchanged();
});

test("mail failure is visible while the independent owner and alert phases continue", async () => {
  state().mailFailed = true;
  const result = await notifyTourParties(state().sql, input());
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["tour_mail_failed"]);
  assert.equal(state().mail.length, 2);
  assert.equal(state().nativeCalls.length, 2);
  assertUnrelatedUnchanged();
});

test("recipient lookup failures stay visible with existing fallback and independent fanout", async () => {
  state().failSql = /select email, name, "emailVerified"/;
  const result = await notifyTourParties(state().sql, input());
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("tour_parent_lookup_failed"));
  assert.equal(state().mail[0].to, "fallback@example.invalid");
  assert.equal(state().mail.length, 2);
  assertUnrelatedUnchanged();
});

test("owner helper's swallowed query failure is observed by the tour phase", async () => {
  state().failSql = /from provider_daycares p/;
  const result = await notifyTourParties(state().sql, input());
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["tour_owner_lookup_failed"]);
  assert.equal(state().mail.length, 1);
  assertUnrelatedUnchanged();
});

test("expired lead synchronization only changes linked tour lead state", async () => {
  const result = await syncLeadFromTour(state().sql, "tour-a", "expired");
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(state().intake.length, 0);
  assert.equal(state().leadUpdates.length, 1);
  assert.deepEqual(state().leadUpdates[0], ["declined", "tour_request", "tour-a"]);
});

for (const [pattern, label] of [
  [/from tour_requests where id/, "tour_lead_lookup_failed"],
  [/update lead_requests/, "tour_lead_update_failed"],
]) {
  test(`linked lead synchronization reports ${label}`, async () => {
    state().failSql = pattern;
    const result = await syncLeadFromTour(state().sql, "tour-a", "expired");
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(label));
    assert.equal(state().intake.length, 0);
  });
}

test("missing guest mail remains an intentional skip and other recipients continue", async () => {
  const result = await notifyTourParties(
    state().sql,
    input({ parentUserId: "guest:fixture", parentEmail: null }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.mail, ["skipped", "sent"]);
  assertUnrelatedUnchanged();
});

test("a thrown channel failure is reported without stopping the other transport", async () => {
  state().nativeThrows = true;
  const result = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["native_push_failed"]);
  assert.equal(state().webCalls.length, 1);
  assertUnrelatedUnchanged();
});

test("a returned lead intake failure remains visible for legacy non-expiry transitions", async () => {
  state().intakeFailed = true;
  const result = await syncLeadFromTour(state().sql, "tour-a", "accepted");
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["tour_lead_intake_failed"]);
  assert.equal(state().leadUpdates.length, 1);
});

test("a native helper fallback while native delivery is configured is reported as failure", async () => {
  state().nativeOpaqueFailure = true;
  const result = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["native_push_failed"]);
  assertUnrelatedUnchanged();
});

test("web-only readiness does not label intentionally unconfigured native push as failed", async () => {
  state().nativeOpaqueFailure = true;
  state().nativeLive = false;
  const result = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(result.ok, true);
  assert.equal(result.pushed, true);
  assertUnrelatedUnchanged();
});

test("phase outcomes distinguish accepted dispatch from actual transport delivery", async () => {
  state().pushOn = false;
  state().nativeLive = false;
  state().webOn = false;
  const result = await notifyTourParties(state().sql, input());
  assert.equal(result.ok, true);
  assert.ok(result.alerts.every((alert) => alert.pushed === false && alert.emailed === false));
});

test("non-expiry callers retain rejection behavior for an unexpected intake exception", async () => {
  state().intakeThrows = true;
  await assert.rejects(
    syncLeadFromTour(state().sql, "tour-a", "accepted"),
    /synthetic intake rejection/,
  );
});

test("actual Web Push query failure is visible only through strict tour dispatch", async () => {
  state().useActualWeb = true;
  state().realWebSend = actualWebPush;
  state().failSql = /from web_push_subscriptions/;
  const result = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["web_push_failed"]);
  assertUnrelatedUnchanged();
  const legacy = await actualWebPush({
    userId: "parent-a",
    title: "Fixture",
    body: "Fixture",
    url: "/inbox",
  });
  assert.equal(legacy.reason, "no_subscription");
  assert.equal(legacy.failed, 0);
});

test("actual Web Push intentional no-subscription and flag-off skips remain healthy", async () => {
  state().useActualWeb = true;
  state().realWebSend = actualWebPush;
  const noSubscription = await dispatchTourCustomerAlert(tourAlert());
  assert.equal(noSubscription.ok, true);
  state().pushOn = false;
  state().nativeLive = false;
  state().failSql = /from web_push_subscriptions/;
  const off = await dispatchTourCustomerAlert(tourAlert({ dedupeKey: "off-tour" }));
  assert.equal(off.ok, true);
  assert.equal(off.pushed, false);
  assertUnrelatedUnchanged();
});
