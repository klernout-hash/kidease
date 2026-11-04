import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { unifiedAlertsEnabled, unifiedAlertsLive } from "../src/lib/features.ts";
import { planUnifiedScan, ratioPressure } from "../src/lib/unified-alert-scan.ts";
import {
  UNIFIED_ALERT_TYPES,
  alertChart,
  alertText,
  decideUnifiedAlert,
  defaultUnifiedSettings,
  digestReady,
  isQuietAt,
  planPluginHook,
  publicCentreName,
  safetyBlocksAlert,
  unifiedDeliveryBlocked,
} from "../src/lib/unified-alerts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const base = defaultUnifiedSettings("parent", "America/Winnipeg");

function decide(extra) {
  return decideUnifiedAlert({
    typeId: "parent_request_accepted",
    settings: base,
    typeEnabled: true,
    flagOn: true,
    live: true,
    pushArmed: false,
    previewOrTest: false,
    blocked: false,
    now: new Date("2026-07-15T18:00:00.000Z"),
    ...extra,
  });
}

test("unified alert flags default off and live needs both", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_UNIFIED_ALERTS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_UNIFIED_ALERTS_LIVE, false);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_SUBSCRIPTIONS, false);
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(unifiedAlertsEnabled({}), false);
  assert.equal(unifiedAlertsEnabled({ FEATURE_UNIFIED_ALERTS: "1" }), true);
  assert.equal(unifiedAlertsLive({ FEATURE_UNIFIED_ALERTS_LIVE: "1" }), false);
  assert.equal(
    unifiedAlertsLive({ FEATURE_UNIFIED_ALERTS: "1", FEATURE_UNIFIED_ALERTS_LIVE: "1" }),
    true,
  );
});

test("preview and tests never send, and push is not call push", () => {
  assert.equal(unifiedDeliveryBlocked({ VERCEL_ENV: "preview" }), "preview");
  assert.equal(unifiedDeliveryBlocked({ NODE_ENV: "test" }), "test");
  assert.equal(unifiedDeliveryBlocked({ npm_lifecycle_event: "test" }), "test");
  assert.equal(unifiedDeliveryBlocked({ VERCEL_ENV: "production", NODE_ENV: "production" }), null);
  assert.equal(decide({ previewOrTest: true }).reason, "preview");
  assert.equal(decide({ flagOn: false }).reason, "flag");
  const server = src("src/lib/server/unified-alerts.ts");
  assert.doesNotMatch(server, /FEATURE_CALL_PUSH/);
  assert.doesNotMatch(server, /sendSms/);
  assert.match(server, /pushArmed/);
  assert.match(server, /sendPushNotification/);
  assert.match(src("migrations/0171_unified_alerts.sql"), /drop table if exists unified_alert_events/);
});

test("every alert has English and French copy and no street or endorsement", () => {
  const docs = src("docs/unified-alerts.md");
  for (const row of UNIFIED_ALERT_TYPES) {
    assert.match(docs, new RegExp(row.id));
    assert.ok(row.en.title && row.fr.title);
    assert.ok(row.en.body && row.fr.body);
    assert.notEqual(row.en.title, row.fr.title);
    const blob = `${row.en.body} ${row.fr.body} ${row.en.detail}`;
    assert.doesNotMatch(blob, /free forever|government approved|endorsed by/i);
    assert.equal(row.emailOwner === "unified" || row.emailOwner === "legacy" || row.emailOwner === "none", true);
  }
  const chart = alertChart();
  assert.equal(chart.length, UNIFIED_ALERT_TYPES.length);
  assert.equal(chart.filter((row) => row.result === "fail").length > 0, true);
});

test("toggles, quiet hours, digest, dedupe, and safety blocks", () => {
  assert.equal(decide({ settings: { ...base, master: false } }).reason, "master");
  assert.equal(decide({ typeEnabled: false }).reason, "type_off");
  assert.equal(decide({ blocked: true }).reason, "blocked");
  assert.equal(decide({ duplicate: true }).reason, "duplicate");
  assert.equal(
    decide({ lastSentAt: new Date("2026-07-15T17:30:00.000Z"), throttleMs: 60 * 60 * 1000 }).reason,
    "throttle",
  );
  const night = decide({ now: new Date("2026-07-15T04:30:00.000Z"), typeId: "daycare_new_review" });
  assert.equal(night.status, "held");
  assert.equal(night.outbound, "later");
  assert.equal(night.channels.includes("email"), true);
  const critical = decide({ now: new Date("2026-07-15T04:30:00.000Z") });
  assert.equal(critical.outbound, "now");
  assert.equal(critical.channels.includes("push"), false);
  const pushed = decide({ pushArmed: true, settings: { ...base, push: true } });
  assert.equal(pushed.channels.includes("push"), true);
  const digest = decide({
    typeId: "daycare_new_review",
    settings: { ...base, digest: "daily" },
    now: new Date("2026-07-15T18:00:00.000Z"),
  });
  assert.equal(digest.status, "digest");
  assert.equal(decide({ typeId: "staff_allergy_clock" }).reason, "stub");
  assert.equal(decide({ typeId: "admin_daily_digest", nativeShell: true }).reason, "web_only");
  const hook = decide({ typeId: "parent_coparent_changed" });
  assert.equal(hook.action, "record");
  assert.equal(hook.channels.includes("email"), false);
});

