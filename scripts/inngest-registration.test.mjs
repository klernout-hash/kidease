import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as scheduling from "../src/lib/inngest.ts";
import { selectRegisteredFunctions, TOUR_SCHEDULER_ACTIVATED } from "../src/inngest/registry.ts";

function evaluate(relative, imports) {
  const path = new URL(`../${relative}`, import.meta.url);
  const javascript = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    Response,
    console,
    require: (name) => {
      assert.ok(name in imports, `unexpected import ${name}`);
      return imports[name];
    },
  });
  new vm.Script(javascript, { filename: path.pathname }).runInContext(context);
  return context.exports;
}

function definitions({ configured = false, outcome = { fixture: true, ok: true } } = {}) {
  const calls = [];
  const source = readFileSync(new URL("../src/inngest/functions.ts", import.meta.url), "utf8");
  const imports = {
    "@/lib/inngest": { ...scheduling, inngestConfigured: () => configured },
    "./registry": { selectRegisteredFunctions, TOUR_SCHEDULER_ACTIVATED },
    "./client": { inngest: { createFunction: (options, handler) => ({ options, handler }) } },
  };
  for (const match of source.matchAll(/from "(@\/lib\/server\/[^"]+)"/g)) {
    imports[match[1]] = new Proxy(
      {},
      {
        get: (_, name) => async (input) => {
          calls.push({ name, input });
          return outcome;
        },
      },
    );
  }
  return { exported: evaluate("src/inngest/functions.ts", imports), calls };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("the real served registry is search only with a checked-in default-off tour gate", () => {
  assert.equal(TOUR_SCHEDULER_ACTIVATED, false);
  for (const configured of [false, true]) {
    const { exported, calls } = definitions({ configured });
    assert.deepEqual(
      exported.functions.map((fn) => fn.options.id),
      ["search-alerts-hourly"],
    );
    assert.equal(calls.length, 0, "defining or registering functions must not execute jobs");
    assert.equal(Object.values(exported).filter((item) => item?.options?.id).length, 17);
    assert.equal(exported.functions[0], exported.searchAlertsHourly);
  }
});

test("the prepared tour wrapper preserves its step and forwards a failed phase result honestly", async () => {
  const outcome = { ok: false, expiry: { status: "failed" }, reminders: { status: "flag_off" } };
  const { exported, calls } = definitions({ outcome });
  const steps = [];
  const result = await exported.expireTourHoldsHourly.handler({
    event: { data: { dryRun: true } },
    step: {
      run: async (name, body) => {
        steps.push(name);
        return body();
      },
    },
  });
  assert.equal(result, outcome);
  assert.deepEqual(steps, ["expire-tour-holds"]);
  assert.deepEqual(plain(calls), [{ name: "runExpireTourHoldsJob", input: { dryRun: true } }]);
});

test("deliberate tour opt-in exposes exactly search and tour without admitting unrelated jobs", () => {
  const { exported, calls } = definitions();
  const selected = selectRegisteredFunctions(
    exported.searchAlertsHourly,
    exported.expireTourHoldsHourly,
    {
      tourActivated: true,
      inngestConfigured: true,
    },
  );
  assert.deepEqual(
    selected.map((fn) => fn.options.id),
    ["search-alerts-hourly", "tour-holds-hourly"],
  );
  assert.deepEqual(plain(exported.expireTourHoldsHourly.options.triggers), [
    { cron: "TZ=America/Winnipeg 50 * * * *" },
    { event: "kidease/tour-holds.expire" },
  ]);
  assert.deepEqual(plain(exported.expireTourHoldsHourly.options.concurrency), { limit: 1 });
  assert.equal(calls.length, 0);
  for (const options of [
    {},
    { tourActivated: true },
    { inngestConfigured: true },
    { tourActivated: true, inngestConfigured: false },
  ]) {
    assert.deepEqual(
      selectRegisteredFunctions(
        exported.searchAlertsHourly,
        exported.expireTourHoldsHourly,
        options,
      ).map((fn) => fn.options.id),
      ["search-alerts-hourly"],
    );
  }
});

test("the actual serve route receives only the approved registry and stable app identity", () => {
  const { exported } = definitions();
  const client = { id: scheduling.INNGEST_APP_ID };
  const served = [];
  evaluate("src/routes/api/inngest.ts", {
    "@tanstack/react-router": { createFileRoute: (path) => (options) => ({ path, ...options }) },
    "inngest/edge": {
      serve: (options) => {
        served.push(options);
        return async () => new Response();
      },
    },
    "@/inngest/functions": { functions: exported.functions },
    "@/inngest/client": { inngest: client },
  });
  assert.equal(served.length, 1);
  assert.equal(served[0].client.id, "kidease");
  assert.equal(served[0].functions, exported.functions);
  assert.deepEqual(
    served[0].functions.map((fn) => fn.options.id),
    ["search-alerts-hourly"],
  );
});

test("existing search triggers, step identity and dry-run forwarding remain unchanged", async () => {
  for (const event of [undefined, { data: {} }, { data: { dryRun: true } }]) {
    const { exported, calls } = definitions();
    assert.equal(exported.searchAlertsHourly.options.id, "search-alerts-hourly");
    assert.deepEqual(plain(exported.searchAlertsHourly.options.triggers), [
      { cron: "TZ=America/Winnipeg 20 * * * *" },
      { event: "kidease/search-alerts.run" },
    ]);
    const steps = [];
    await exported.searchAlertsHourly.handler({
      event,
      step: {
        run: async (name, body) => {
          steps.push(name);
          return body();
        },
      },
    });
    assert.deepEqual(steps, ["run-search-alert-job"]);
    assert.deepEqual(plain(calls), [
      { name: "runSearchAlertJob", input: { dryRun: Boolean(event?.data?.dryRun) } },
    ]);
  }
});

test("registration readiness does not activate Vercel tour fallback or change search ownership", () => {
  const environments = [
    {},
    { INNGEST_EVENT_KEY: "fixture-event" },
    { INNGEST_SIGNING_KEY: "fixture-signing" },
    { INNGEST_EVENT_KEY: "fixture-event", INNGEST_SIGNING_KEY: "fixture-signing" },
  ];
  for (const env of environments) {
    for (const [query, bypass] of [
      ["", false],
      ["?dryRun=1", true],
      ["?force=1", true],
      ["?force=0", false],
    ]) {
      const expected = Boolean(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY) && !bypass;
      assert.equal(
        scheduling.shouldDeferSearchAlertsToInngest(
          new Request(`https://example.test/api/search-alerts${query}`),
          env,
        ),
        expected,
      );
      assert.equal(
        scheduling.shouldDeferTourHoldsToInngest(
          new Request(`https://example.test/api/tour-holds${query}`),
          env,
        ),
        expected,
      );
    }
  }
});
