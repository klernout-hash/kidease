import assert from "node:assert/strict";
import { test } from "node:test";
import {
  judgeProbe,
  previousReadyDeployment,
  rollbackRequest,
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
