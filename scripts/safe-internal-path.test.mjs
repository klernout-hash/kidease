/**
 * One strict validator for return destinations (handoff S6a, CodeQL #4/#16).
 * Synthetic inputs only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeInternalPath, safeInternalPath } from "../src/lib/safe-internal-path.ts";
import { pathnameOfDest, resolvePostLoginPath, sanitizePostLoginNext } from "../src/lib/desks.ts";
import { authBackFallback, isPublicBackTarget } from "../src/lib/auth/auth-back.ts";
import { nativeOAuthReturnPath, safeInAppPath } from "../src/lib/auth/native-oauth.ts";
import { destinationAfterSignIn, privateReturnPath } from "../src/lib/role-access.ts";

const ORIGIN = "https://www.kidease.ca";

const unsafe = [
  "/\t/evil.example",
  "/%09/evil.example",
  "/%2509/evil.example",
  "/\n/evil.example",
  "/%0A/evil.example",
  "/\r/evil.example",
  "/%0d/evil.example",
  "//evil.example",
  "//evil.example/parent",
  "/%2F/evil.example",
  "/%252F/evil.example",
  "/\\evil",
  "/\\\\evil",
  "/%5Cevil",
  "/%5cevil",
  "/%255Cevil",
  "\\\\evil",
  "https://evil",
  "HTTPS://evil",
  "http:evil",
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  " javascript:alert(1)",
  "data:text/html,hi",
  "%2F%2Fevil.example",
  "evil.example",
  "",
  "/parent\u0000",
  "/\u2028/evil.example",
  "/ /evil.example",
  "/\u00a0/evil.example",
];

const safe = [
  "/",
  "/parent",
  "/fr/parent",
  "/fr/parent?tab=saved",
  "/search?q=winnipeg",
  "/search?q=Trois-Rivi%C3%A8res",
  "/fr/recherche?q=Montr%C3%A9al#resultats",
  "/daycare/river-park#tour",
  "/provider?desk=provider",
  "/search?q=new westminster",
];

test("isSafeInternalPath rejects host, scheme, slash and control tricks", () => {
  for (const value of unsafe) {
    assert.equal(isSafeInternalPath(value), false, JSON.stringify(value));
    assert.equal(safeInternalPath(value, "/fallback"), "/fallback", JSON.stringify(value));
  }
  assert.equal(isSafeInternalPath(null), false);
  assert.equal(isSafeInternalPath(undefined), false);
  assert.equal(isSafeInternalPath(42), false);
  assert.equal(isSafeInternalPath(`/${"a".repeat(3000)}`), false);
});

test("isSafeInternalPath keeps real EN/FR paths with query and hash", () => {
  for (const value of safe) {
    assert.equal(isSafeInternalPath(value), true, value);
    assert.equal(new URL(value, ORIGIN).origin, ORIGIN, value);
  }
  assert.equal(safeInternalPath("  /fr/parent  ", "/"), "/fr/parent");
  assert.equal(safeInternalPath("//evil", null), null);
});

test("post-login next never leaves the site, and FR back-navigation survives", () => {
  for (const value of unsafe) {
    assert.equal(sanitizePostLoginNext(value), null, JSON.stringify(value));
    assert.equal(pathnameOfDest(value), "", JSON.stringify(value));
    const dest = resolvePostLoginPath({ next: value, role: "parent" });
    assert.equal(new URL(dest, ORIGIN).origin, ORIGIN, JSON.stringify(value));
    assert.equal(dest, "/parent");
    for (const role of ["parent", "provider", "admin", "government", null]) {
      const out = destinationAfterSignIn({
        role,
        next: value,
        ownsCentre: role === "provider",
        locale: "fr",
      });
      assert.equal(new URL(out, ORIGIN).origin, ORIGIN, `${role} ${JSON.stringify(value)}`);
      assert.equal(isSafeInternalPath(out), true, `${role} ${JSON.stringify(value)} -> ${out}`);
    }
  }
  assert.equal(sanitizePostLoginNext("/fr/parent?tab=saved"), "/fr/parent?tab=saved");
  assert.equal(sanitizePostLoginNext("/login?next=%2Ffr%2Fparent"), "/fr/parent");
  assert.equal(sanitizePostLoginNext("/login?next=%2F%09%2Fevil.example"), null);
  assert.equal(
    destinationAfterSignIn({ role: "parent", next: "/parent", locale: "fr" }),
    "/fr/parent",
  );
});

test("native app return paths fall back to /login for unsafe next", () => {
  for (const value of unsafe) {
    assert.equal(safeInAppPath(value), "/login", JSON.stringify(value));
    const ret = new URL(nativeOAuthReturnPath(value), ORIGIN);
    assert.equal(ret.searchParams.get("next"), "/login");
  }
  assert.equal(safeInAppPath("/fr/parent?tab=saved"), "/fr/parent?tab=saved");
  assert.equal(safeInAppPath("/daycare/river-park"), "/daycare/river-park");
});

test("sign-in Back on web and native never follows an unsafe next", () => {
  for (const value of unsafe) {
    assert.equal(isPublicBackTarget(value), false, JSON.stringify(value));
    assert.equal(authBackFallback({ next: value, locale: "fr" }), "/fr");
    assert.equal(authBackFallback({ next: value, locale: "en" }), "/");
  }
  assert.equal(
    authBackFallback({ next: "/daycare/river-park", locale: "en" }),
    "/daycare/river-park",
  );
});

test("private return path ignores an unsafe href and rebuilds from pathname", () => {
  assert.equal(
    privateReturnPath({ pathname: "/parent", href: "/\t/evil.example", searchStr: "?tab=saved" }),
    "/parent?tab=saved",
  );
  assert.equal(
    privateReturnPath({ pathname: "/parent", href: "/parent?tab=saved" }),
    "/parent?tab=saved",
  );
});
