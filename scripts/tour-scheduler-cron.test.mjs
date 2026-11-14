import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { cronAuthorized } from "../src/lib/cron-auth.ts";
import { shouldDeferTourHoldsToInngest } from "../src/lib/inngest.ts";

class FixtureExpiryError extends Error {
  constructor(result) {
    super("Tour hold expiry scan failed");
    this.result = result;
  }
}

function harness({ env = {}, outcome = { ok: true, expired: 0, dryRun: false }, error } = {}) {
  const state = { jobs: [], security: [], heartbeats: [] };
  const imports = {
    "@tanstack/react-router": { createFileRoute: () => (options) => options },
    "@/lib/cron-auth": { cronAuthorized: (request) => cronAuthorized(request, "fixture-secret") },
    "@/lib/inngest": {
      shouldDeferTourHoldsToInngest: (request) => shouldDeferTourHoldsToInngest(request, env),
    },
    "@/lib/server/cron-heartbeat": {
      pingCronHeartbeat: async (name) => {
        state.heartbeats.push(name);
      },
    },
    "@/lib/server/security-events": {
      requestIp: () => "local-fixture",
      logSecurityEvent: async (event) => {
        state.security.push(event);
      },
    },
    "@/lib/server/tour-holds": {
      TourHoldExpiryError: FixtureExpiryError,
      runExpireTourHoldsJob: async (input) => {
        state.jobs.push(input);
        if (error) throw error;
        return outcome;
      },
    },
  };
  const source = readFileSync(new URL("../src/routes/api/tour-holds.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    URL,
    Request,
    Response,
    require: (name) => {
      assert.ok(name in imports, `unexpected import ${name}`);
      return imports[name];
    },
  });
  new vm.Script(javascript).runInContext(context);
  return {
    state,
    dispatch: (query = "", { method = "GET", bearer = "fixture-secret" } = {}) => {
      const request = new Request(`https://example.test/api/tour-holds${query}`, {
        method,
        headers: bearer == null ? {} : { authorization: `Bearer ${bearer}` },
      });
      return context.exports.Route.server.handlers[method]({ request });
    },
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const bothKeys = { INNGEST_EVENT_KEY: "fixture-event", INNGEST_SIGNING_KEY: "fixture-signing" };

test("tour cron authorizes before worker, ownership overrides or heartbeat on GET and POST", async () => {
  for (const method of ["GET", "POST"]) {
    for (const query of ["", "?dryRun=1", "?force=1", "?secret=fixture-secret"]) {
      for (const bearer of [null, "wrong"]) {
        const h = harness({ env: bothKeys });
        assert.equal((await h.dispatch(query, { method, bearer })).status, 401);
        assert.equal(h.state.jobs.length, 0);
        assert.equal(h.state.heartbeats.length, 0);
        assert.equal(h.state.security[0].kind, "tour_holds_denied");
      }
    }
  }
});

test("keys still defer the tour cron without claiming registration or execution", async () => {
  const h = harness({ env: bothKeys });
  const response = await h.dispatch();
  assert.deepEqual(await response.json(), {
    ok: true,
    skipped: true,
    via: "inngest",
    reason: "inngest-configured-registration-unverified",
  });
  assert.equal(h.state.jobs.length, 0);
  assert.equal(h.state.heartbeats.length, 0);
  assert.equal(h.state.security[0].detail, "deferred-inngest");
});

test("existing missing-key fallback and authorized force behavior are retained", async () => {
  for (const env of [
    {},
    { INNGEST_EVENT_KEY: "fixture-event" },
    { INNGEST_SIGNING_KEY: "fixture-signing" },
  ]) {
    const h = harness({ env });
    assert.equal((await h.dispatch()).status, 200);
    assert.deepEqual(plain(h.state.jobs), [{ dryRun: false }]);
    assert.deepEqual(h.state.heartbeats, ["tour-holds"]);
  }
  const forced = harness({ env: bothKeys });
  assert.equal((await forced.dispatch("?force=1")).status, 200);
  assert.deepEqual(plain(forced.state.jobs), [{ dryRun: false }]);
});

test("authorized dry-run forwards the mode but never records a live heartbeat", async () => {
  const h = harness({ env: bothKeys, outcome: { ok: true, expired: 2, dryRun: true } });
  assert.equal((await h.dispatch("?dryRun=1")).status, 200);
  assert.deepEqual(plain(h.state.jobs), [{ dryRun: true }]);
  assert.equal(h.state.heartbeats.length, 0);
  assert.equal(h.state.security[0].detail, "dry-run");
});

test("partial expiry or reminder failures are non-success responses with no heartbeat", async () => {
  for (const phase of ["expiry", "reminders"]) {
    const outcome = { ok: false, expired: 1, dryRun: false, [phase]: { status: "failed" } };
    const h = harness({ outcome });
    const response = await h.dispatch();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), outcome);
    assert.equal(h.state.heartbeats.length, 0);
    assert.equal(h.state.security[0].detail, "failed");
  }
});

test("scan or claim exceptions retain sanitized phase evidence without driver or recipient detail", async () => {
  const result = {
    ok: false,
    expired: 0,
    dryRun: false,
    expiry: { status: "failed", failures: { scan: 1 } },
  };
  const typed = harness({ error: new FixtureExpiryError(result) });
  const response = await typed.dispatch();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), result);
  assert.equal(typed.state.heartbeats.length, 0);
  const unknown = harness({ error: new Error("sensitive-driver-connection-and-recipient") });
  const failed = await unknown.dispatch();
  assert.equal(failed.status, 503);
  const body = await failed.text();
  assert.doesNotMatch(body, /sensitive|connection|recipient/);
  assert.deepEqual(JSON.parse(body), { ok: false, error: "tour-holds-failed", dryRun: false });
  assert.equal(unknown.state.heartbeats.length, 0);
});
