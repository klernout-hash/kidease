import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  decideVerify2faSessionGate,
  mapAuthSessionUser,
  VERIFY_2FA_SESSION_GRACE_MS,
  verify2faSearchNext,
  verify2faSignedOutTarget,
} from "../src/lib/auth/verify-2fa-session.ts";
import {
  SIGN_IN_TIMED_OUT_MESSAGE,
  twoFactorSessionGone,
  twoFactorVerifyErrorMessage,
} from "../src/lib/auth/login-stall.ts";
import { sanitizePostLoginNext } from "../src/lib/desks.ts";
import { SESSION_SETTLE_RETRIES } from "../src/lib/auth/session-settle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("session pending then ready on verify-2fa does not redirect to login", () => {
  const frames = [
    decideVerify2faSessionGate({ hasUser: false, isPending: true, graceElapsed: false }),
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: false }),
    decideVerify2faSessionGate({ hasUser: true, isPending: false, graceElapsed: false }),
  ];
  assert.deepEqual(frames, ["wait", "wait", "ready"]);
  assert.ok(!frames.includes("signed_out"));
});

test("empty session after OAuth stays on wait until grace elapses", () => {
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: false }),
    "wait",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: true, graceElapsed: true }),
    "wait",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: true }),
    "signed_out",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: true, isPending: false, graceElapsed: true }),
    "ready",
  );
});

test("grace covers the get-session retry budget after Google callback", () => {
  const budget = SESSION_SETTLE_RETRIES.reduce((sum, ms) => sum + ms, 0);
  assert.ok(VERIFY_2FA_SESSION_GRACE_MS >= budget);
  assert.ok(VERIFY_2FA_SESSION_GRACE_MS <= 5000);
});

test("verify-2fa next never loops through /login or /verify-2fa", () => {
  assert.equal(verify2faSearchNext("/parent"), "/parent");
  assert.equal(verify2faSearchNext("/admin"), "/admin");
  assert.equal(verify2faSearchNext("/login"), "/parent");
  assert.equal(verify2faSearchNext("/verify-2fa"), "/parent");
  assert.equal(verify2faSearchNext("/login?next=/login"), "/parent");
  assert.equal(verify2faSearchNext("/verify-2fa?next=/admin"), "/admin");
  assert.equal(verify2faSearchNext("/verify-2fa?next=/login"), "/parent");
  assert.equal(verify2faSearchNext("https://evil.example/"), "/parent");
  assert.equal(verify2faSearchNext(""), "/parent");
  assert.equal(verify2faSearchNext(undefined), "/parent");
});

test("mapAuthSessionUser accepts a Better Auth user and rejects junk", () => {
  assert.deepEqual(mapAuthSessionUser({ id: "u1", name: "Kyle", email: "k@example.com" }), {
    id: "u1",
    displayName: "Kyle",
    primaryEmail: "k@example.com",
    profileImageUrl: null,
    emailVerified: false,
    isDevFallback: false,
  });
  assert.equal(
    mapAuthSessionUser({ id: "u1", name: "Kyle", email: "k@example.com", emailVerified: true })?.emailVerified,
    true,
  );
  assert.equal(mapAuthSessionUser(null), null);
  assert.equal(mapAuthSessionUser({}), null);
  assert.equal(mapAuthSessionUser({ id: "" }), null);
});

test("verify-2fa page waits for the session gate before RedirectToSignIn", () => {
  const route = src("src/routes/verify-2fa.tsx");
  assert.match(route, /decideVerify2faSessionGate/);
  assert.match(route, /waitForSignedInSession/);
  assert.match(route, /VERIFY_2FA_SESSION_GRACE_MS/);
  assert.match(route, /verify2faSearchNext/);
  assert.match(route, /phase === "wait"/);
  assert.match(route, /phase === "signed_out"/);
  assert.match(route, /data-ke="verify-2fa-session-wait"/);
  assert.doesNotMatch(route, /if \(!user\) return <RedirectToSignIn \/>/);
  assert.match(route, /staffTwoFactorRequired/);
  assert.match(route, /<TurnstileField\s/);
});

test("A2: a server-signed-in result with no browser user is ready, not signed_out", () => {
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: true, serverSignedIn: true }),
    "ready",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: true, graceElapsed: false, serverSignedIn: true }),
    "ready",
  );
  // Server answer still on its way: keep waiting, even after the grace period.
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: true, serverSignedIn: null }),
    "wait",
  );
  // Only when both the browser and the server say signed out.
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: true, serverSignedIn: false }),
    "signed_out",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: false, serverSignedIn: false }),
    "wait",
  );
});

