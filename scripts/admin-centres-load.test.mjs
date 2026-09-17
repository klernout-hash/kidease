import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_CENTRES_LOAD_FALLBACK,
  ADMIN_IDLE_TIMEOUT_MESSAGE,
  adminCentresLoadMessage,
  isAdminIdleTimeoutMessage,
  settleAdminCentresLoad,
} from "../src/lib/admin-centres-load.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("idle timeout message is surfaced, not treated as empty", () => {
  assert.equal(
    adminCentresLoadMessage(new Error(ADMIN_IDLE_TIMEOUT_MESSAGE)),
    ADMIN_IDLE_TIMEOUT_MESSAGE,
  );
  assert.equal(
    adminCentresLoadMessage(new Error('{"message":"Admin session timed out. Sign in again."}')),
    ADMIN_IDLE_TIMEOUT_MESSAGE,
  );
  assert.equal(isAdminIdleTimeoutMessage(ADMIN_IDLE_TIMEOUT_MESSAGE), true);
});

test("other load failures keep their message and have a fallback", () => {
  assert.equal(adminCentresLoadMessage(new Error("Not authorized")), "Not authorized");
  assert.equal(adminCentresLoadMessage({}), ADMIN_CENTRES_LOAD_FALLBACK);
  assert.equal(adminCentresLoadMessage(null), ADMIN_CENTRES_LOAD_FALLBACK);
});

test("successful empty lists stay empty; failures do not become []", async () => {
  const empty = await settleAdminCentresLoad(async () => []);
  assert.deepEqual(empty, { ok: true, list: [] });

  const failed = await settleAdminCentresLoad(async () => {
    throw new Error(ADMIN_IDLE_TIMEOUT_MESSAGE);
  });
  assert.deepEqual(failed, { ok: false, error: ADMIN_IDLE_TIMEOUT_MESSAGE });
});

test("admin refresh does not swallow listAdminCentres as an empty queue", () => {
  const admin = src("src/routes/admin.tsx");
  const incomplete = src("src/components/admin-incomplete.tsx");
  assert.doesNotMatch(admin, /listAdminCentres\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(admin, /settleAdminCentresLoad\(\(\) => listAdminCentres\(\)\)/);
  assert.match(admin, /data-ke="admin-centres-error"/);
  assert.match(admin, /Waiting and Incomplete counts are unavailable/);
  assert.match(admin, /queueUnavailable/);
  assert.match(incomplete, /error\?: string \| null/);
  assert.match(incomplete, /loadFailed/);
});
