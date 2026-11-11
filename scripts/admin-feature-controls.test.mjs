import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FEATURE_SWITCHES } from "../src/lib/admin-features.ts";
import {
  canManageFeatureControls,
  featureControlRegistry,
  paymentHoldNote,
  presentProductFlag,
  presentSwitch,
  productFlagRows,
  rememberWrite,
  sameSiteAllowsWrite,
  switchRows,
  validateControlReason,
  validateRequestId,
} from "../src/lib/admin-feature-registry.ts";
import { FEATURE_FLAG_KEYS, FLAG_DEFAULTS } from "../src/lib/flags.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the registry is the 168 product flags and the 14 switches, not routes", () => {
  const flags = productFlagRows();
  const switches = switchRows();
  assert.equal(flags.length, 168);
  assert.equal(FEATURE_FLAG_KEYS.length, 168);
  assert.equal(switches.length, 14);
  assert.equal(FEATURE_SWITCHES.length, 14);
  assert.equal(featureControlRegistry().length, 182);
  assert.equal(new Set(flags.map((row) => row.key)).size, 168);
  assert.equal(flags.every((row) => row.writable === false && row.control === "deployment-configuration-required"), true);
  assert.equal(switches.every((row) => row.writable === true && row.control === "posthog-rollout"), true);
  assert.equal(flags.filter((row) => row.category === "government").map((row) => row.key).sort().join(","), "FEATURE_GOV_PORTAL,FEATURE_GOV_SCOPES,FEATURE_PROVINCE_REPORTS");
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(paymentHoldNote("SUBSCRIPTIONS_ENABLED")?.includes("penalties"), true);
  assert.equal(canManageFeatureControls("parent"), false);
  assert.equal(canManageFeatureControls("provider"), false);
  assert.equal(canManageFeatureControls("government"), false);
  assert.equal(canManageFeatureControls("support"), false);
  assert.equal(canManageFeatureControls("admin"), true);
});

test("unknown, code default, env, remote, partial, and errors stay separate", () => {
  const unknown = presentSwitch({ known: false, inPostHog: false, active: false, rollout: 0 });
  assert.equal(unknown.effective, "unverified");
  assert.equal(unknown.savedControl, "unverified");
  assert.equal(unknown.rolloutPercent, null);
  const missing = presentSwitch({ known: true, inPostHog: false, active: false, rollout: 0 });
  assert.equal(missing.effective, "unverified");
  const off = presentSwitch({ known: true, inPostHog: true, active: false, rollout: 0 });
  assert.equal(off.effective, "off");
  assert.equal(off.savedControl, "off");
  const partial = presentSwitch({ known: true, inPostHog: true, active: true, rollout: 25 });
  assert.equal(partial.effective, "partial");
  assert.equal(partial.rolloutPercent, 25);
  const on = presentSwitch({ known: true, inPostHog: true, active: true, rollout: 100 });
  assert.equal(on.effective, "on");
  const failed = presentSwitch({ known: true, error: "down", inPostHog: true, active: false, rollout: 0 });
  assert.equal(failed.effective, "unverified");
  assert.equal(failed.error, "down");
  const codeDefault = presentProductFlag({
    envSet: false,
    envOn: null,
    remoteConfigured: false,
    remote: "missing",
    codeDefault: false,
  });
  assert.equal(codeDefault.effective, "unverified");
  assert.equal(codeDefault.effectiveSource, "code-default");
  assert.equal(codeDefault.savedControl, "unset");
  assert.equal(codeDefault.codeDefault, false);
  assert.equal(codeDefault.deploymentConfigurationRequired, true);
  const envOff = presentProductFlag({
    envSet: true,
    envOn: false,
    remoteConfigured: false,
    remote: "missing",
    codeDefault: false,
  });
  assert.equal(envOff.effective, "off");
  assert.equal(envOff.effectiveSource, "env");
  const remoteOn = presentProductFlag({
    envSet: true,
    envOn: false,
    remoteConfigured: true,
    remote: true,
    codeDefault: false,
  });
  assert.equal(remoteOn.effective, "on");
  assert.equal(remoteOn.effectiveSource, "remote");
  assert.equal(remoteOn.savedControl, "off");
  const unverified = presentProductFlag({
    envSet: true,
    envOn: false,
    remoteConfigured: true,
    remote: "unverified",
    codeDefault: false,
  });
  assert.equal(unverified.effective, "unverified");
  assert.notEqual(unverified.effective, "off");
});

test("writes need an admin, a reason when sensitive, and do not repeat or touch payments", () => {
  assert.equal(validateControlReason("", true).ok, false);
  assert.equal(validateControlReason("Wrong cohort", true).ok, true);
  assert.equal(validateControlReason("", false).ok, true);
  assert.equal(validateRequestId("short"), false);
  assert.equal(validateRequestId("req_abcdef"), true);
  assert.equal(sameSiteAllowsWrite({ secFetchSite: "cross-site", method: "POST" }), false);
  assert.equal(sameSiteAllowsWrite({ secFetchSite: "same-origin", method: "POST" }), true);
  const seen = new Map();
  const first = rememberWrite(seen, "req_abcdef", { ok: true });
  const second = rememberWrite(seen, "req_abcdef", { ok: true });
  assert.equal(first.fresh, true);
  assert.equal(second.fresh, false);
  const server = read("src/lib/server/admin-features.ts");
  assert.match(server, /requireAdmin/);
  assert.match(server, /authMiddleware/);
  assert.match(server, /deployment-configuration-required/);
  assert.match(server, /validateControlReason/);
  assert.doesNotMatch(server, /process\.env\[[^\]]+\]\s*=/);
  assert.doesNotMatch(server, /FEATURE_PAYMENT_DUNNING|FEATURE_TAP_TO_PAY/);
  assert.match(read("src/routes/admin.features.tsx"), /beforeLoadAdminDesk/);
  assert.match(read("src/routes/admin.features.tsx"), /AdminFeatureControls/);
  assert.doesNotMatch(read("src/components/admin-feature-controls.tsx"), /fetch\(/);
});
