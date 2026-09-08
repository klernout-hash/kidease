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
});

test("login and 2FA use the shared continue helper", () => {
  const login = src("src/routes/login.tsx");
  const twoFa = src("src/routes/verify-2fa.tsx");
  const gates = src("src/lib/auth/gates.tsx");
  assert.match(login, /continueAfterSignIn/);
  assert.match(login, /twoFactorPageUrl/);
  assert.match(login, /loginErrorCallbackUrl/);
  assert.match(src("src/lib/desks.ts"), /\/verify-2fa\?next=/);
  assert.match(login, /Opening your desk/);
  assert.match(twoFa, /resolveContinueDest/);
  assert.match(twoFa, /assignPostAuthDest/);
  assert.match(twoFa, /staffTwoFactorRequired/);
  assert.match(twoFa, /Continue to your desk/);
  assert.match(twoFa, /autoComplete="one-time-code"/);
  assert.match(twoFa, /startTwoFactor\(\{\s*data:\s*\{\s*force:\s*false\s*\}\s*\}\)/);
  assert.match(gates, /DeskSkeleton/);
  assert.match(gates, /sanitizePostLoginNext/);
  assert.match(gates, /to="\/verify-2fa"/);
  assert.match(src("src/routes/parent.tsx"), /LoginFunnelDeskLand/);
  assert.match(src("src/routes/provider.tsx"), /LoginFunnelDeskLand/);
  assert.match(src("src/routes/admin.tsx"), /LoginFunnelDeskLand/);
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
