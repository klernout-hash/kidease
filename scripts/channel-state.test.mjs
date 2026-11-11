import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { channelStateLabel, providerChannelState, safeArrivalChannelState } from "../src/lib/channel-state.ts";

test("safe arrival shows email and phone off, and the app note held", () => {
  assert.deepEqual(safeArrivalChannelState(), { email: "off", push: "off", inApp: "held" });
  assert.equal(channelStateLabel("off", "en"), "Off");
  assert.equal(channelStateLabel("held", "fr"), "Retenu");
  assert.equal(providerChannelState({ alertsOn: false, alertsLive: false, pushArmed: false }).push, "off");
  assert.equal(providerChannelState({ alertsOn: true, alertsLive: false, pushArmed: true }).push, "held");
  assert.equal(providerChannelState({ alertsOn: true, alertsLive: true, pushArmed: false }).email, "on");
});

test("the certificate and arrival pages say this in both languages", () => {
  const certs = readFileSync(new URL("../src/components/cert-expiry-panel.tsx", import.meta.url), "utf8");
  const arrival = readFileSync(new URL("../src/components/safe-arrival-panel.tsx", import.meta.url), "utf8");
  const staff = readFileSync(new URL("../src/lib/staff-scheduling-copy.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/components/notification-preferences.tsx", import.meta.url), "utf8");
  assert.match(certs, /This is not payroll/);
  assert.match(certs, /Ce n’est pas la paie/);
  assert.match(staff, /This is not payroll/);
  assert.match(staff, /Ce n’est pas la paie/);
  assert.match(arrival, /safe-arrival-channels/);
  assert.match(arrival, /data-channel=\{row.id\}/);
  assert.match(settings, /provider-channel-state/);
  assert.doesNotMatch(arrival, /sendMail|sendSms|fetch\(/);
  assert.doesNotMatch(settings, /sendMail|sendSms/);
});
