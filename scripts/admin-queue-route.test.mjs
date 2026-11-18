import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { adminDeskGateRedirect } from "../src/lib/admin-desk-gate.ts";
import { withTimeout } from "../src/lib/timeout.ts";
const require = createRequire(import.meta.url);
function route({
  enabled = false,
  failGate,
  load = async () => ({ counts: { status: "unavailable" } }),
} = {}) {
  let calls = 0;
  const deps = {
    "@tanstack/react-router": {
      notFound: () => new Error("synthetic-404"),
      redirect: (destination) => Object.assign(new Error("synthetic-redirect"), { destination }),
    },
    "@/lib/admin-desk-gate": { adminDeskGateRedirect },
    "@/lib/server/roles": {
      assertAdminDesk: async () => {
        if (failGate) throw failGate;
        return { ok: true, queueSsrEnabled: enabled };
      },
    },
    "@/lib/server/admin-queue-bootstrap": {
      loadAdminQueueBootstrap: async () => {
        calls += 1;
        return load();
      },
    },
    "@/lib/timeout": { withTimeout, SQL_SETTLE_MS: 10 },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/server/admin-route.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new vm.Script(code).runInNewContext({
    module,
    exports: module.exports,
    require: (name) => deps[name] ?? require(name),
  });
  return { ...module.exports, calls: () => calls };
}

test("disabled admin queue loader makes no bootstrap request", async () => {
  const actual = route();
  const context = await actual.beforeLoadAdminDesk();
  assert.equal(context.adminQueueSsrEnabled, false);
  assert.equal(await actual.loadAdminQueueForRoute(context), null);
  assert.equal(actual.calls(), 0);
});

test("enabled route returns only the result of its independently authenticated bootstrap", async () => {
  const result = { viewerId: "synthetic-admin", counts: { status: "unavailable" } };
  const actual = route({ enabled: true, load: async () => result });
  assert.equal(await actual.loadAdminQueueForRoute(await actual.beforeLoadAdminDesk()), result);
  assert.equal(actual.calls(), 1);
});

for (const message of [
  "Unauthorized",
  "Not authorized",
  "Admin session timed out. Sign in again.",
  "Two-factor verification required",
]) {
  test(`before-load and loader retain existing routing for ${message}`, async () => {
    for (const stage of ["gate", "loader"]) {
      const error = new Error(message);
      const actual = route({
        enabled: true,
        failGate: stage === "gate" ? error : undefined,
        load: async () => {
          throw error;
        },
      });
      const pending =
        stage === "gate"
          ? actual.beforeLoadAdminDesk()
          : actual.loadAdminQueueForRoute({ adminQueueSsrEnabled: true });
      await assert.rejects(pending, (failure) => {
        if (message.includes("Two-factor")) {
          assert.equal(failure.destination.to, "/verify-2fa");
          assert.equal(failure.destination.search.next, "/admin");
        } else assert.equal(failure.message, "synthetic-404");
        return true;
      });
    }
  });
}

test("loader timeout bounds the whole middleware request and ignores a later result", async () => {
  let finish;
  const actual = route({
    enabled: true,
    load: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await assert.rejects(
    actual.loadAdminQueueForRoute({ adminQueueSsrEnabled: true }),
    /synthetic-404/,
  );
  finish({ viewerId: "synthetic-late-admin", counts: { status: "ready", all: 4321 } });
  assert.equal(actual.calls(), 1);
});
