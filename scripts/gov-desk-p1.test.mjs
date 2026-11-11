import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { govCopy } from "../src/lib/gov/copy.ts";

const dash = readFileSync(new URL("../src/components/gov/gov-dashboard.tsx", import.meta.url), "utf8");
const frame = readFileSync(new URL("../src/components/gov/gov-frame.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../src/components/compliance/calendar-page.tsx", import.meta.url), "utf8");
const demand = readFileSync(new URL("../src/components/compliance/demand-page.tsx", import.meta.url), "utf8");
const jobs = readFileSync(new URL("../src/components/ece-job-desk.tsx", import.meta.url), "utf8");
const audit = readFileSync(new URL("../src/components/compliance/audit-page.tsx", import.meta.url), "utf8");

test("the government desk keeps the three ledgers and the source list apart from live cards", () => {
  const en = govCopy("en");
  const fr = govCopy("fr");
  assert.match(dash, /data-ke="gov-ledgers"/);
  assert.match(dash, /data-ke="gov-sources"/);
  assert.match(frame, /data-ke="gov-menu"/);
  assert.match(dash, /data-ke="gov-trend-bars"/);
  assert.match(en.sourcesNote, /not a live feed/);
  assert.doesNotMatch(dash, /Territories", "71", "46", "0"/);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  assert.match(en.ledgerOfficial, /not loaded/);
  assert.match(en.ledgerSurvey, /Do not add it to the cards/);
  assert.match(fr.sourcesNote, /pas un flux en direct/);
});

test("licence dates, saved-search demand, jobs, and the audit page do not overclaim", () => {
  assert.match(calendar, /data-ke="gov-status-lanes"/);
  assert.match(calendar, /Tracked overdue dates in this tool/);
  assert.doesNotMatch(calendar, /\{data\.province\}: \{data\.overdue\}/);
  assert.match(demand, /Saved-search demand/);
  assert.match(demand, /not children or official applications/);
  assert.match(jobs, /data-ke="gov-jobs-view-only"/);
  assert.match(jobs, /not a staffing shortage/);
  assert.match(jobs, /coverage unknown/);
  assert.match(audit, /data-ke="gov-audit-limit"/);
  assert.match(audit, /deletion readiness only/);
});
