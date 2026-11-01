import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { broadcastMode, centreInAudience, parentChannelPlan } from "../src/lib/compliance/broadcast.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
test("broadcasts stay off and texts need consent", () => {
  assert.equal(broadcastMode({}), "off");
  assert.equal(broadcastMode({ FEATURE_GOV_BROADCAST: "1" }), "dry_run");
  const centre = { province: "ON", city: "Toronto", postal: "M5V 2T6" };
  assert.equal(centreInAudience(centre, { kind: "fsa", province: "ON", fsa: "M5V" }), true);
  assert.equal(centreInAudience(centre, { kind: "province", province: "MB" }), false);
  const live = parentChannelPlan("live", false, true);
  assert.equal(live.sms, "skip");
  assert.equal(live.email, "send");
  const practice = parentChannelPlan("dry_run", true, true);
  assert.equal(practice.sms, "log");
  assert.equal(practice.email, "log");
});
test("broadcast pages are web desks", () => {
  assert.match(src(".env.example"), /^FEATURE_GOV_BROADCAST=0$/m);
  assert.match(src(".env.example"), /^FEATURE_GOV_BROADCAST_LIVE=0$/m);
  assert.match(src("src/routes/gov_.broadcasts.tsx"), /guardGovDesk/);
  assert.match(src("src/routes/admin-gov-broadcasts.tsx"), /beforeLoadAdminDesk/);
  assert.match(src("src/lib/server/compliance-broadcast.ts"), /caslSmsGranted/);
});
