import assert from "node:assert/strict";
import { test } from "node:test";
import { healthFactorDecision, hideHealthText, PROVIDER_HEALTH_GRACE_MS } from "../src/lib/second-factor-policy.ts";

const now = Date.parse("2026-11-21T18:00:00.000Z");

test("parents stay in until they turn on the email code", () => {
  assert.equal(healthFactorDecision({ audience: "parent", seesHealth: false, optedIn: false, verified: false, now, graceStartedAt: null }).redact, false);
  const on = healthFactorDecision({ audience: "parent", seesHealth: false, optedIn: true, verified: false, now, graceStartedAt: null });
  assert.equal(on.redact, true);
  assert.equal(healthFactorDecision({ audience: "parent", seesHealth: false, optedIn: true, verified: true, now, graceStartedAt: null }).redact, false);
});

test("provider staff keep health notes during the grace period", () => {
  const during = healthFactorDecision({
    audience: "provider",
    seesHealth: true,
    optedIn: false,
    verified: false,
    now,
    graceStartedAt: now,
  });
  assert.equal(during.redact, false);
  assert.equal(during.prompt, true);
  // N-25: 14 days, rounded up to the next Toronto midnight (Dec 6 00:00 EST = 05:00 UTC).
  assert.ok(during.graceEndsAt >= now + PROVIDER_HEALTH_GRACE_MS);
  assert.equal(during.graceEndsAt, Date.parse("2026-12-06T05:00:00.000Z"));
  assert.equal(during.graceEndsDay, "2026-12-06");
  const after = healthFactorDecision({
    audience: "provider",
    seesHealth: true,
    optedIn: false,
    verified: false,
    now: Date.parse("2026-12-06T05:00:00.000Z"),
    graceStartedAt: now,
  });
  assert.equal(after.redact, true);
  const other = healthFactorDecision({
    audience: "provider",
    seesHealth: false,
    optedIn: false,
    verified: false,
    now,
    graceStartedAt: null,
  });
  assert.equal(other.prompt, false);
});

test("hidden health text keeps the child's name", () => {
  const hidden = hideHealthText({ name: "Ada", allergies: "peanuts", child: { name: "Bea", medicalNotes: "asthma" } });
  assert.equal(hidden.name, "Ada");
  assert.equal(hidden.allergies, "");
  assert.equal(hidden.child.medicalNotes, "");
  assert.equal(hidden.child.name, "Bea");
});

test("N-25: one server deadline day, the same for every device and every reload", async () => {
  const { providerGraceDeadline, formatDeadlineDay, HEALTH_DEADLINE_TIME_ZONE } = await import(
    "../src/lib/second-factor-policy.ts"
  );
  assert.equal(HEALTH_DEADLINE_TIME_ZONE, "America/Toronto");
  // Late evening in Toronto (already the next day in UTC) still counts as the Toronto day.
  const lateEvening = Date.parse("2026-11-24T04:30:00.000Z"); // Nov 23, 23:30 EST
  const a = providerGraceDeadline(lateEvening);
  assert.equal(a.day, "2026-12-08");
  assert.equal(a.endsAt, Date.parse("2026-12-08T05:00:00.000Z"));
  // Same start, asked again later: same answer (stored start, no clock math).
  assert.deepEqual(providerGraceDeadline(lateEvening), a);
  const decided = healthFactorDecision({
    audience: "provider",
    seesHealth: true,
    optedIn: false,
    verified: false,
    now: lateEvening + 3 * 86_400_000,
    graceStartedAt: lateEvening,
  });
  assert.equal(decided.graceEndsDay, a.day);
  assert.equal(decided.graceEndsAt, a.endsAt);
  // The screen shows the day string as is, never shifted by the device zone.
  const prevTz = process.env.TZ;
  for (const tz of ["Pacific/Honolulu", "America/Vancouver", "America/St_Johns", "Asia/Tokyo"]) {
    process.env.TZ = tz;
    assert.equal(formatDeadlineDay("2026-12-08", "en"), "December 8");
    assert.equal(formatDeadlineDay("2026-12-08", "fr"), "8 décembre");
  }
  process.env.TZ = prevTz;
  assert.equal(formatDeadlineDay(null, "en"), "");
  assert.equal(formatDeadlineDay("not a day", "en"), "");
  // Daylight saving ends Nov 1, 2026: midnight still lands on local midnight.
  const dst = providerGraceDeadline(Date.parse("2026-10-20T16:00:00.000Z"));
  assert.equal(dst.day, "2026-11-04");
  assert.equal(dst.endsAt, Date.parse("2026-11-04T05:00:00.000Z"));
  const summer = providerGraceDeadline(Date.parse("2026-07-01T16:00:00.000Z"));
  assert.equal(summer.endsAt, Date.parse("2026-07-16T04:00:00.000Z"));
});

