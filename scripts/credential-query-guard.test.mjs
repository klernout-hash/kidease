import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { credentialQueryLocation, queryCarriesSecret } from "../src/lib/credential-query-guard.ts";

function page(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

test("a password query on an auth page redirects to the path with no query", () => {
  const dirty = new URL("https://www.kidease.ca/login?intent=in&email=person%40example.com&password=secret");
  assert.equal(credentialQueryLocation(dirty), "/login");
  assert.equal(credentialQueryLocation(new URL("https://www.kidease.ca/fr/login?pwd=secret")), "/fr/login");
  assert.equal(credentialQueryLocation(new URL("https://www.kidease.ca/reset-password?token=abc&pass=secret")), "/reset-password");
  assert.equal(credentialQueryLocation(new URL("https://www.kidease.ca/login?intent=in&next=%2Fparent")), null);
  assert.equal(credentialQueryLocation(new URL("https://www.kidease.ca/search?password=secret")), null);
  assert.equal(queryCarriesSecret(new URLSearchParams("Password=x")), true);
});

test("credential forms post, and the login button waits for hydration", () => {
  const login = page("../src/routes/login.tsx");
  assert.match(login, /method="post"/);
  assert.match(login, /action=\{loginPath\}/);
  assert.match(login, /disabled=\{!formReady/);
  assert.match(login, /useCredentialFormReady/);
  const search = page("../src/components/explore-search-bar.tsx");
  assert.match(search, /method="get"/);
  assert.match(search, /action=\{locale === "fr" \? "\/fr\/search" : "\/search"\}/);
  assert.match(page("../src/components/save-listing-button.tsx"), /data-ke="save-listing"/);
  for (const rel of [
    "../src/routes/forgot-password.tsx",
    "../src/routes/reset-password.tsx",
    "../src/routes/verify-2fa.tsx",
    "../src/components/parent-signup-form.tsx",
    "../src/components/gov/gov-login.tsx",
    "../src/routes/kiosk.tsx",
    "../src/components/reauth-dialog.tsx",
    "../src/components/account-security.tsx",
  ]) {
    assert.match(page(rel), /method="post"/, rel);
  }
  const guard = page("../src/start.ts");
  assert.match(guard, /credentialQueryMiddleware/);
  assert.match(guard, /status: 303/);
  assert.match(guard, /no-store/);
  assert.match(guard, /no-referrer/);
  assert.doesNotMatch(guard, /console\.(log|info|error|warn)\(request\.url\)/);
});
