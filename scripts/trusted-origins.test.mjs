import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authHostAllowed,
  safePostLoginUrl,
} from "../src/lib/auth/trusted-origins.ts";

test("production auth trusts the real site and the app scheme only", () => {
  const env = { VERCEL_ENV: "production" };
  assert.equal(authHostAllowed("www.kidease.ca", env), true);
  assert.equal(authHostAllowed("kidease.ca", env), true);
  assert.equal(authHostAllowed("kidease-evil.vercel.app", env), false);
  assert.equal(authHostAllowed("kidease.grok.me", env), false);
  assert.equal(authHostAllowed("notkidease.ca", env), false);
  assert.equal(safePostLoginUrl("https://kidease-evil.vercel.app/admin", "https://www.kidease.ca"), "/");
  assert.equal(safePostLoginUrl("/parent?desk=1", "https://www.kidease.ca"), "/parent?desk=1");
  assert.equal(safePostLoginUrl("ca.kidease.app://auth/finish", "https://www.kidease.ca"), "ca.kidease.app://auth/finish");
});

test("preview auth keeps its own hosts", () => {
  const env = { VERCEL_ENV: "preview" };
  assert.equal(authHostAllowed("kidease-git-pr-1.vercel.app", env), true);
  assert.equal(authHostAllowed("wild.grok.me", env), true);
  assert.equal(authHostAllowed("evil.example", env), false);
});
