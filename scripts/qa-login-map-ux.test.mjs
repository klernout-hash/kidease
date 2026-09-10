import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { facebookLoginVisible } from "../src/lib/auth/facebook-idp.ts";
import { friendlyAuthError } from "../src/lib/auth/login-errors.ts";
import {
  readTurnstileTokenFromBody,
  turnstileFailureMessage,
  turnstileRemoteIp,
} from "../src/lib/server/turnstile-verify.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("QA 2026-09-10: Turnstile token pass-through", () => {
  it("auth handler reads header or JSON body and siteverify skips proxy IPs", () => {
    const authApi = src("src/routes/api/auth/$.ts");
    const turnstile = src("src/lib/server/turnstile.ts");
    const field = src("src/components/turnstile-field.tsx");
    const client = src("src/lib/auth/client.ts");
    assert.match(authApi, /turnstileTokenFromAuthRequest/);
    assert.match(authApi, /readTurnstileTokenFromBody/);
    assert.match(authApi, /request\.clone\(\)\.json/);
    assert.match(turnstile, /turnstileRemoteIp/);
    assert.match(client, /onRequest\(ctx/);
    assert.match(client, /x-turnstile-token/);
    assert.match(field, /Security check expired/);
    assert.match(field, /max-width: 399px/);
    assert.match(field, /size: narrow \? "compact" : "flexible"/);
    assert.equal(turnstileRemoteIp(new Headers({ "x-real-ip": "10.0.0.2" })), undefined);
    assert.equal(readTurnstileTokenFromBody({ turnstileToken: "abc" }), "abc");
    assert.match(turnstileFailureMessage(["timeout-or-duplicate"]), /expired/);
    assert.match(friendlyAuthError("Security check expired. Complete it again, then try once."), /expired/);
  });
});

describe("QA 2026-09-10: Facebook CTA stays hidden until Live", () => {
  it("defaults off even when FACEBOOK_CLIENT_* are set", () => {
    assert.equal(
      facebookLoginVisible({
        FACEBOOK_CLIENT_ID: "id",
        FACEBOOK_CLIENT_SECRET: "secret",
      }),
      false,
    );
    assert.equal(
      facebookLoginVisible({
        FACEBOOK_CLIENT_ID: "id",
        FACEBOOK_CLIENT_SECRET: "secret",
        FEATURE_FACEBOOK_LOGIN: "1",
      }),
      true,
    );
    const login = src("src/routes/login.tsx");
    const loader = src("src/lib/server/sign-in-providers.ts");
    assert.match(login, /continueGoogle/);
    assert.match(login, /continueFacebook/);
    assert.match(loader, /facebookLoginVisible/);
    assert.match(src(".env.example"), /^FEATURE_FACEBOOK_LOGIN=0$/m);
    assert.doesNotMatch(src("src/lib/flags.ts"), /FEATURE_FACEBOOK_LOGIN/);
  });
});

describe("QA 2026-09-10: login split does not overflow under 768", () => {
  it("keeps a single column until lg and clamps the card", () => {
    const login = src("src/routes/login.tsx");
    assert.match(login, /data-ke="login-split"/);
    assert.match(login, /overflow-x-hidden lg:grid-cols-2/);
    assert.match(login, /hidden min-w-0 overflow-hidden lg:block/);
    assert.doesNotMatch(login, /md:grid-cols-2/);
    assert.doesNotMatch(login, /hidden overflow-hidden md:block/);
    assert.match(login, /min-w-0 max-w-md/);
    assert.match(login, /px-\[clamp\(0\.75rem,3vw,2rem\)\]/);
  });
});

describe("login strength: email Connexion primary, logout, honest errors", () => {
  it("puts email Connexion above Google so social cannot steal submit", () => {
    const login = src("src/routes/login.tsx");
    const emailIdx = login.indexOf('data-ke={operator ? "admin-email-first" : "email-sign-in"}');
    const socialIdx = login.indexOf('data-ke="social-sign-in"');
    const primaryIdx = login.indexOf('data-ke="email-primary"');
    const googleIdx = login.indexOf('data-ke="social-secondary"');
    assert.ok(emailIdx > 0 && socialIdx > emailIdx, "email form must render before social");
    assert.ok(primaryIdx > 0 && googleIdx > primaryIdx, "Connexion submit must render before Google");
    assert.match(login, /t\("orSocial"\)/);
    assert.match(login, /t\("signIn"\)/);
    assert.match(login, /continueGoogle/);
    assert.match(src("src/lib/copy.ts"), /orSocial: "or continue with Google"/);
    assert.match(src("src/lib/copy.ts"), /orSocial: "ou continuer avec Google"/);
    assert.match(src(".env.example"), /^FEATURE_FACEBOOK_LOGIN=0$/m);
  });

  it("sign-out clears session crumbs and uses replace so back cannot bounce", () => {
    const client = src("src/lib/auth/client.ts");
    const desks = src("src/lib/desks.ts");
    assert.match(client, /clearClientAuthState/);
    assert.match(client, /location\.replace/);
    assert.match(client, /sign-out-timeout/);
    assert.match(client, /forgetRememberedRole/);
    assert.match(client, /clearDeskLanded/);
    assert.match(client, /markJustSignedOut/);
    assert.doesNotMatch(client, /location\.href = redirectTo/);
    assert.match(desks, /JUST_SIGNED_OUT_KEY/);
    assert.match(src("src/routes/login.tsx"), /consumeJustSignedOut/);
    assert.match(src("src/routes/index.tsx"), /consumeJustSignedOut/);
    assert.match(src("src/routes/fr.index.tsx"), /consumeJustSignedOut/);
    assert.match(src("src/routes/api/auth/$.ts"), /applyExpiredAuthCookies/);
  });
});

describe("QA 2026-09-10: map hang + licensed-not-live honesty", () => {
  it("times out Maps JS and offers retry plus list fallback", () => {
    const maps = src("src/lib/google-maps.ts");
    const view = src("src/components/map-view.tsx");
    const search = src("src/routes/search.tsx");
    assert.match(maps, /MAP_SCRIPT_WAIT_MS = 8000/);
    assert.match(maps, /MAP_VIEW_WAIT_MS/);
    assert.match(maps, /Google Maps timed out/);
    assert.match(view, /mapRetry/);
    assert.match(view, /mapShowList/);
    assert.match(view, /onFallback/);
    assert.match(view, /setLoadGen/);
    assert.match(search, /onFallback=\{\(\) => setView\("list"\)\}/);
    assert.match(search, /shownList\.length > 0 \? shownList : catalog/);
  });

  it("guest copy is honest when 0 live and licensed centres exist", () => {
    const copy = src("src/lib/copy.ts");
    const search = src("src/routes/search.tsx");
    assert.match(copy, /licensedNotLiveTitle/);
    assert.match(copy, /licensedNotLiveLead/);
    assert.match(copy, /0 live on KidEase · \{n\} licensed nearby/);
    assert.match(copy, /0 en ligne sur KidEase · \{n\} permis près d’ici/);
    assert.match(search, /data-ke="licensed-not-live"/);
    assert.match(search, /fabric\.live === 0/);
    assert.doesNotMatch(copy, /searchLiveEmptyCount: "0 live · \{n\} listed"/);
  });
});
