import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { cronAuthorized } from "../src/lib/cron-auth.ts";

function load(path, dependencies) {
  const module = { exports: {} };
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    return new Proxy({}, { get: () => () => { throw new Error(`Unexpected dependency call: ${name}`); } });
  };
  new Function("require", "module", "exports", output)(require, module, module.exports);
  return module.exports;
}

function route({ enabled = true, result = { ok: true, skipped: false, synced: 2, sent: 0 }, error } = {}) {
  const calls = [];
  const { Route } = load("src/routes/api/centre-lead-alerts.ts", {
    "@tanstack/react-router": { createFileRoute: () => (options) => options },
    "@/lib/cron-auth": { cronAuthorized: (request) => cronAuthorized(request, "synthetic-cron-secret") },
    "@/lib/features": { centreLeadTrackerEnabled: () => enabled },
    "@/lib/server/centre-leads": { runCentreLeadJobs: async () => { calls.push("worker"); if (error) throw error; return result; } },
  });
  return { calls, handlers: Route.server.handlers };
}

const request = (authorization = "Bearer synthetic-cron-secret") => new Request("https://tracker-cron.invalid/api/centre-lead-alerts", { headers: authorization ? { authorization } : {} });

test("tracker endpoint remains inert while the existing tracker flag is off", async () => {
  const r = route({ enabled: false });
  for (const method of ["GET", "POST"]) {
    const response = await r.handlers[method]({ request: request("") });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, skipped: true, reason: "flag" });
  }
  assert.deepEqual(r.calls, []);
});

test("tracker endpoint requires exact bearer auth before the worker runs", async () => {
  const r = route();
  for (const method of ["GET", "POST"]) {
    for (const auth of ["", "Bearer wrong", "Bearer synthetic-cron-secret-extra"]) {
      assert.equal((await r.handlers[method]({ request: request(auth) })).status, 401);
    }
  }
  assert.deepEqual(r.calls, []);
});

test("tracker endpoint reports failed batches as service failures and preserves healthy busy skips", async () => {
  for (const [result, status] of [
    [{ ok: false, skipped: false, failed: 1, synced: 19, sent: 0 }, 503],
    [{ ok: false, skipped: true, reason: "lease_lost", synced: 0, sent: 0 }, 503],
    [{ ok: true, skipped: true, reason: "busy", synced: 0, sent: 0 }, 200],
    [{ ok: true, skipped: false, synced: 20, sent: 0 }, 200],
  ]) {
    const r = route({ result });
    const response = await r.handlers.GET({ request: request() });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), result);
    assert.deepEqual(r.calls, ["worker"]);
  }
});

test("tracker coordination errors propagate instead of a successful empty batch", async () => {
  const r = route({ error: new Error("synthetic database failure") });
  await assert.rejects(r.handlers.POST({ request: request() }), /synthetic database failure/);
});

test("existing worker preserves flag-off and API delivery gates while delegating fair batching", async () => {
  const calls = [];
  let tracker = false;
  let api = false;
  let callbacks;
  const sql = async () => [];
  const chain = () => ({ middleware: chain, validator: chain, handler: (fn) => fn });
  const h = load("src/lib/server/centre-leads.ts", {
    "@tanstack/react-start": { createServerFn: chain },
    "@/lib/features": { centreLeadTrackerEnabled: () => tracker, centreApiEnabled: () => api },
    "@/lib/db": { getSql: async () => { calls.push("sql"); return sql; } },
    "@/lib/centre-leads": { isHiddenLeadCentre: (id) => id === "qa-reviewer-demo" },
    "@/lib/server/centre-lead-worker-batch": {
      withCentreLeadWorkerBatch: async (received, options) => {
        assert.equal(received, sql);
        callbacks = options;
        calls.push("batch");
        return { ok: true, skipped: false, attempted: 0, synced: 0, sent: await options.finish() };
      },
    },
  });
  assert.deepEqual(await h.runCentreLeadJobs(), { ok: true, skipped: true, reason: "flag" });
  assert.deepEqual(calls, []);
  tracker = true;
  await h.runCentreLeadJobs();
  assert.deepEqual(calls, ["sql", "batch"]);
  assert.equal(callbacks.shouldSkip("qa-reviewer-demo"), true);
  assert.equal(typeof callbacks.processCentre, "function");
  // Empty synthetic webhook SQL means no network delivery even when its existing flag is on.
  api = true;
  await h.runCentreLeadJobs(() => { throw new Error("Unexpected network call"); });
  assert.deepEqual(calls, ["sql", "batch", "sql", "batch"]);
});
