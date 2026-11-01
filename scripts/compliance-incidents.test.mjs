import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  deadlineFor,
  escalationDecision,
  incidentAggregate,
  incidentsMode,
  parentEmailPlan,
  redactLog,
  smsPlan,
} from "../src/lib/compliance/incidents.ts";
import { canSeeProvince } from "../src/lib/compliance/mode.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("incident flag is off and practice mode does not send", () => {
  assert.equal(incidentsMode({}), "off");
  assert.equal(incidentsMode({ FEATURE_INCIDENTS: "1" }), "dry_run");
  assert.equal(incidentsMode({ FEATURE_INCIDENTS: "1", FEATURE_INCIDENTS_LIVE: "1" }), "live");
  const due = escalationDecision({
    mode: "dry_run",
    awareAt: new Date("2026-01-01T00:00:00Z"),
    hours: 24,
    now: new Date("2026-01-03T00:00:00Z"),
    filedAt: null,
    escalatedAt: null,
  });
  assert.equal(due.delivery, "log");
  assert.equal(smsPlan("live", false).reason, "no_consent");
  assert.equal(smsPlan("dry_run", true).delivery, "log");
  assert.equal(smsPlan("live", true).delivery, "send");
  const mail = parentEmailPlan({
    mode: "dry_run",
    occurredAt: new Date("2026-06-01T15:00:00Z"),
    now: new Date("2026-06-01T22:00:00Z"),
    timeZone: "America/Toronto",
    hasEmail: true,
    alreadySent: false,
  });
  assert.equal(mail.delivery, "log");
});

test("Ontario deadline is cited and other provinces stay placeholders", () => {
  const ontario = deadlineFor("ON");
  assert.equal(ontario?.hours, 24);
  assert.equal(ontario?.verified, true);
  assert.match(ontario?.source || "", /150137/);
  assert.equal(deadlineFor("MB")?.verified, false);
  assert.match(deadlineFor("MB")?.source || "", /PLACEHOLDER/);
});

test("government users see only their province and aggregates have no child name", () => {
  assert.equal(canSeeProvince({ role: "government", govProvince: "ON", rowProvince: "MB" }), false);
  assert.equal(canSeeProvince({ role: "government", govProvince: "ON", rowProvince: "ON" }), true);
  assert.equal(canSeeProvince({ role: "government", govProvince: null, rowProvince: "ON" }), false);
  assert.equal(canSeeProvince({ role: "admin", govProvince: null, rowProvince: "MB" }), true);
  const counts = incidentAggregate(
    [
      { kind: "injury", province: "ON" },
      { kind: "missing_child", province: "MB" },
    ],
    "ON",
  );
  assert.deepEqual(counts, [{ kind: "injury", count: 1 }]);
  assert.equal(JSON.stringify(counts).includes("child"), false);
  const log = redactLog({ childLabel: "Ava", email: "a@b.c", incidentId: "inc_1", kind: "injury" });
  assert.deepEqual(log, { incidentId: "inc_1", kind: "injury" });
});

test("incident screens keep help and the phone app out of the government desk", () => {
  assert.match(src(".env.example"), /^FEATURE_INCIDENTS=0$/m);
  assert.match(src(".env.example"), /^FEATURE_INCIDENTS_LIVE=0$/m);
  assert.match(src("src/components/compliance/frame.tsx"), /href="\/help"/);
  assert.match(src("src/components/compliance/frame.tsx"), /min-h-11/);
  assert.match(src("src/routes/gov_.incidents.tsx"), /guardGovDesk/);
  assert.match(src("src/routes/admin-gov-incidents.tsx"), /beforeLoadAdminDesk/);
  assert.match(src("migrations/0132_gov_incidents.sql"), /gov_province/);
  assert.doesNotMatch(src("migrations/0132_gov_incidents.sql"), /delete from profiles/i);
  assert.match(src("src/lib/server/compliance-incidents.ts"), /caslSmsGranted/);
});