test("quiet hours follow the time zone through daylight saving", () => {
  const winter = new Date("2026-01-15T13:30:00.000Z");
  const summer = new Date("2026-07-15T13:30:00.000Z");
  assert.equal(isQuietAt({ now: winter, timeZone: "America/Winnipeg", quietStart: "21:00", quietEnd: "08:00" }), true);
  assert.equal(isQuietAt({ now: summer, timeZone: "America/Winnipeg", quietStart: "21:00", quietEnd: "08:00" }), false);
  assert.equal(isQuietAt({ now: summer, timeZone: "America/Regina", quietStart: "21:00", quietEnd: "08:00" }), true);
  assert.equal(isQuietAt({ now: new Date("2026-03-08T12:30:00.000Z"), timeZone: "America/Winnipeg", quietStart: "21:00", quietEnd: "08:00" }), true);
  assert.equal(isQuietAt({ now: new Date("2026-03-08T12:30:00.000Z"), timeZone: "America/Halifax", quietStart: "21:00", quietEnd: "08:00" }), false);
  assert.equal(
    isQuietAt({
      now: new Date("2026-07-15T14:00:00.000Z"),
      timeZone: "America/Winnipeg",
      quietStart: "21:00",
      quietEnd: "08:00",
      staffShiftQuiet: true,
      shift: { start: "09:00", end: "17:00" },
    }),
    false,
  );
  assert.equal(
    isQuietAt({
      now: new Date("2026-07-15T13:00:00.000Z"),
      timeZone: "America/Winnipeg",
      quietStart: "21:00",
      quietEnd: "08:00",
      staffShiftQuiet: true,
      shift: { start: "09:00", end: "17:00" },
    }),
    true,
  );
  assert.equal(
    digestReady({
      digest: "weekly",
      status: "digest",
      now: new Date("2026-07-13T14:00:00.000Z"),
      timeZone: "America/Winnipeg",
      quietStart: "21:00",
      quietEnd: "08:00",
    }),
    true,
  );
});

test("safety blocks and street names", () => {
  const blocks = [{ blockerUserId: "parent", blockedUserId: "staff", daycareId: null }];
  assert.equal(
    safetyBlocksAlert({ blocks, recipientUserId: "staff", counterpartyUserId: "parent", daycareId: "d1" }),
    true,
  );
  assert.equal(
    safetyBlocksAlert({
      blocks: [{ blockerUserId: "parent", daycareId: "d1" }],
      recipientUserId: "parent",
      daycareId: "d1",
    }),
    true,
  );
  assert.equal(publicCentreName("123 Main Street Care", "en"), "Your centre");
  assert.equal(publicCentreName("Harbour Centre", "fr"), "Harbour Centre");
  assert.doesNotMatch(alertText("parent_spot_opened", "en", { name: "12 Oak Avenue" }).body, /Oak Avenue/);
});

test("scan uses real facts and leaves hooks and stubs alone", () => {
  assert.equal(planUnifiedScan({ now: new Date("2026-07-15T15:00:00.000Z") }).length, 0);
  assert.equal(ratioPressure(10, 1, 3, 1), "over");
  assert.equal(ratioPressure(3, 1, 3, 1), "near");
  assert.equal(ratioPressure(1, 1, 3, 1), "ok");
  const now = new Date("2026-07-15T15:00:00.000Z");
  const planned = planUnifiedScan({
    now,
    spots: [{ daycareId: "d1", name: "Harbour", spots: 1, updatedAt: now.toISOString(), userIds: ["p1"] }],
    requests: [
      {
        id: "lead-1",
        daycareId: "d1",
        name: "Harbour",
        userId: "p1",
        status: "requested",
        kind: "tour",
        updatedAt: new Date(now.getTime() - 30 * 36e5).toISOString(),
        createdAt: new Date(now.getTime() - 30 * 36e5).toISOString(),
        ownerUserIds: ["owner"],
        source: "lead",
      },
      {
        id: "lead-2",
        daycareId: "d1",
        name: "Harbour",
        userId: "p1",
        status: "confirmed",
        kind: "spot_inquiry",
        updatedAt: now.toISOString(),
        createdAt: now.toISOString(),
        ownerUserIds: ["owner"],
        source: "lead",
      },
    ],
    tours: [{ id: "t1", userId: "p1", daycareId: "d1", name: "Harbour", startAt: new Date(now.getTime() + 24 * 36e5).toISOString() }],
    ratios: [{ id: "r1", daycareId: "d1", name: "Harbour", children: 10, staff: 1, childrenPer: 3, staffPer: 1, staffUserIds: ["s1"] }],
  });
  const ids = planned.map((row) => row.typeId);
  assert.ok(ids.includes("parent_spot_opened"));
  assert.ok(ids.includes("daycare_request_unanswered"));
  assert.ok(ids.includes("parent_request_accepted"));
  assert.ok(ids.includes("parent_tour_day"));
  assert.ok(ids.includes("staff_ratio"));
  for (const row of planned) {
    const type = UNIFIED_ALERT_TYPES.find((item) => item.id === row.typeId);
    assert.ok(type.readiness === "live" || type.readiness === "partial");
  }
  assert.equal(planPluginHook({ hook: "coparent_changed", userId: "", entityId: "x" }), null);
  const hook = planPluginHook({ hook: "custody_restriction", userId: "s1", entityId: "child-1", name: "Harbour" });
  assert.equal(hook.typeId, "staff_custody_notice");
  assert.equal(planPluginHook({ hook: "portfolio_item", userId: "p1", entityId: "story-1" }).typeId, "parent_portfolio_item");
});
