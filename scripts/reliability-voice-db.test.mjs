import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { postgresPoolUrl, retryTransient } from "../src/lib/pg-url.ts";
import { bareServerFnRequest } from "../src/lib/server-fn-request.ts";
import { voiceErrorPlan, voiceTokenRefreshPlan } from "../src/lib/voice-device.ts";

test("sslmode require becomes verify-full and a local url is unchanged", () => {
  const neon = postgresPoolUrl("postgresql://user:secret@ep.example.com/neondb?sslmode=require");
  assert.match(neon, /sslmode=verify-full/);
  assert.doesNotMatch(neon, /sslmode=require/);
  assert.equal(postgresPoolUrl("postgresql://user@localhost/kidease"), "postgresql://user@localhost/kidease");
  assert.match(postgresPoolUrl("postgres://u:p@h/db?sslmode=prefer"), /sslmode=verify-full/);
});

test("a dropped connection is retried and a query error is not", async () => {
  let tries = 0;
  const ok = await retryTransient(async () => {
    tries += 1;
    if (tries < 2) throw new Error("Connection terminated unexpectedly");
    return "up";
  });
  assert.equal(ok, "up");
  await assert.rejects(
    retryTransient(async () => {
      throw new Error("column missing");
    }),
    /column missing/,
  );
});

test("a bare server function url is rejected and a real call is not", () => {
  assert.equal(bareServerFnRequest("/_serverFn/abc", null), true);
  assert.equal(bareServerFnRequest("/_serverFn/abc", "true"), false);
  assert.equal(bareServerFnRequest("/search", null), false);
});

test("voice token refresh does not update a device with no transport", () => {
  assert.equal(voiceTokenRefreshPlan({ registered: false, token: "tok" }), "register");
  assert.equal(voiceTokenRefreshPlan({ registered: true, token: "tok" }), "update");
  assert.equal(voiceTokenRefreshPlan({ registered: true, token: null }), "skip");
  assert.equal(voiceErrorPlan(31009), "register");
  assert.equal(voiceErrorPlan(31005), "once");
  assert.equal(voiceErrorPlan(31000), "once");
  assert.equal(voiceErrorPlan(20104), "refresh");
});

test("a closed listing waitlist is logged as info, not thrown", () => {
  const src = readFileSync(new URL("../src/lib/server/spot-offers.ts", import.meta.url), "utf8");
  assert.match(src, /console\.info\("\[kidease-waitlist\] listing not open"/);
  assert.doesNotMatch(src, /throw new Error\("This listing is not open for a waitlist\."\)/);
});
