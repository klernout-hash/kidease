import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanEceNote, cleanEceRole, eceJobCopy, ecePostReady } from "../src/lib/ece-jobs.ts";
import { eceJobsEnabled } from "../src/lib/features.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("ECE jobs default off and do not charge", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_ECE_JOBS, false);
  assert.equal(eceJobsEnabled({}), false);
  assert.equal(eceJobsEnabled({ FEATURE_ECE_JOBS: "1" }), true);
  assert.equal(ecePostReady("  "), false);
  assert.equal(ecePostReady("ECE"), true);
  assert.equal(cleanEceRole("  ECE   lead  "), "ECE lead");
  assert.equal(cleanEceNote("a".repeat(400)).length, 280);
  assert.match(eceJobCopy("fr").help, /Aide/);
  assert.match(eceJobCopy("en").posted, /listing/);
  const server = read("src/lib/server/ece-jobs.ts");
  assert.match(server, /eceJobsEnabled/);
  assert.match(server, /job_applications/);
  assert.doesNotMatch(server, /stripe|SUBSCRIPTIONS_ENABLED|checkout/i);
  assert.match(read("src/routes/jobs.tsx"), /EceJobBoard/);
  assert.match(read("src/routes/daycare.$slug.tsx"), /EceJobApply/);
  assert.match(read("src/components/ece-job-board.tsx"), /localePath\("\/help"/);
  assert.match(read("migrations/0118_job_applications.sql"), /job_applications/);
  assert.match(read(".env.example"), /^FEATURE_ECE_JOBS=0$/m);
  assert.doesNotMatch(read(".env.example"), /^FEATURE_ECE_JOBS=1$/m);
});
