import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { cronAuthorized } from "../src/lib/cron-auth.ts";
import {
  shouldDeferTourHoldsToInngest,
  TOUR_HOLDS_CRON,
  TOUR_HOLDS_EVENT,
} from "../src/lib/inngest.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const configured = { INNGEST_EVENT_KEY: "test-event-key", INNGEST_SIGNING_KEY: "test-signing-key" };
const secret = "test-cron-secret";

// Evaluate the shipped handler with local dependencies only: no database, SDK,
// heartbeat URL, or notification implementation can be reached by these tests.
function localRoute(env = {}) {
  const calls = { jobs: [], events: [], heartbeats: [], deferrals: 0 };
  const routeSource = stripTypeScriptTypes(source("src/routes/api/tour-holds.ts"))
    .replace(/^import .*;\n/gm, "")
    .replace("export const Route", "const Route");
  const route = runInNewContext(`${routeSource}\nRoute`, {
    Request,
    Response,
    URL,
    createFileRoute: (path) => {
      assert.equal(path, "/api/tour-holds");
      return (options) => options;
    },
    cronAuthorized: (request) => cronAuthorized(request, secret),
    requestIp: () => "127.0.0.1",
    logSecurityEvent: async (event) => calls.events.push(event),
    shouldDeferTourHoldsToInngest: (request) => {
      calls.deferrals++;
      return shouldDeferTourHoldsToInngest(request, env);
    },
    runExpireTourHoldsJob: async (input) => {
      calls.jobs.push({ ...input });
      return { ok: true, expired: 2, dryRun: input.dryRun };
    },
    pingCronHeartbeat: async (job) => calls.heartbeats.push(job),
  });
  return { handlers: route.server.handlers, calls };
}

function request(query = "", authorized = true) {
  return new Request(`https://tour-cron.invalid/api/tour-holds${query}`, {
    headers: authorized ? { authorization: `Bearer ${secret}` } : {},
  });
}

test("tour cron requires exact bearer authorization before deferral or worker execution", async () => {
  assert.equal(cronAuthorized(request(), ""), false);
  assert.equal(cronAuthorized(request("?secret=test-cron-secret", false), secret), false);
  assert.equal(
    cronAuthorized(
      new Request("https://tour-cron.invalid", {
        headers: { authorization: `Bearer ${secret}x` },
      }),
      secret,
    ),
    false,
  );
  for (const method of ["GET", "POST"]) {
    const { handlers, calls } = localRoute(configured);
    const response = await handlers[method]({ request: request("?force=1&dryRun=1", false) });
    assert.equal(response.status, 401);
    assert.equal(await response.text(), "Unauthorized");
    assert.equal(calls.deferrals, 0);
    assert.deepEqual(calls.jobs, []);
    assert.deepEqual(calls.heartbeats, []);
    assert.equal(calls.events.length, 1);
    assert.equal(calls.events[0].kind, "tour_holds_denied");
  }
});

test("tour cron defers with both Inngest keys without invoking the worker or heartbeat", async () => {
  for (const method of ["GET", "POST"]) {
    const { handlers, calls } = localRoute(configured);
    const response = await handlers[method]({ request: request() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      skipped: true,
      via: "inngest",
      reason: "inngest-owns-schedule",
    });
    assert.deepEqual(calls.jobs, []);
    assert.deepEqual(calls.heartbeats, []);
    assert.equal(calls.events[0].detail, "deferred-inngest");
  }
});

test("tour cron retains the authenticated fallback when either Inngest key is missing", async () => {
  for (const env of [
    {},
    { INNGEST_EVENT_KEY: "test-event-key" },
    { INNGEST_SIGNING_KEY: "test-signing-key" },
  ]) {
    const { handlers, calls } = localRoute(env);
    const response = await handlers.GET({ request: request() });
    assert.deepEqual(await response.json(), { ok: true, expired: 2, dryRun: false });
    assert.deepEqual(calls.jobs, [{ dryRun: false }]);
    assert.deepEqual(calls.heartbeats, ["tour-holds"]);
    assert.equal(calls.events[0].detail, "ok");
  }
});

test("tour cron passes dryRun through and force bypasses Inngest only after authorization", async () => {
  for (const [query, dryRun] of [
    ["?dryRun=1", true],
    ["?force=1", false],
    ["?force=1&dryRun=1", true],
  ]) {
    const { handlers, calls } = localRoute(configured);
    const response = await handlers.POST({ request: request(query) });
    assert.deepEqual(await response.json(), { ok: true, expired: 2, dryRun });
    assert.deepEqual(calls.jobs, [{ dryRun }]);
    assert.deepEqual(calls.heartbeats, ["tour-holds"]);
    assert.equal(calls.events[0].detail, dryRun ? "dry-run" : "ok");
  }
  assert.equal(shouldDeferTourHoldsToInngest(request("?dryRun=0&force=0"), configured), true);
});

test("both schedules retain hourly :50 and register the expiry/reminder worker", async () => {
  const vercel = JSON.parse(source("vercel.json"));
  assert.equal(
    vercel.crons.find((entry) => entry.path === "/api/tour-holds").schedule,
    "50 * * * *",
  );
  assert.equal(TOUR_HOLDS_CRON, "TZ=America/Winnipeg 50 * * * *");
  assert.equal(TOUR_HOLDS_EVENT, "kidease/tour-holds.expire");
  const functionsSource = source("src/inngest/functions.ts");
  const initializer = functionsSource.match(
    /export const expireTourHoldsHourly = [\s\S]*?(?=\nexport const )/,
  )?.[0];
  assert.ok(initializer, "tour worker initializer exists");
  const calls = [];
  const worker = runInNewContext(
    `${stripTypeScriptTypes(initializer).replace("export const", "const")}\nexpireTourHoldsHourly`,
    {
      TOUR_HOLDS_CRON,
      TOUR_HOLDS_EVENT,
      inngest: { createFunction: (options, handler) => ({ options, handler }) },
      runExpireTourHoldsJob: async (input) => {
        calls.push({ ...input });
        return { ok: true };
      },
    },
  );
  assert.equal(worker.options.id, "tour-holds-hourly");
  assert.equal(worker.options.triggers[0].cron, TOUR_HOLDS_CRON);
  assert.equal(worker.options.triggers[1].event, TOUR_HOLDS_EVENT);
  assert.match(functionsSource, /export const functions = \[[\s\S]*?expireTourHoldsHourly/);
  assert.match(source("src/routes/api/inngest.ts"), /serve\(\{\s*client: inngest,\s*functions,/);
  const step = {
    run: async (name, fn) => {
      assert.equal(name, "expire-tour-holds");
      return fn();
    },
  };
  await worker.handler({ event: {}, step });
  await worker.handler({ event: { data: { dryRun: true } }, step });
  assert.deepEqual(calls, [{ dryRun: false }, { dryRun: true }]);
});
