import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assertGovSecondFactorVerified,
  govCallAllowed,
  govVerifyPath,
  GovSecondFactorError,
} from "../src/lib/gov/second-factor.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a government data call needs the email code or a passkey cookie", () => {
  assert.equal(govCallAllowed(true), true);
  assert.equal(govCallAllowed(false), false);
  assert.doesNotThrow(() => assertGovSecondFactorVerified(true));
  assert.throws(() => assertGovSecondFactorVerified(false), GovSecondFactorError);
  assert.equal(govVerifyPath("en", "/gov"), "/verify-2fa?next=%2Fgov");
  assert.equal(govVerifyPath("fr", "/fr/gov"), "/fr/verify-2fa?next=%2Ffr%2Fgov");
});

test("gov server functions and the export API check the second step", () => {
  const middleware = src("src/lib/auth/gov-middleware.ts");
  assert.match(middleware, /assertGovSecondFactorVerified/);
  assert.match(middleware, /isCurrentUserTwoFactorVerified/);
  assert.match(src("src/routes/api/gov.export.ts"), /govCallAllowed/);
  assert.match(src("src/lib/server/gov-portal.ts"), /needSecondFactor/);
  assert.match(src("src/lib/gov/desk-guard.ts"), /govVerifyPath/);
  assert.match(src("src/lib/server/gov-actor.server.ts"), /assertGovSecondFactorVerified/);
});

test("A2: GovLogin sends needSecondFactor to the code page, not dropExistingSession", () => {
  const login = src("src/components/gov/gov-login.tsx");
  const start = login.indexOf("const session = await getGovSession();");
  assert.ok(start > 0);
  const block = login.slice(start, login.indexOf("celebrateAfterNavigation();", start));
  const verifyAt = block.indexOf("govVerifyPath(locale, home)");
  const dropAt = block.indexOf("dropExistingSession()");
  assert.ok(verifyAt > 0, "needSecondFactor goes to govVerifyPath");
  assert.ok(dropAt > verifyAt, "dropExistingSession only runs after the second-factor branch");
  assert.match(block, /"needSecondFactor" in session && session\.needSecondFactor/);
  const branch = block.slice(0, dropAt);
  assert.match(branch, /window\.location\.assign\(govVerifyPath\(locale, home\)\);\s*return;/);
});

test("A2: a government account can run its own email-code step", () => {
  const middleware = src("src/lib/auth/middleware.ts");
  const at = middleware.indexOf("export const secondFactorMiddleware");
  assert.ok(at > 0);
  const block = middleware.slice(at);
  assert.match(block, /requireUserId/);
  assert.match(block, /assertSameSiteRequest/);
  assert.doesNotMatch(block, /rejectGovernmentOnPrivateApi/);
  // Every other private server function still rejects government sessions.
  assert.match(middleware.slice(0, at), /rejectGovernmentOnPrivateApi/);
  const twoFa = src("src/lib/server/two-factor.ts");
  for (const name of ["getTwoFactorStatus", "startTwoFactor", "verifyTwoFactor"]) {
    const fn = twoFa.slice(twoFa.indexOf(`export const ${name}`));
    assert.match(fn.slice(0, 200), /\.middleware\(\[secondFactorMiddleware\]\)/, name);
  }
});

test("A2: /login with next=/gov goes to the government sign-in", async () => {
  const { govLoginRedirectForNext, isGovDeskPath } = await import("../src/lib/auth/verify-2fa-session.ts");
  assert.equal(govLoginRedirectForNext("/gov", "en"), "/gov/login");
  assert.equal(govLoginRedirectForNext("/gov/centres", "en"), "/gov/login");
  assert.equal(govLoginRedirectForNext("/fr/gov", "en"), "/fr/gov/login");
  assert.equal(govLoginRedirectForNext("/gov", "fr"), "/fr/gov/login");
  assert.equal(govLoginRedirectForNext("/gov-terms", "en"), null);
  assert.equal(govLoginRedirectForNext("/parent", "en"), null);
  assert.equal(govLoginRedirectForNext(undefined, "en"), null);
  assert.equal(isGovDeskPath("/governance"), false);
  const login = src("src/routes/login.tsx");
  assert.match(login, /beforeLoad: \(\{ search \}\) => loginGovBeforeLoad\(search, "en"\)/);
  assert.match(login, /govLoginRedirectForNext\(search\.next, routeLocale\)/);
  assert.match(src("src/routes/fr.login.tsx"), /loginGovBeforeLoad\(search, "fr"\)/);
});

test("#1014 item 5: /fr/gov/login shows auth errors in French and waits for the security check", async () => {
  const login = src("src/components/gov/gov-login.tsx");
  assert.match(login, /import \{ presentAuthCopy \} from "@\/lib\/auth\/present-auth-copy";/);
  assert.match(login, /\{presentAuthCopy\(locale, error\)\}/);
  // The raw error is never rendered on its own.
  assert.doesNotMatch(login, /role="alert"[^>]*>\s*\{error\}/);
  assert.match(login, /required: turnstileRequired/);
  assert.match(login, /const waitingForCheck = turnstileRequired && !token\.trim\(\);/);
  assert.match(login, /disabled=\{busy \|\| waitingForCheck\}/);
  await import("../src/lib/copy.ts");
  const { presentAuthCopy } = await import("../src/lib/auth/present-auth-copy.ts");
  const { TURNSTILE_REQUIRED_MESSAGE, WRONG_EMAIL_OR_PASSWORD_MESSAGE, CLOUDFLARE_AUTH_BLOCK_MESSAGE } = await import(
    "../src/lib/auth/login-errors.ts"
  );
  const { LOGIN_TAKING_TOO_LONG_MESSAGE } = await import("../src/lib/auth/login-stall.ts");
  assert.equal(presentAuthCopy("fr", TURNSTILE_REQUIRED_MESSAGE), "Terminez la vérification de sécurité, puis réessayez.");
  for (const message of [WRONG_EMAIL_OR_PASSWORD_MESSAGE, CLOUDFLARE_AUTH_BLOCK_MESSAGE, LOGIN_TAKING_TOO_LONG_MESSAGE]) {
    assert.notEqual(presentAuthCopy("fr", message), message, message);
  }
  assert.equal(presentAuthCopy("en", TURNSTILE_REQUIRED_MESSAGE), TURNSTILE_REQUIRED_MESSAGE);
});

test("#1014 item 7: government sign-in pages show the timed-out notice for expired=1", () => {
  for (const [file, locale] of [
    ["src/routes/gov_.login.tsx", "en"],
    ["src/routes/fr.gov_.login.tsx", "fr"],
  ]) {
    const route = src(file);
    assert.match(route, /const expired = search\.expired === "1" \|\| search\.expired === 1 \? "1" : "";/, file);
    assert.match(route, new RegExp(`<GovLogin locale="${locale}" invite=\\{invite\\} expired=\\{expired === "1"\\} />`), file);
  }
  const login = src("src/components/gov/gov-login.tsx");
  assert.match(login, /expired && !error \?/);
  assert.match(login, /tx\(locale, "authSignInTimedOut"\)/);
  assert.match(login, /data-ke="gov-login-expired"/);
});
