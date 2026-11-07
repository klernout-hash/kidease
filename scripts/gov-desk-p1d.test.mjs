import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("small government tool counts stay hidden", () => {
  assert.match(read("../src/components/compliance/ratios-page.tsx"), /data-ke="gov-ratio-counts"/);
  assert.match(read("../src/components/compliance/screening-page.tsx"), /data-ke="gov-screening-counts"/);
  assert.match(read("../src/components/compliance/screening-page.tsx"), /suppressCount/);
  assert.match(read("../src/components/compliance/calendar-page.tsx"), /data-ke="gov-date-counts"/);
  assert.doesNotMatch(read("../src/routes/gov_.compliance.tsx"), /showDates/);
  assert.doesNotMatch(read("../src/routes/fr.gov_.compliance.tsx"), /showDates/);
  assert.match(read("../src/routes/admin-gov-compliance.tsx"), /showDates/);

  const calendar = read("../src/lib/server/compliance-calendar.ts");
  const gov = calendar.slice(calendar.indexOf("export const loadGovCalendar"), calendar.indexOf("export const loadAdminCalendar"));
  assert.match(gov, /rows: \[\]/);
  assert.doesNotMatch(gov, /\.\.\.data/);
});
