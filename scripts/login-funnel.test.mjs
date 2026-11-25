import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  funnelDestPath,
  loginErrorCallbackUrl,
  resolvePostLoginPath,
  sanitizePostLoginNext,
  twoFactorPageUrl,
} from "../src/lib/desks.ts";
import { SESSION_SETTLE_RETRIES, waitForSignedInSession } from "../src/lib/auth/session-settle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("twoFactorPageUrl never points next at an auth loop", () => {
  assert.match(src("src/lib/auth/login-funnel.ts"), /login_funnel/);
  assert.match(twoFactorPageUrl("/parent"), /\/verify-2fa\?next=/);
  assert.match(twoFactorPageUrl("/parent"), /%2Fparent/);
  assert.match(twoFactorPageUrl("/login"), /%2Fparent/);
  assert.match(twoFactorPageUrl("/verify-2fa?next=/admin"), /%2Fadmin/);
  assert.doesNotMatch(twoFactorPageUrl("/login?next=/login"), /next=%2Flogin/);
});

test("social error callback keeps role/desk and drops looped next", () => {
  assert.equal(
    loginErrorCallbackUrl({
      role: "parent",
      desk: "parent",
      intent: "in",
      next: "/parent",
    }),
    "/login?intent=in&role=parent&desk=parent&next=%2Fparent",
  );
  assert.equal(
    loginErrorCallbackUrl({ role: "provider", desk: "director", next: "/login" }),
    "/login?role=provider&desk=director",
  );
  assert.equal(
    loginErrorCallbackUrl({
      role: "admin",
      desk: "admin",
      intent: "admin",
      next: "/admin",
    }),
    "/login?intent=admin&role=admin&desk=admin&next=%2Fadmin",
  );
});

test("login and 2FA use the shared continue helper", () => {
  const login = src("src/routes/login.tsx");
  const twoFa = src("src/routes/verify-2fa.tsx");
  const gates = src("src/lib/auth/gates.tsx");
  assert.match(login, /continueAfterSignIn/);
  assert.doesNotMatch(login, /markContinued\(dest, \{ method: "social" \}\)/);
  assert.match(login, /session_pending/);
  assert.match(login, /function openDesk/);
  assert.match(login, /twoFactorPageUrl/);
  assert.match(login, /loginErrorCallbackUrl/);
  assert.match(src("src/lib/auth/login-funnel.ts"), /statusPromise/);
  assert.match(src("src/lib/auth/login-funnel.ts"), /hinted/);
  assert.match(src("src/lib/desks.ts"), /\/verify-2fa\?next=/);
  assert.match(login, /openingDesk/);
  assert.match(twoFa, /assignPostAuthDest/);
  assert.match(twoFa, /pageStalled/);
  assert.match(twoFa, /<TurnstileField\s/);
  assert.match(src("src/lib/auth/login-funnel.ts"), /waitForSignedInSession/);
  assert.match(src("src/lib/auth/login-funnel.ts"), /SESSION_SETTLE_RETRIES/);
  assert.match(src("src/routes/login.tsx"), /waitForSignedInSession/);
  assert.match(twoFa, /staffTwoFactorRequired/);
  assert.match(twoFa, /decideVerify2faSessionGate/);
  assert.match(twoFa, /waitForSignedInSession/);
  assert.match(twoFa, /Continue to your desk/);
  assert.match(twoFa, /autoComplete="one-time-code"/);
  assert.match(twoFa, /startTwoFactor\(\{\s*data:\s*\{\s*force:\s*false(?:,\s*locale:\s*mailLocale)?\s*\}\s*\}\)/);
  assert.match(gates, /DeskSkeleton/);
  assert.match(gates, /sanitizePostLoginNext/);
  assert.match(gates, /to="\/verify-2fa"/);
  assert.match(src("src/routes/parent.tsx"), /LoginFunnelDeskLand/);
  assert.match(src("src/routes/provider.tsx"), /LoginFunnelDeskLand/);
  assert.match((src("src/routes/admin.tsx") + "\n" + src("src/components/admin-desk-page.tsx")), /LoginFunnelDeskLand/);
  assert.match(src("src/routes/support.tsx"), /LoginFunnelDeskLand/);
});

