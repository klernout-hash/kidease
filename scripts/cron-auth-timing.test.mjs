import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cronAuthorized, cronSecretFromEnv } from "../src/lib/cron-auth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "synthetic-cron-secret-1234";

function req(authorization) {
  const headers = authorization === undefined ? {} : { authorization };
  return new Request("https://kidease.ca/api/digest", { headers });
}

test("cron auth accepts the right bearer secret", () => {
  assert.equal(cronAuthorized(req(`Bearer ${SECRET}`), SECRET), true);
});

test("cron auth rejects a wrong secret of the same length", () => {
  const wrong = SECRET.slice(0, -1) + (SECRET.endsWith("4") ? "5" : "4");
  assert.equal(wrong.length, SECRET.length);
  assert.equal(cronAuthorized(req(`Bearer ${wrong}`), SECRET), false);
});

test("cron auth rejects wrong-length secrets (shorter, longer, prefix)", () => {
  assert.equal(cronAuthorized(req(`Bearer ${SECRET.slice(0, 4)}`), SECRET), false);
  assert.equal(cronAuthorized(req(`Bearer ${SECRET}x`), SECRET), false);
  assert.equal(cronAuthorized(req("Bearer "), SECRET), false);
  assert.equal(cronAuthorized(req(SECRET), SECRET), false);
  assert.equal(cronAuthorized(req(`Basic ${SECRET}`), SECRET), false);
});

test("cron auth fails closed when the env secret is missing or empty", () => {
  assert.equal(cronAuthorized(req("Bearer "), ""), false);
  assert.equal(cronAuthorized(req("Bearer undefined"), undefined), false);
  assert.equal(cronSecretFromEnv({}), "");
  assert.equal(cronSecretFromEnv({ CRON_SECRET: "   " }), "");
  assert.equal(cronAuthorized(req("Bearer "), cronSecretFromEnv({ CRON_SECRET: "   " })), false);
});

test("cron auth rejects a missing authorization header", () => {
  assert.equal(cronAuthorized(req(undefined), SECRET), false);
  assert.equal(
    cronAuthorized(new Request(`https://kidease.ca/api/digest?secret=${SECRET}`), SECRET),
    false,
  );
});

test("cron auth keeps env precedence: CRON_SECRET, then DIGEST_SECRET", () => {
  assert.equal(cronSecretFromEnv({ CRON_SECRET: " a ", DIGEST_SECRET: "b" }), "a");
  assert.equal(cronSecretFromEnv({ DIGEST_SECRET: "b" }), "b");
});

test("cron auth compares in constant time and never logs the secret", () => {
  const source = readFileSync(join(root, "src/lib/cron-auth.ts"), "utf8");
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /header\s*===/);
  assert.doesNotMatch(source, /console\./);
});
