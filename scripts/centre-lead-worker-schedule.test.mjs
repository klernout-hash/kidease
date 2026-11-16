import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as scheduling from "../src/lib/inngest.ts";
import { selectRegisteredFunctions, TOUR_SCHEDULER_ACTIVATED } from "../src/inngest/registry.ts";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/inngest/centre-lead-worker.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Execute the real TypeScript factory with an allowlist of local mocks. No
// database, SDK registration, flag refresh, or notification code is imported.
function fixture({
  env = {},
  trackerOn = true,
  result = { ok: true, skipped: false, synced: 1, sent: 0 },
} = {}) {
  const calls = { registration: [], worker: [], steps: [], flags: 0 };
  const state = { trackerOn, result };
  const dependencies = {
    "@/lib/features": {
      centreLeadTrackerEnabled: () => {
        calls.flags++;
        return state.trackerOn;
      },
    },
    "@/lib/server/centre-leads": {
      runCentreLeadJobs: async (...args) => {
        calls.worker.push(args);
        if (state.result instanceof Error) throw state.result;
        return state.result;
      },
    },
    "./client": {
      inngest: {
        createFunction: (options, handler) => {
          calls.registration.push(options);
          return { options, handler };
        },
      },
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    process: { env },
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  const step = {
    run: async (name, fn) => {
      calls.steps.push(name);
      return fn();
    },
  };
  return { ...exports, calls, state, env, step };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const event = { id: "scheduled-occurrence-1" };

test("the served registry does not admit tracker even when its environment opt-in is set", () => {
  const source = readFileSync(new URL("../src/inngest/functions.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const value of [undefined, "0", "1", "true"]) {
    const exports = {};
    const jobs = [];
    const dependencies = {
      "@/lib/inngest": { ...scheduling, inngestConfigured: () => true },
      "./registry": { selectRegisteredFunctions, TOUR_SCHEDULER_ACTIVATED },
      "./client": { inngest: { createFunction: (options, handler) => ({ options, handler }) } },
    };
    for (const match of source.matchAll(/from "(@\/lib\/server\/[^"]+)"/g)) {
      dependencies[match[1]] = new Proxy(
        {},
        {
          get:
            (_, name) =>
            (...args) => {
              jobs.push({ name, args });
            },
        },
      );
    }
    runInNewContext(javascript, {
      exports,
      process: { env: { CENTRE_LEAD_WORKER_SCHEDULE: value } },
      require: (name) => {
        assert.ok(Object.hasOwn(dependencies, name), `Unapproved serving dependency: ${name}`);
        return dependencies[name];
      },
    });
    assert.equal(TOUR_SCHEDULER_ACTIVATED, false);
    assert.deepEqual(
      exports.functions.map((fn) => fn.options.id),
      ["search-alerts-hourly"],
    );
    assert.deepEqual(
      selectRegisteredFunctions(exports.searchAlertsHourly, exports.expireTourHoldsHourly, {
        tourActivated: true,
        inngestConfigured: true,
      }).map((fn) => fn.options.id),
      ["search-alerts-hourly", "tour-holds-hourly"],
    );
    assert.deepEqual(jobs, []);
  }
});

test("tracker schedule is absent unless its new opt-in is exactly 1", () => {
  for (const value of [undefined, "", "0", "true", "yes", "01", " 1", "1 ", "typo"]) {
    const env = value === undefined ? {} : { CENTRE_LEAD_WORKER_SCHEDULE: value };
    const app = fixture({ env });
    assert.deepEqual(plain(app.createCentreLeadWorkerFunctions()), []);
    assert.deepEqual(app.calls.registration, []);
    assert.deepEqual(app.calls.worker, []);
    assert.equal(app.calls.flags, 0);
  }
});

test("opt-in creates only an hourly cron with bounded concurrency and no automatic retries", () => {
  const app = fixture({ env: { CENTRE_LEAD_WORKER_SCHEDULE: "1" }, trackerOn: false });
  const functions = app.createCentreLeadWorkerFunctions();
  assert.equal(functions.length, 1);
  assert.equal(app.calls.flags, 0, "cold feature overlays do not decide registration");
  assert.equal(app.CENTRE_LEAD_WORKER_CRON, "TZ=America/Winnipeg 10 * * * *");
  assert.deepEqual(plain(functions[0].options), {
    id: "centre-lead-worker-hourly",
    name: "Centre lead worker (hourly)",
    triggers: [{ cron: app.CENTRE_LEAD_WORKER_CRON }],
    concurrency: 1,
    idempotency: "event.id",
    retries: 0,
  });
  assert.deepEqual(app.calls.worker, []);
});

test("registered handler rechecks schedule and tracker kill switches before touching the worker", async () => {
  const app = fixture({ env: { CENTRE_LEAD_WORKER_SCHEDULE: "1" } });
  const [worker] = app.createCentreLeadWorkerFunctions();
  app.env.CENTRE_LEAD_WORKER_SCHEDULE = "0";
  assert.deepEqual(plain(await worker.handler({ event, step: app.step })), {
    ok: true,
    skipped: true,
    reason: "schedule",
  });
  assert.equal(app.calls.flags, 0);
  app.env.CENTRE_LEAD_WORKER_SCHEDULE = "1";
  app.state.trackerOn = false;
  assert.deepEqual(plain(await worker.handler({ event, step: app.step })), {
    ok: true,
    skipped: true,
    reason: "flag",
  });
  assert.deepEqual(app.calls.steps, []);
  assert.deepEqual(app.calls.worker, []);
});

test("missing scheduled event identifiers fail before durable work rather than inventing an id", async () => {
  const app = fixture({ env: { CENTRE_LEAD_WORKER_SCHEDULE: "1" } });
  const [worker] = app.createCentreLeadWorkerFunctions();
  for (const missing of [undefined, {}, { id: "" }, { id: " " }, { id: 3 }]) {
    await assert.rejects(
      worker.handler({ event: missing, step: app.step }),
      /Missing centre lead worker event id/,
    );
  }
  assert.deepEqual(app.calls.steps, []);
  assert.deepEqual(app.calls.worker, []);
});

test("enabled scheduled execution uses one durable step and the existing no-argument worker", async () => {
  const app = fixture({ env: { CENTRE_LEAD_WORKER_SCHEDULE: "1" } });
  const [worker] = app.createCentreLeadWorkerFunctions();
  const result = await worker.handler({ event, step: app.step });
  assert.deepEqual(result, app.state.result);
  assert.deepEqual(app.calls.steps, ["run-centre-lead-worker"]);
  assert.deepEqual(app.calls.worker, [[]]);
});

test("worker failures remain scheduler failures while busy skips remain successful", async () => {
  const app = fixture({
    env: { CENTRE_LEAD_WORKER_SCHEDULE: "1" },
    result: { ok: false, skipped: false, synced: 0, failed: 1 },
  });
  const [worker] = app.createCentreLeadWorkerFunctions();
  await assert.rejects(worker.handler({ event, step: app.step }), /Centre lead worker failed/);
  app.state.result = new Error("local fixture failure");
  await assert.rejects(worker.handler({ event, step: app.step }), /local fixture failure/);
  app.state.result = { ok: true, skipped: true, reason: "busy" };
  assert.deepEqual(await worker.handler({ event, step: app.step }), app.state.result);
  assert.equal(app.calls.worker.length, 3);
});