test("A2: verify-2fa asks the server, shows a visible heading and logs the gov bounce", () => {
  const route = src("src/routes/verify-2fa.tsx");
  assert.match(route, /getVerify2faServerSession\(\)/);
  assert.match(route, /serverSignedIn:/);
  assert.match(route, /t\("verify2faChecking"\)/);
  assert.doesNotMatch(route, /<DeskSkeleton \/>/);
  assert.match(route, /reason: "gov_session_missing"/);
  assert.match(route, /isGovDeskPath\(dest\)/);
  const twoFa = src("src/lib/server/two-factor.ts");
  assert.match(twoFa, /export const getVerify2faServerSession/);
  assert.match(src("src/lib/copy-en.ts"), /verify2faChecking: "Checking your sign-in…"/);
  assert.match(src("src/lib/copy-fr.ts"), /verify2faChecking: "Vérification de votre connexion…"/);
});

test("#1014 item 7: a signed-out /verify-2fa goes to the right sign-in page with expired=1, never /", () => {
  // Government desks: the government sign-in page in the route's language.
  assert.equal(verify2faSignedOutTarget("/gov", "en"), "/gov/login?expired=1");
  assert.equal(verify2faSignedOutTarget(verify2faSearchNext("/gov"), "en"), "/gov/login?expired=1");
  assert.equal(verify2faSignedOutTarget("/fr/gov", "en"), "/fr/gov/login?expired=1");
  assert.equal(verify2faSignedOutTarget("/gov", "fr"), "/fr/gov/login?expired=1");
  assert.equal(verify2faSignedOutTarget("/gov/centres", "en"), "/gov/login?expired=1");
  // Everyone else: /login or /fr/login with the real destination as next.
  assert.equal(verify2faSignedOutTarget("/parent", "en"), "/login?expired=1&next=%2Fparent");
  assert.equal(verify2faSignedOutTarget("/provider/billing", "en"), "/login?expired=1&next=%2Fprovider%2Fbilling");
  assert.equal(verify2faSignedOutTarget("/fr/parent", "en"), "/fr/login?expired=1&next=%2Ffr%2Fparent");
  assert.equal(verify2faSignedOutTarget("/parent", "fr"), "/fr/login?expired=1&next=%2Fparent");
  // Never back to /verify-2fa, never bare /.
  for (const dest of ["/verify-2fa?next=%2Fgov", "", null, "//evil.example", "/"]) {
    for (const locale of ["en", "fr"]) {
      const target = verify2faSignedOutTarget(dest, locale);
      assert.notEqual(target, "/");
      assert.match(target, /^\/(fr\/)?(gov\/)?login\?expired=1/);
      assert.doesNotMatch(target, /next=%2F(fr%2F)?verify-2fa/);
    }
  }
  // What the old RedirectToSignIn did, for the record: next unwraps to the desk, with no expired flag.
  assert.equal(sanitizePostLoginNext("/verify-2fa?next=%2Fgov"), "/gov");
});

test("#1014 item 7: verify-2fa maps expired / missing challenges and lost sessions", () => {
  assert.equal(twoFactorVerifyErrorMessage("That code expired. Request a new one."), SIGN_IN_TIMED_OUT_MESSAGE);
  assert.equal(twoFactorVerifyErrorMessage("Request a new code first."), SIGN_IN_TIMED_OUT_MESSAGE);
  assert.equal(twoFactorVerifyErrorMessage("Unauthorized"), SIGN_IN_TIMED_OUT_MESSAGE);
  assert.equal(twoFactorVerifyErrorMessage("That code is not correct."), "That code is not correct.");
  assert.equal(twoFactorSessionGone("Unauthorized"), true);
  assert.equal(twoFactorSessionGone("That code expired. Request a new one."), false);
  const route = src("src/routes/verify-2fa.tsx");
  const signedOut = route.slice(route.indexOf("function Verify2faSignedOut"), route.indexOf("function VerifyTwoFactorPage"));
  assert.match(signedOut, /verify2faSignedOutTarget\(dest, routeLocale\)/);
  assert.match(signedOut, /window\.location\.replace\(target\)/);
  assert.doesNotMatch(signedOut, /<RedirectToSignIn/);
  assert.match(route, /setError\(twoFactorVerifyErrorMessage\(raw\)\)/);
  assert.match(route, /if \(twoFactorSessionGone\(raw\)\) \{/);
  const login = src("src/routes/login.tsx");
  assert.match(login, /if \(s\.expired === "1" \|\| s\.expired === 1\) out\.expired = "1";/);
  assert.match(login, /search\.expired === "1" \? `\$\{href\}\?expired=1` : href/);
  assert.match(login, /t\("authSignInTimedOut"\)/);
  assert.match(login, /data-ke="login-expired"/);
  assert.match(src("src/lib/copy-en.ts"), /authSignInTimedOut: "Your sign-in timed out\. Sign in again to get a new code\."/);
  assert.match(
    src("src/lib/copy-fr.ts"),
    /authSignInTimedOut: "Votre connexion a expiré\. Connectez-vous de nouveau pour recevoir un nouveau code\."/,
  );
});
