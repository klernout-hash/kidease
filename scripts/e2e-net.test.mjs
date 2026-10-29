import assert from "node:assert/strict";
import test from "node:test";
import { isTransientNetError, withNetRetry } from "./e2e-net.mjs";

test("connection resets are transient and assertion errors are not", () => {
  assert.equal(isTransientNetError(new Error("apiRequestContext.post: connect ECONNRESET 127.0.0.1:8081")), true);
  assert.equal(isTransientNetError(new Error("socket hang up")), true);
  assert.equal(isTransientNetError(new Error("connect ECONNREFUSED 127.0.0.1:8081")), true);
  assert.equal(isTransientNetError(new Error("seed parent 500 no")), false);
  assert.equal(isTransientNetError(new Error("locator.click: Timeout 30000ms exceeded")), false);
});

test("withNetRetry stops after two retries", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withNetRetry(
        () => {
          calls += 1;
          throw new Error("connect ECONNRESET");
        },
        { retries: 2, sleep: async () => {} },
      ),
    /ECONNRESET/,
  );
  assert.equal(calls, 3);
});

test("withNetRetry does not retry a normal failure", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withNetRetry(
        () => {
          calls += 1;
          throw new Error("seed parent 403");
        },
        { retries: 2, sleep: async () => {} },
      ),
    /403/,
  );
  assert.equal(calls, 1);
});
