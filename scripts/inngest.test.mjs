import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INNGEST_APP_ID,
  INNGEST_ENV_NAMES,
  SEARCH_ALERTS_CRON,
  SEARCH_ALERTS_EVENT,
  inngestConfigured,
  shouldDeferSearchAlertsToInngest,
} from "../src/lib/inngest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Inngest is off when keys are missing and on only with both keys", () => {
  assert.equal(inngestConfigured({}), false);
  assert.equal(inngestConfigured({ INNGEST_EVENT_KEY: "", INNGEST_SIGNING_KEY: "" }), false);
  assert.equal(inngestConfigured({ INNGEST_EVENT_KEY: "evt_x" }), false);
  assert.equal(inngestConfigured({ INNGEST_SIGNING_KEY: "sign_x" }), false);
  assert.equal(
    inngestConfigured({ INNGEST_EVENT_KEY: "evt_x", INNGEST_SIGNING_KEY: "sign_x" }),
    true,
  );
  assert.equal(INNGEST_APP_ID, "kidease");
  assert.deepEqual([...INNGEST_ENV_NAMES], ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"]);
});

test("Vercel search-alerts cron defers to Inngest unless dryRun or force", () => {
  const env = { INNGEST_EVENT_KEY: "evt_x", INNGEST_SIGNING_KEY: "sign_x" };
  const hourly = new Request("https://www.kidease.ca/api/search-alerts");
  const dry = new Request("https://www.kidease.ca/api/search-alerts?dryRun=1");
  const force = new Request("https://www.kidease.ca/api/search-alerts?force=1");
  assert.equal(shouldDeferSearchAlertsToInngest(hourly, env), true);
  assert.equal(shouldDeferSearchAlertsToInngest(dry, env), false);
  assert.equal(shouldDeferSearchAlertsToInngest(force, env), false);
  assert.equal(shouldDeferSearchAlertsToInngest(hourly, {}), false);
});

test("TanStack Start serve route uses inngest/edge and wraps search-alerts", () => {
  const route = src("src/routes/api/inngest.ts");
  const fns = src("src/inngest/functions.ts");
  const client = src("src/inngest/client.ts");
  const cron = src("src/routes/api/search-alerts.ts");
  const tree = src("src/routeTree.gen.ts");
  assert.match(route, /createFileRoute\("\/api\/inngest"\)/);
  assert.match(route, /from "inngest\/edge"/);
  assert.match(route, /GET:/);
  assert.match(route, /POST:/);
  assert.match(route, /PUT:/);
  assert.doesNotMatch(route, /from "inngest\/next"/);
  assert.doesNotMatch(route, /export const \{ GET, POST, PUT \} = serve/);
  assert.match(client, /new Inngest\(\{ id: INNGEST_APP_ID \}\)/);
  assert.match(client, /does not throw/);
  assert.match(route, /inngest serve failed/);
  assert.match(fns, /search-alerts-hourly/);
  assert.match(fns, /runSearchAlertJob/);
  assert.match(fns, /SEARCH_ALERTS_CRON/);
  assert.match(fns, /SEARCH_ALERTS_EVENT/);
  assert.equal(SEARCH_ALERTS_CRON, "TZ=America/Winnipeg 20 * * * *");
  assert.equal(SEARCH_ALERTS_EVENT, "kidease/search-alerts.run");
  assert.match(src("src/lib/inngest.ts"), /TZ=America\/Winnipeg 20 \* \* \* \*/);
  assert.match(fns, /FEATURE_PUSH stays off/);
  assert.match(cron, /shouldDeferSearchAlertsToInngest/);
  assert.match(cron, /runSearchAlertJob/);
  assert.match(cron, /cronAuthorized/);
  assert.match(tree, /api\/inngest/);
  assert.match(tree, /from '\.\/routes\/api\/inngest'/);
});

test("env example lists Inngest names only and does not flip SMS or push", () => {
  const envExample = src(".env.example");
  assert.match(envExample, /# INNGEST_EVENT_KEY=/);
  assert.match(envExample, /# INNGEST_SIGNING_KEY=/);
  assert.match(envExample, /# INNGEST_SERVE_ORIGIN=/);
  assert.doesNotMatch(envExample, /INNGEST_EVENT_KEY=\S+/);
  assert.doesNotMatch(envExample, /INNGEST_SIGNING_KEY=\S+/);
  assert.match(envExample, /^FEATURE_PUSH=0$/m);
  assert.match(envExample, /^FEATURE_SMS=0$/m);
  assert.doesNotMatch(envExample, /^FEATURE_PUSH=1$/m);
  assert.doesNotMatch(envExample, /^FEATURE_SMS=1$/m);
  const docs = src("docs/inngest.md");
  assert.match(docs, /kidease-git/);
  assert.match(docs, /INNGEST_EVENT_KEY/);
  assert.match(docs, /INNGEST_SIGNING_KEY/);
  assert.match(docs, /app\.inngest\.com/);
  assert.match(docs, /FEATURE_PUSH/);
  assert.match(docs, /FEATURE_SMS/);
  assert.match(src("SECURITY.md"), /\/api\/inngest/);
  assert.match(src("package.json"), /"inngest":/);
});
