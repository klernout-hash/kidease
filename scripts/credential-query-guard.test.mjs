import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { credentialQueryLocation, queryCarriesSecret } from "../src/lib/credential-query-guard.ts";
import { localeSwitchHref } from "../src/lib/locale-path.ts";

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

test("French keeps the current page, including the search", () => {
  assert.equal(localeSwitchHref("/", "", "fr"), "/fr");
  assert.equal(localeSwitchHref("/search", "?q=Winnipeg%2C+MB", "fr"), "/fr/search?q=Winnipeg%2C+MB");
  assert.equal(localeSwitchHref("/fr", "", "en"), "/");
  assert.equal(localeSwitchHref("/fr/search", "?q=Winnipeg", "en"), "/search?q=Winnipeg");
});

test("credential forms post, and sign-in stays clickable", () => {
  const login = page("../src/routes/login.tsx");
  assert.match(login, /method="post"/);
  assert.match(login, /action=\{loginPath\}/);
  assert.match(login, /disabled=\{busy\}/);
  assert.doesNotMatch(login, /disabled=\{!formReady/);
  assert.match(login, /onAnimationStart/);
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
