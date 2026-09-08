import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysSinceBucket,
  FIRST_SEEN_KEY,
  LAST_SEEN_KEY,
  readResumePath,
  rememberResumePath,
  RESUME_PATH_KEY,
  RETENTION_EVENT,
  sanitizeResumePath,
  touchRetentionClock,
} from "../src/lib/retention.ts";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

test("daysSinceBucket maps day-7 scorecard windows", () => {
  assert.equal(daysSinceBucket(0), "0");
  assert.equal(daysSinceBucket(86_400_000), "1");
  assert.equal(daysSinceBucket(3 * 86_400_000), "2-6");
  assert.equal(daysSinceBucket(7 * 86_400_000), "7-13");
  assert.equal(daysSinceBucket(20 * 86_400_000), "14-29");
  assert.equal(daysSinceBucket(40 * 86_400_000), "30+");
  assert.equal(RETENTION_EVENT, "retention_touch");
});

test("sanitizeResumePath keeps product paths and drops auth / PII", () => {
  assert.equal(sanitizeResumePath("/search"), "/search");
  assert.equal(sanitizeResumePath("/search?q=secret@email.com"), "/search");
  assert.equal(sanitizeResumePath("/daycare/maple-grove"), "/daycare/maple-grove");
  assert.equal(sanitizeResumePath("/parent?tab=saved"), "/parent?tab=saved");
  assert.equal(sanitizeResumePath("/login"), null);
  assert.equal(sanitizeResumePath("/verify-2fa?next=/parent"), null);
  assert.equal(sanitizeResumePath("/admin"), null);
  assert.equal(sanitizeResumePath("//evil.example"), null);
  assert.equal(sanitizeResumePath("/daycare/not a slug"), null);
});

test("rememberResumePath writes only sanitized paths", () => {
  const store = memoryStorage();
  assert.equal(rememberResumePath("/daycare/park-centre?utm=1", store), "/daycare/park-centre");
  assert.equal(store.getItem(RESUME_PATH_KEY), "/daycare/park-centre");
  assert.equal(rememberResumePath("/login", store), null);
  assert.equal(readResumePath(store), "/daycare/park-centre");
});

test("touchRetentionClock marks a return after a 6 hour gap", () => {
  const first = Date.parse("2026-09-01T12:00:00Z");
  const last = Date.parse("2026-09-01T12:00:00Z");
  const now = Date.parse("2026-09-08T12:00:00Z");
  const store = memoryStorage({
    [FIRST_SEEN_KEY]: String(first),
    [LAST_SEEN_KEY]: String(last),
  });
  const clock = touchRetentionClock(now, store);
  assert.equal(clock.returning, true);
  assert.equal(clock.days_since_last, "7-13");
  assert.equal(clock.tenure, "7-13");
  assert.equal(store.getItem(LAST_SEEN_KEY), String(now));
});
