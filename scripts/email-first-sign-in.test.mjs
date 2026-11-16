import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMAIL_STATUS_MAX, normalizeStatusEmail } from "../src/lib/auth/email-status-plugin.ts";

test("email status compares emails the way sign-in stores them", () => {
  assert.equal(normalizeStatusEmail("  Kyle@Example.CA "), "kyle@example.ca");
});

test("email status has its own tight rate rule", () => {
  const server = readFileSync(new URL("../src/lib/auth/server.ts", import.meta.url), "utf8");
  assert.match(server, /"\/email-status": \{ window: EMAIL_STATUS_WINDOW_S, max: EMAIL_STATUS_MAX \}/);
  assert.ok(EMAIL_STATUS_MAX <= 10);
});

test("login keeps Google, Facebook and Apple, and asks email first only in the clean look", () => {
  const login = readFileSync(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
  assert.match(login, /<SocialSignInButtons/);
  assert.match(login, /dataset\.look === "clean"\) setEmailFirst\(true\)/);
  assert.match(login, /search\.intent !== "admin"/);
});
