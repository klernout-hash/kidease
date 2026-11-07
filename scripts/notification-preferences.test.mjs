import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mergeDeviceChoice, preferenceSummary, wantedChannel } from "../src/lib/notification-preferences.ts";
import { decideUnifiedAlert, defaultUnifiedSettings } from "../src/lib/unified-alerts.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function decision(extra = {}) {
  return decideUnifiedAlert({
    typeId: "parent_request_accepted",
    settings: defaultUnifiedSettings("parent"),
    typeEnabled: true,
    flagOn: true,
    live: true,
    pushArmed: true,
    previewOrTest: false,
    blocked: false,
    ...extra,
  });
}

test("a missing channel choice keeps the account default", () => {
  assert.equal(wantedChannel(null, true), true);
  assert.equal(wantedChannel(null, false), false);
  assert.equal(wantedChannel(false, true), false);
  const kept = decision();
  assert.equal(kept.channels.includes("email"), true);
  assert.equal(kept.channels.includes("push"), false);
  const emailOff = decision({ typeEmail: false });
  assert.equal(emailOff.channels.includes("email"), false);
  assert.equal(emailOff.channels.includes("in_app"), true);
  const pushOn = decision({ typePush: true });
  assert.equal(pushOn.channels.includes("push"), true);
});

test("summaries do not call a channel on when it cannot send", () => {
  assert.equal(
    preferenceSummary({
      locale: "en",
      typeOn: true,
      emailWanted: true,
      pushWanted: false,
      emailControlled: true,
      emailCanSend: true,
      pushCanSend: false,
      sending: true,
    }).text,
    "On: In the app and Email",
  );
  const needs = preferenceSummary({
    locale: "en",
    typeOn: true,
    emailWanted: true,
    pushWanted: true,
    emailControlled: true,
    emailCanSend: false,
    pushCanSend: false,
    sending: true,
  });
  assert.equal(needs.state, "needs-setup");
  assert.equal(needs.text.includes("On:"), false);
  const quiet = preferenceSummary({
    locale: "fr",
    typeOn: true,
    emailWanted: true,
    pushWanted: false,
    emailControlled: true,
    emailCanSend: true,
    pushCanSend: false,
    sending: false,
  });
  assert.equal(quiet.state, "unavailable");
  assert.match(quiet.text, /Pas envoyé/);
  const off = preferenceSummary({
    locale: "en",
    typeOn: false,
    emailWanted: true,
    pushWanted: true,
    emailControlled: true,
    emailCanSend: true,
    pushCanSend: true,
    sending: true,
  });
  assert.equal(off.state, "off");
});

test("preferences stay on the signed-in account and do not send", () => {
  const server = read("src/lib/server/unified-alerts.ts");
  const api = read("src/lib/server/unified-alert-api.ts");
  const ui = read("src/components/notification-preferences.tsx");
  assert.match(server, /typeEmail: channelsForType.email/);
  assert.match(server, /where user_id = \$\{userId\}/);
  assert.match(api, /authMiddleware/);
  assert.doesNotMatch(api, /userId: input/);
  assert.doesNotMatch(ui, /sendSms|sendTransactionalMail|web-push/);
  assert.match(ui, /emailVerified === true/);
  assert.match(read("src/lib/notification-preferences.ts"), /These choices do not change who can pick up a child/);
  assert.match(ui, /copy\.pickup/);
  assert.doesNotMatch(read("src/components/airbnb-screens.tsx"), /alertsStatus/);
  assert.doesNotMatch(ui, /localStorage|Preferences\.set/);
  assert.match(server, /channels\.includes\("email"\)/);
  assert.match(server, /channels\.includes\("push"\)/);
  const same = mergeDeviceChoice(true, true);
  assert.equal(same.conflict, false);
  assert.equal(same.value, true);
  const clash = mergeDeviceChoice(false, true);
  assert.equal(clash.conflict, true);
  assert.equal(clash.value, false);
  const missing = mergeDeviceChoice(null, null);
  assert.equal(missing.value, null);
  const deviceOnly = mergeDeviceChoice(null, false);
  assert.equal(deviceOnly.conflict, false);
  assert.equal(deviceOnly.value, false);
});