test("N-25: Hide folds the banner per deadline, never once the code is set, never when locked", async () => {
  const { healthBannerMode, healthBannerCanHide } = await import("../src/lib/second-factor-policy.ts");
  const day = "2026-12-08";
  assert.equal(healthBannerMode({ prompt: false, locked: false, deadlineDay: day, hiddenFor: null }), "none");
  // First view: full banner with Hide.
  assert.equal(healthBannerMode({ prompt: true, locked: false, deadlineDay: day, hiddenFor: null }), "full");
  assert.equal(healthBannerCanHide({ prompt: true, locked: false, deadlineDay: day }), true);
  // After Hide: one short line that keeps the deadline and the link.
  assert.equal(healthBannerMode({ prompt: true, locked: false, deadlineDay: day, hiddenFor: day }), "folded");
  // A new deadline opens it again.
  assert.equal(healthBannerMode({ prompt: true, locked: false, deadlineDay: "2026-12-20", hiddenFor: day }), "full");
  // Locked notes always show the full banner and offer no Hide.
  assert.equal(healthBannerMode({ prompt: true, locked: true, deadlineDay: day, hiddenFor: day }), "full");
  assert.equal(healthBannerCanHide({ prompt: true, locked: true, deadlineDay: day }), false);
  assert.equal(healthBannerCanHide({ prompt: true, locked: false, deadlineDay: null }), false);
});

test("N-25: the banner shows the server day, folds with a way back, and the choice is cleared at sign-out", async () => {
  const { readFileSync } = await import("node:fs");
  const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const banner = src("src/components/email-code-setting.tsx");
  assert.match(banner, /formatDeadlineDay\(state\.deadlineDay/);
  assert.doesNotMatch(banner, /new Date\(state\.graceEndsAt\)/);
  assert.doesNotMatch(banner, /Date\.now\(\)/);
  assert.match(banner, /data-ke="health-second-factor-hide"/);
  assert.match(banner, /data-ke="health-second-factor-folded"[\s\S]*to="\/verify-2fa"[\s\S]*data-ke="health-second-factor-show"/);
  assert.match(src("src/lib/server/second-factor.ts"), /graceEndsDay: provider\.graceEndsDay/);
  const { ACCOUNT_SCOPED_LOCAL_KEYS } = await import("../src/lib/account-scoped-storage.ts");
  const { HEALTH_BANNER_HIDDEN_KEY } = await import("../src/lib/second-factor-policy.ts");
  assert.ok(ACCOUNT_SCOPED_LOCAL_KEYS.includes(HEALTH_BANNER_HIDDEN_KEY));
  for (const file of ["src/lib/copy-en.ts", "src/lib/copy-fr.ts"]) {
    const copy = src(file);
    for (const key of ["healthCodeHide", "healthCodeFolded", "healthCodeShow"]) assert.match(copy, new RegExp(`${key}: `));
    assert.match(copy, /healthCodeFolded: "[^"]*\{date\}/);
  }
});