test("docs explain how to measure login_funnel in PostHog", () => {
  const docs = src("docs/posthog.md");
  const funnel = src("src/lib/auth/login-funnel.ts");
  assert.match(docs, /login_funnel/);
  assert.match(docs, /desk_landed/);
  assert.match(docs, /continued/);
  assert.match(docs, /30 minutes/);
  assert.match(funnel, /markContinued/);
  assert.match(funnel, /dest_failed/);
  assert.match(funnel, /DESK_RESOLVE_MS/);
  assert.match(funnel, /LOGIN_STALL_MS/);
  assert.match(src("src/routes/login.tsx"), /login-recovery/);
  assert.match(src("src/routes/verify-2fa.tsx"), /stall_continue/);
  assert.doesNotMatch(docs, /phc_[A-Za-z0-9]+/);
  assert.equal(sanitizePostLoginNext("/verify-2fa?next=/parent"), "/parent");
  assert.equal(resolvePostLoginPath({ next: "/login", role: "provider" }), "/provider");
  assert.equal(funnelDestPath("/provider?desk=money"), "/provider");
});

test("session settle retries instead of failing the first empty getSession", async () => {
  assert.deepEqual([...SESSION_SETTLE_RETRIES], [0, 200, 500, 1000, 2000]);
  let calls = 0;
  const session = await waitForSignedInSession(async () => {
    calls += 1;
    if (calls < 3) return { data: null };
    return { data: { user: { id: "u1" } } };
  });
  assert.equal(calls, 3);
  assert.equal(session?.data?.user?.id, "u1");
  const missing = await waitForSignedInSession(async () => ({ data: null }));
  assert.equal(missing, null);
  assert.match(src("src/lib/care-type.ts"), /export function parseAgeGroup/);
  assert.match(src("src/lib/parent-match.ts"), /parseAgeGroup\(prefs\.ageGroup\)/);
  assert.match(src("src/lib/auth/login-funnel.ts"), /waitForSignedInSession/);
});

test("#1014 item 2: /verify-2fa mounts the security check up front and waits for it", () => {
  const twoFa = src("src/routes/verify-2fa.tsx");
  const form = twoFa.slice(twoFa.indexOf("function VerifyTwoFactorForm"));
  // Not gated behind the first typed digit any more.
  assert.doesNotMatch(twoFa, /needTurnstile/);
  assert.doesNotMatch(form, /\? \(\s*<TurnstileField/);
  assert.doesNotMatch(form, /<div className="min-h-\[65px\]" aria-hidden="true" \/>/);
  assert.match(form, /<TurnstileField[\s\S]*?onKeyState=\{setTurnstileKey\}/);
  // Verify stays off with a visible hint until the token arrives.
  assert.match(form, /disabled=\{busy \|\| !turnstileReady\}/);
  assert.match(form, /t\("verify2faTurnstileLoading"\)/);
  assert.match(form, /data-ke="verify-turnstile-loading"/);
  // Auto-submit on 6 digits once the token is ready, once per code.
  assert.match(form, /autoSubmitted\.current === code/);
  assert.match(form, /\[code, ready, busy, turnstileReady\]/);
  assert.match(src("src/components/turnstile-field.tsx"), /onKeyState\?\.\(siteKey === undefined \? "loading"/);
  // Short windows pin the card to the top so Verify stays on the first screen.
  assert.match(form, /ke-auth-viewport ke-auth-top/);
  assert.match(src("src/styles.css"), /@media \(max-height: 700px\) \{\s*\.ke-auth-viewport\.ke-auth-top \{\s*align-items: start;/);
  for (const file of ["src/lib/copy-en.ts", "src/lib/copy-fr.ts"]) {
    assert.match(src(file), /verify2faTurnstileLoading: "/);
  }
  assert.match(src("src/lib/copy-fr.ts"), /verify2faTurnstileLoading: "Chargement de la vérification de sécurité…"/);
  // The French route reuses the same screen.
  assert.match(src("src/routes/fr.verify-2fa.tsx"), /VerifyTwoFactorScreen/);
});
