import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const publicPaths = ["/", "/login", "/fr/login", "/robots.txt", "/sign-in", "/sign-up"];
const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");

function publicResponse(url, { robotsBody = robots, robotsStatus = 200 } = {}) {
  const { origin, pathname } = new URL(url);
  assert.equal(origin, "https://www.kidease.ca");
  switch (pathname) {
    case "/": return new Response("KidEase");
    case "/login":
    case "/fr/login": return new Response("Sign in");
    case "/robots.txt": return new Response(robotsBody, { status: robotsStatus });
    case "/sign-in": return new Response(null, { status: 301, headers: { Location: "/login" } });
    case "/sign-up": return new Response(null, { status: 301, headers: { Location: "/signup" } });
    default: throw new Error(`Unexpected public smoke path ${pathname}`);
  }
}

function assertPublicRequests(requests) {
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), publicPaths);
  for (const { url, init } of requests) {
    assert.doesNotMatch(new URL(url).pathname, /(?:^|\/)(?:health|status)(?:\/|$)/i);
    assert.equal(init.method, undefined);
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers, undefined);
  }
}

test("successful public smoke checks the committed static robots file and never health/status or rollback", async () => {
  const requests = [];
  const result = await runLiveSmoke({
    env: { VERCEL_TOKEN: "fixture-token", VERCEL_PROJECT_ID: "prj_fixture" },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return publicResponse(url);
    },
    log() {},
  });
  assertPublicRequests(requests);
  assert.equal(result.ok, true);
  assert.equal(result.rolledBack, false);
  assert.deepEqual(result.results.map(({ name, ok }) => ({ name, ok })), [
    { name: "home", ok: true }, { name: "login", ok: true }, { name: "fr-login", ok: true },
    { name: "robots", ok: true }, { name: "sign-in-redirect", ok: true }, { name: "sign-up-redirect", ok: true },
  ]);
});

test("robots must return 200 with its expected public content; absent secrets prevent rollback", async () => {
  for (const options of [{ robotsBody: "<html>KidEase</html>" }, { robotsStatus: 503 }]) {
    const requests = [];
    const result = await runLiveSmoke({
      env: {},
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return publicResponse(url, options);
      },
      log() {},
    });
    assertPublicRequests(requests);
    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, false);
    assert.deepEqual(result.results.filter(({ ok }) => !ok).map(({ name }) => name), ["robots"]);
  }
});

test("failed public smoke retains authenticated rollback to the previous ready production deployment", async () => {
  const requests = [];
  const result = await runLiveSmoke({
    env: { VERCEL_TOKEN: "fixture-token", VERCEL_PROJECT_ID: "prj_fixture", VERCEL_ORG_ID: "team_fixture" },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const parsed = new URL(url);
      if (parsed.origin === "https://www.kidease.ca") return publicResponse(url, { robotsBody: "unavailable" });
      assert.equal(parsed.origin, "https://api.vercel.com");
      assert.equal(init.headers.Authorization, "Bearer fixture-token");
      if (parsed.pathname === "/v6/deployments") {
        assert.equal(init.method, undefined);
        assert.equal(parsed.searchParams.get("projectId"), "prj_fixture");
        assert.equal(parsed.searchParams.get("target"), "production");
        assert.equal(parsed.searchParams.get("teamId"), "team_fixture");
        return Response.json({ deployments: [
          { uid: "dpl_new", readyState: "READY", target: "production", created: 20 },
          { uid: "dpl_preview", readyState: "READY", target: "preview", created: 30 },
          { uid: "dpl_old", readyState: "READY", target: "production", created: 10 },
          { uid: "dpl_bad", readyState: "ERROR", target: "production", created: 40 },
        ] });
      }
      assert.equal(parsed.pathname, "/v1/projects/prj_fixture/rollback/dpl_old");
      assert.equal(parsed.searchParams.get("teamId"), "team_fixture");
      assert.equal(init.method, "POST");
      assert.equal(init.headers["Content-Type"], "application/json");
      return new Response(null, { status: 200 });
    },
    log() {},
  });
  assertPublicRequests(requests.slice(0, 6));
  assert.equal(requests.length, 8);
  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.deepEqual(result.results.filter(({ ok }) => !ok).map(({ name }) => name), ["robots"]);
});
