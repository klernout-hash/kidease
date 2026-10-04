import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import { parentAlertsEntitled } from "../src/lib/parent-plus.ts";
import {
  parentCompareMax,
  parentPlusFeaturesOpen,
  showParentUpgradeCta,
} from "../src/lib/parent-plus-access.ts";
import { roleNavItems } from "../src/lib/role-access.ts";
import { parentPlusEntitlesVideo, videoJoinGate } from "../src/lib/video.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("signed-in parents get Plus tools while subscriptions are off", () => {
  const parent = { subscriptionsOn: false, role: "parent", paid: false };
  assert.equal(parentPlusFeaturesOpen(parent), true);
  assert.equal(parentCompareMax(parent), 10);
  assert.equal(showParentUpgradeCta(false), false);
  assert.equal(parentPlusFeaturesOpen({ subscriptionsOn: false, role: "guest", paid: false }), false);
  assert.equal(parentCompareMax({ subscriptionsOn: false, role: "provider", paid: false }), 5);
  assert.equal(parentAlertsEntitled("free", null), false);
  assert.equal(parentAlertsEntitled("alerts", "active"), true);
});

test("paid compare and parent upgrade return when subscriptions are on", () => {
  assert.equal(parentCompareMax({ subscriptionsOn: true, role: "parent", paid: false }), 5);
  assert.equal(parentCompareMax({ subscriptionsOn: true, role: "parent", paid: true }), 10);
  assert.equal(parentCompareMax({ subscriptionsOn: true, role: "provider", paid: true }), 5);
  assert.equal(showParentUpgradeCta(true), true);
  assert.equal(roleNavItems({ role: "parent", subscriptionsOn: true }).some((item) => item.id === "upgrade"), true);
  assert.equal(roleNavItems({ role: "parent", subscriptionsOn: false }).some((item) => item.id === "upgrade"), false);
  assert.equal(roleNavItems({ role: "provider", subscriptionsOn: false }).some((item) => item.id === "upgrade"), true);
  assert.equal(visibleDeskNav("parent", { subscriptionsEnabled: false }).some((item) => item.id === "upgrade"), false);
  assert.equal(visibleDeskNav("parent").some((item) => item.id === "upgrade"), true);
  assert.equal(
    visibleDeskNav("daycare", { subscriptionsEnabled: false, centreOwner: true }).some((item) => item.id === "subscription"),
    true,
  );
});

test("video Plus opens for parents while subscriptions are off, and the video flag still gates the join", () => {
  assert.deepEqual(
    parentPlusEntitlesVideo({ role: "parent", plusPlan: "free", plusStatus: null }, false, false),
    { ok: true },
  );
  const off = videoJoinGate({
    featureOn: false,
    credentialsPresent: true,
    stripeLive: false,
    subscriptionsOn: false,
    actor: { role: "parent", plusPlan: "free", plusStatus: null },
  });
  assert.equal(off.ok, false);
  if (!off.ok) assert.equal(off.reason, "feature_off");
  const on = videoJoinGate({
    featureOn: true,
    credentialsPresent: true,
    stripeLive: false,
    subscriptionsOn: false,
    actor: { role: "parent", plusPlan: "free", plusStatus: null },
    sdkWired: true,
  });
  assert.equal(on.ok, true);
});

test("parent desk uses the flag for compare and hides the parent upgrade surface", () => {
  const desk = readFileSync(join(root, "src/components/parent-desk.tsx"), "utf8");
  const route = readFileSync(join(root, "src/routes/parent.tsx"), "utf8");
  assert.match(desk, /compareMax=\{plus\.compareMax\}/);
  assert.match(desk, /plus\.showParentUpgrade/);
  assert.match(route, /!chrome\.subscriptionsEnabled/);
  assert.doesNotMatch(desk, /free forever/i);
});
