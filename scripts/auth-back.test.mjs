import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { authBackFallback, isAuthPagePath, isPublicBackTarget } from "../src/lib/auth/auth-back.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://www.kidease.ca";

test("KE-04: sign-in Back never targets the protected next", () => {
  for (const next of ["/account", "/account?tab=children", "/parent", "/parent?tab=saved", "/provider", "/inbox", "/notifications", "/fr/account"]) {
    assert.equal(isPublicBackTarget(next), false, next);
    assert.equal(authBackFallback({ next }), "/", next);
  }
  assert.equal(authBackFallback({ next: "/fr/account", locale: "fr" }), "/fr");
});

test("KE-04: Back returns to the public page the guest came from", () => {
  assert.equal(authBackFallback({ next: "/account", referrer: `${origin}/search?city=winnipeg`, origin }), "/search?city=winnipeg");
  assert.equal(authBackFallback({ next: "/parent", referrer: `${origin}/menu`, origin }), "/menu");
  // Cross-site or protected referrers are ignored.
  assert.equal(authBackFallback({ next: "/parent", referrer: "https://evil.example/search", origin }), "/");
  assert.equal(authBackFallback({ next: "/parent", referrer: `${origin}/account`, origin }), "/");
  assert.equal(authBackFallback({ next: "/parent", referrer: `${origin}/login?next=/parent`, origin }), "/");
  // A public next (e.g. daycare page) is a fine fallback.
  assert.equal(authBackFallback({ next: "/daycare/kids-world" }), "/daycare/kids-world");
  assert.equal(isPublicBackTarget("//evil.example"), false);
});

test("auth pages are recognised", () => {
  for (const p of ["/login", "/fr/login", "/signup", "/parent/signup", "/login?next=/parent"]) assert.equal(isAuthPagePath(p), true, p);
  assert.equal(isAuthPagePath("/search"), false);
});

test("gate redirects replace history and Back links use the safe fallback", () => {
  assert.match(readFileSync(join(root, "src/lib/server/role-route.ts"), "utf8"), /replace: true/);
  assert.match(readFileSync(join(root, "src/lib/auth/gates.tsx"), "utf8"), /<Navigate\s+to=\{signIn\}\s+replace/);
  const login = readFileSync(join(root, "src/routes/login.tsx"), "utf8");
  assert.doesNotMatch(login, /href=\{search\.next && search\.next\.startsWith\("\/"\) \? search\.next/);
  assert.match(login, /data-ke-auth-back/);
  assert.match(readFileSync(join(root, "src/components/parent-signup-form.tsx"), "utf8"), /data-ke-auth-back/);
  assert.match(readFileSync(join(root, "src/components/native-boot.tsx"), "utf8"), /isAuthPagePath/);
});
