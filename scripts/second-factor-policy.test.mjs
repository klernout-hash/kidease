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
