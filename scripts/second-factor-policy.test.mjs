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
  assert.equal(during.graceEndsAt, now + PROVIDER_HEALTH_GRACE_MS);
  const after = healthFactorDecision({
    audience: "provider",
    seesHealth: true,
    optedIn: false,
    verified: false,
    now: now + PROVIDER_HEALTH_GRACE_MS,
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

test("C4: the email-code banner hides for 7 days after Not now, and never once the code is set", async () => {
  const { healthBannerVisible, healthBannerCanSnooze, HEALTH_BANNER_SNOOZE_MS } = await import(
    "../src/lib/second-factor-policy.ts"
  );
  assert.equal(HEALTH_BANNER_SNOOZE_MS, 7 * 24 * 60 * 60 * 1000);
  // Code set (verified): no prompt, no banner.
  assert.equal(healthBannerVisible({ prompt: false, locked: false, snoozedAt: null, now }), false);
  // First visit: shows.
  assert.equal(healthBannerVisible({ prompt: true, locked: false, snoozedAt: null, now }), true);
  // Snoozed 1 day ago: hidden.
  assert.equal(healthBannerVisible({ prompt: true, locked: false, snoozedAt: now - 86_400_000, now }), false);
  // Snoozed 7 days ago: shows again.
  assert.equal(healthBannerVisible({ prompt: true, locked: false, snoozedAt: now - HEALTH_BANNER_SNOOZE_MS, now }), true);
  // A future timestamp (clock change) does not hide it forever.
  assert.equal(healthBannerVisible({ prompt: true, locked: false, snoozedAt: now + 1000, now }), true);
  // Locked notes always show the banner, and offer no snooze.
  assert.equal(healthBannerVisible({ prompt: true, locked: true, snoozedAt: now - 1000, now }), true);
  assert.equal(healthBannerCanSnooze({ prompt: true, locked: true }), false);
  assert.equal(healthBannerCanSnooze({ prompt: true, locked: false }), true);
});

test("C4: the banner uses the snooze helper and has EN and FR copy", async () => {
  const { readFileSync } = await import("node:fs");
  const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
  const banner = src("src/components/email-code-setting.tsx");
  assert.match(banner, /healthBannerVisible\(/);
  assert.match(banner, /data-ke="health-second-factor-snooze"/);
  assert.match(banner, /HEALTH_BANNER_SNOOZE_KEY/);
  assert.match(src("src/lib/copy-en.ts"), /healthCodeSnooze: /);
  assert.match(src("src/lib/copy-fr.ts"), /healthCodeSnooze: /);
});
