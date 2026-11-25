import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GOV_AS_OF_FALLBACK_ZONE, formatGovAsOf, govAsOfZone, govZoneLabel } from "../src/lib/gov/as-of.ts";
import { PROVINCE_TIMEZONES, provinceTimezone } from "../src/lib/province-timezone.ts";
import { tourTimezoneForProvince } from "../src/lib/tour-calendar.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const NOV = "2026-11-25T16:01:00.000Z";
const JUL = "2026-07-01T16:01:00.000Z";

/** The zone's own short label from ICU, so the test follows tzdata (no hard-coded DST rules). */
function label(zone, iso, locale) {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((part) => part.type === "timeZoneName").value;
}

test("#1014 item 6: Manitoba counts show Winnipeg time with a Manitoba zone label, EN and FR", () => {
  assert.equal(govAsOfZone("MB"), "America/Winnipeg");
  const en = formatGovAsOf(NOV, "MB", "en");
  const fr = formatGovAsOf(NOV, "MB", "fr");
  // Manitoba has been on permanent UTC-5 (Manitoba Standard Time) since Nov 1, 2026 (tzdata 2026e).
  assert.equal(en, "Nov 25, 2026, 11:01 a.m. MBT");
  assert.equal(fr, "25 nov. 2026, 11 h 01 HNM");
  for (const text of [en, fr]) assert.doesNotMatch(text, /UTC|GMT|Z$|CDT|HAC|CST|HNC/);
});

test("Manitoba before the switch keeps its old Central labels", () => {
  assert.equal(formatGovAsOf(JUL, "MB", "en"), "Jul 1, 2026, 11:01 a.m. CDT");
  assert.equal(formatGovAsOf(JUL, "MB", "fr"), "1 juill. 2026, 11 h 01 HAC");
  assert.equal(formatGovAsOf("2026-01-15T16:01:00.000Z", "MB", "en"), "Jan 15, 2026, 10:01 a.m. CST");
});

test("BC and Alberta after their 2026 switch show an offset, not a stale daylight label", () => {
  assert.equal(govZoneLabel("America/Vancouver", new Date(NOV), "en"), "UTC−7");
  assert.equal(govZoneLabel("America/Toronto", new Date(NOV), "en"), null);
  assert.doesNotMatch(formatGovAsOf(NOV, "BC", "en"), /PDT/);
  assert.doesNotMatch(formatGovAsOf(NOV, "AB", "en"), /MDT/);
  assert.equal(formatGovAsOf(NOV, "ON", "en"), "Nov 25, 2026, 11:01 a.m. EST");
});

test("#1014 item 6: Saskatchewan has no DST shift; Newfoundland keeps its half hour", () => {
  assert.equal(formatGovAsOf(NOV, "SK", "en"), "Nov 25, 2026, 10:01 a.m. CST");
  assert.equal(formatGovAsOf(JUL, "SK", "en"), "Jul 1, 2026, 10:01 a.m. CST");
  assert.equal(govAsOfZone("NL"), "America/St_Johns");
  assert.match(formatGovAsOf(NOV, "NL", "en"), /:31 [ap]\.m\. N[SD]T$/);
  assert.match(formatGovAsOf(NOV, "NL", "fr"), / h 31 H[NA]T$/);
});

test("#1014 item 6: an unknown province falls back to the browser zone, then Winnipeg, never UTC", () => {
  assert.equal(govAsOfZone("ALL"), GOV_AS_OF_FALLBACK_ZONE);
  assert.equal(govAsOfZone("ZZ", null), "America/Winnipeg");
  assert.equal(govAsOfZone("ALL", "America/Vancouver"), "America/Vancouver");
  assert.equal(govAsOfZone("ALL", "UTC"), "America/Winnipeg");
  assert.equal(govAsOfZone("ALL", "Etc/UTC"), "America/Winnipeg");
  assert.equal(govAsOfZone("ALL", "Not/AZone"), "America/Winnipeg");
  // A known province wins over the browser.
  assert.equal(govAsOfZone("MB", "America/Vancouver"), "America/Winnipeg");
  assert.equal(formatGovAsOf(NOV, "ALL", "en"), formatGovAsOf(NOV, "MB", "en"));
  assert.doesNotMatch(formatGovAsOf(NOV, "ALL", "en", "UTC"), /UTC/);
  assert.equal(formatGovAsOf("not a date", "MB", "en"), "");
});

test("#1014 item 6: the province map is shared with tour clocks", () => {
  for (const code of Object.keys(PROVINCE_TIMEZONES)) {
    assert.equal(tourTimezoneForProvince(code), provinceTimezone(code), code);
  }
  assert.equal(provinceTimezone("mb"), "America/Winnipeg");
  assert.equal(provinceTimezone("ALL"), null);
});

test("#1014 item 6: no UTC text on the government desk", () => {
  const dash = src("src/components/gov/gov-dashboard.tsx");
  assert.match(dash, /formatGovAsOf\(data\.generatedAt, data\.province,/);
  assert.match(dash, /asOf=\{asOf\}/);
  assert.match(src("src/components/gov/gov-frame.tsx"), /data-ke="gov-as-of" suppressHydrationWarning/);
  const files = [
    ...readdirSync(join(root, "src/components/gov")).map((f) => `src/components/gov/${f}`),
    ...readdirSync(join(root, "src/routes"))
      .filter((f) => /^(fr\.)?gov(_\.|\.tsx)/.test(f))
      .map((f) => `src/routes/${f}`),
  ];
  for (const file of files) assert.doesNotMatch(src(file), /\bUTC\b/, file);
});
