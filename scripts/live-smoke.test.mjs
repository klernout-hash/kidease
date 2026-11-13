import assert from "node:assert/strict";
import { test } from "node:test";
import {
  judgeProbe,
  previousReadyDeployment,
  rollbackRequest,
  runLiveSmoke,
  smokeConfig,
} from "./live-smoke.mjs";

test("live smoke stays public and rolls back only when Kyle set the secrets", () => {
  const bare = smokeConfig({});
  assert.equal(bare.base, "https://www.kidease.ca");
  assert.equal(bare.canRollback, false);
  assert.equal(bare.token, "");
  const ready = smokeConfig({ VERCEL_TOKEN: "token", VERCEL_PROJECT_ID: "prj_123", VERCEL_ORG_ID: "team_1" });
  assert.equal(ready.canRollback, true);
  const request = rollbackRequest(ready, "dpl_old");
  assert.match(request.url, /\/v1\/projects\/prj_123\/rollback\/dpl_old/);
  assert.match(request.url, /teamId=team_1/);
  assert.match(request.init.headers.Authorization, /^Bearer token$/);
  const target = previousReadyDeployment([
    { uid: "dpl_new", readyState: "READY", target: "production", created: 20 },
    { uid: "dpl_old", readyState: "READY", target: "production", created: 10 },
    { uid: "dpl_bad", readyState: "ERROR", target: "production", created: 30 },
  ]);
  assert.equal(target.previousId, "dpl_old");
  assert.equal(target.currentId, "dpl_new");
});

test("probes reject the error screen and accept the sign-in redirect", () => {
  const home = { statuses: [200], must: /KidEase/i, forbid: /Something went wrong/i };
  assert.equal(judgeProbe(home, { status: 200, body: "KidEase", location: "" }), "");
  assert.match(judgeProbe(home, { status: 200, body: "Something went wrong", location: "" }), /error screen/);
  const redirect = { statuses: [301, 302, 307, 308], location: /\/login(?:\?|$)/ };
  assert.equal(judgeProbe(redirect, { status: 301, body: "", location: "/login?next=/parent" }), "");
  assert.match(judgeProbe(redirect, { status: 200, body: "", location: "" }), /status 200/);
});

function publicFetch(paths, robotsBody = "User-agent: *\nDisallow: /admin\n") {
  return async (url, init) => {
    const path = new URL(url).pathname;
    paths.push(path);
    assert.equal(init.redirect, "manual");
    assert.ok(!init.method || init.method === "GET");
    assert.equal(init.body, undefined);
    const redirect = path === "/sign-in" ? "/login" : path === "/sign-up" ? "/signup" : "";
    return {
      status: redirect ? 302 : 200,
      text: async () => path === "/robots.txt" ? robotsBody : "KidEase",
      headers: { get: (name) => name === "location" ? redirect : null },
    };
  };
}

test("automatic public smoke checks static robots without calling the mutative health route", async () => {
  const paths = [];
  const verdict = await runLiveSmoke({
    env: { SMOKE_BASE_URL: "https://smoke.invalid" },
    fetchImpl: publicFetch(paths),
    log: () => {},
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.rolledBack, false);
  assert.deepEqual(paths, ["/", "/login", "/fr/login", "/robots.txt", "/sign-in", "/sign-up"]);
  assert.ok(paths.every((path) => !path.startsWith("/api/")));
});

test("static robots probe rejects a health-shaped response without running rollback or another route", async () => {
  const paths = [];
  const verdict = await runLiveSmoke({
    env: { SMOKE_BASE_URL: "https://smoke.invalid" },
    fetchImpl: publicFetch(paths, '{"status":"ok"}'),
    log: () => {},
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.rolledBack, false);
  assert.deepEqual(verdict.results.filter((row) => !row.ok).map((row) => row.name), ["robots"]);
  assert.deepEqual(paths, ["/", "/login", "/fr/login", "/robots.txt", "/sign-in", "/sign-up"]);
});
