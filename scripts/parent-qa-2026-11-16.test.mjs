import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { eceJobsEnabled } from "../src/lib/features.ts";
import { buildContentSecurityPolicy } from "./csp.mjs";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("an explicit ECE jobs env value wins over a remote flag", () => {
  assert.equal(eceJobsEnabled({}), false);
  assert.equal(eceJobsEnabled({ FEATURE_ECE_JOBS: "1" }), true);
  assert.equal(eceJobsEnabled({ FEATURE_ECE_JOBS: "0" }), false);
  const jobs = src("src/routes/jobs.tsx");
  assert.match(jobs, /loadJobsPage/);
  assert.match(jobs, /jobsLeadLive/);
  assert.match(jobs, /initialEnabled/);
  assert.match(src("src/routes/fr.jobs.tsx"), /loadJobsPage/);
  assert.match(src("src/lib/server/ece-jobs.ts"), /export async function publicEceJobRows/);
  assert.match(tx("en", "jobsLeadLive"), /licensed centres/i);
  assert.match(tx("fr", "jobsLeadLive"), /centres autorisés/i);
  assert.doesNotMatch(tx("en", "jobsLeadLive"), /not a job board/i);
});

test("French desk titles follow the French URL", () => {
  assert.match(src("src/routes/parent.tsx"), /Espace parent/);
  assert.match(src("src/routes/inbox.tsx"), /Messages de la famille/);
  assert.match(src("src/routes/account.tsx"), /Compte · KidEase/);
  assert.match(src("src/routes/provider.tsx"), /Espace garderie/);
  assert.match(src("src/routes/support.tsx"), /Soutien · KidEase/);
  assert.match(src("src/routes/menu.tsx"), /Compte, aide et le reste de KidEase/);
});

test("phone search chips stay clear of the help button", () => {
  const css = src("src/styles.css");
  assert.match(css, /data-ke="daycare-type-menu"/);
  assert.match(css, /data-ke="msv2-result-chips"/);
  assert.match(css, /data-ke="explore-filter-bar"/);
  assert.match(css, /padding-right: 4\.75rem/);
});

test("Turnstile challenge hosts stay on connect-src with data", () => {
  const csp = buildContentSecurityPolicy("abc+123/XYZ=");
  assert.match(csp, /connect-src 'self' data:/);
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src[^;]*https:\/\/\*\.challenges\.cloudflare\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/\*\.challenges\.cloudflare\.com/);
});
