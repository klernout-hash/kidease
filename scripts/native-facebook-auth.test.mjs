import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  visibleSignInProviders,
  NATIVE_GOOGLE,
  NATIVE_FACEBOOK,
  NATIVE_APPLE,
  GROK_PROVIDERS,
} from "../src/lib/auth/providers.ts";
import {
  FACEBOOK_CALLBACK_PATH,
  FACEBOOK_EMAIL_REQUIRED_MESSAGE,
  FACEBOOK_HOST_UNAVAILABLE,
  FACEBOOK_LOGIN_SCOPES,
  FACEBOOK_OAUTH_HOSTS,
  facebookAuthorizeScopesAllowed,
  facebookLoginVisible,
  facebookOauthHost,
  facebookPlaceholderEmail,
  facebookRedirectMatches,
  facebookContactBlocksAction,
  facebookRedirectUri,
  isFacebookPlaceholderEmail,
  mapFacebookProfileToUser,
  stripFacebookSignInScopes,
} from "../src/lib/auth/facebook-idp.ts";
import { brokerOAuthCallbackPath } from "../src/lib/auth/preview.ts";
import { facebookNewUserCallbackPath, facebookSignupRole } from "../src/lib/auth/social-callback.ts";
import { FACEBOOK_UNLINK_URL, unlinkFacebookPermissions } from "../src/lib/auth/facebook-unlink.ts";
import { shouldSendVerifyEmail } from "../src/lib/signup-user-mail.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("native Facebook auth (Better Auth socialProviders.facebook)", () => {
  it("reads FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET from process.env, never VITE_", () => {
    const idp = read("src/lib/auth/facebook-idp.ts");
    const server = read("src/lib/auth/server.ts");
    assert.match(idp, /FACEBOOK_CLIENT_ID/);
    assert.match(idp, /FACEBOOK_CLIENT_SECRET/);
    assert.match(idp, /process\.env\[key\]/);
    assert.doesNotMatch(idp, /VITE_FACEBOOK_CLIENT/);
    assert.doesNotMatch(server, /VITE_FACEBOOK_CLIENT/);
    assert.match(server, /socialProviders/);
    assert.match(server, /facebookIdpConfigured/);
    assert.match(server, /socialProviders\.facebook/);
  });

  it("removes X / Twitter social login from auth config and env stubs", () => {
    const server = read("src/lib/auth/server.ts");
    const example = read(".env.example");
    const login = read("src/routes/login.tsx");
    const providers = read("src/lib/auth/providers.ts");
    assert.equal(existsSync(join(root, "src/lib/auth/twitter-idp.ts")), false);
    assert.doesNotMatch(server, /twitterIdpConfigured/);
    assert.doesNotMatch(server, /socialProviders\.twitter/);
    assert.doesNotMatch(server, /TWITTER_CLIENT_/);
    assert.doesNotMatch(example, /TWITTER_CLIENT_/);
    assert.doesNotMatch(example, /\/api\/auth\/callback\/twitter/);
    assert.doesNotMatch(login, /continueX/);
    assert.doesNotMatch(login, /TWITTER_CLIENT_/);
    assert.doesNotMatch(providers, /providerId:\s*"twitter"/);
    assert.doesNotMatch(providers, /grok-x/);
    assert.doesNotMatch(providers, /NATIVE_TWITTER/);
  });

  it("keeps native Google and the Grok broker path when GROK_AUTH_* is present", () => {
    const broker = read("src/lib/auth/broker-env.ts");
    const server = read("src/lib/auth/server.ts");
    const providers = read("src/lib/auth/providers.ts");
    const google = read("src/lib/auth/google-idp.ts");
    assert.match(google, /GOOGLE_CLIENT_ID/);
    assert.match(google, /GOOGLE_CLIENT_SECRET/);
    assert.match(server, /googleIdpConfigured/);
    assert.match(server, /prompt:\s*"select_account"/);
    assert.match(broker, /GROK_AUTH_CLIENT_ID/);
    assert.match(broker, /GROK_AUTH_CLIENT_SECRET/);
    assert.match(broker, /grokBrokerExplicit/);
    assert.match(broker, /grokPreviewBroker/);
    assert.match(broker, /!process\.env\.VERCEL/);
    assert.match(server, /genericOAuth/);
    assert.match(server, /grokBrokerConfigured/);
    assert.match(providers, /grok-google/);
    assert.match(providers, /providerId:\s*"google"/);
  });

  it("does not newly enable Apple", () => {
    const server = read("src/lib/auth/server.ts");
    const providers = read("src/lib/auth/providers.ts");
    assert.match(server, /appleIdpConfigured/);
    assert.match(providers, /providerId:\s*"apple"/);
    assert.doesNotMatch(read("src/lib/auth/facebook-idp.ts"), /APPLE_/);
    assert.doesNotMatch(read(".env.example"), /^APPLE_/m);
  });

  it("does not fall back to the preview broker client on Vercel", () => {
    const broker = read("src/lib/auth/broker-env.ts");
    assert.match(broker, /grokPreviewBroker = !grokBrokerExplicit && !process\.env\.VERCEL/);
    assert.match(broker, /grokClientId = env\("GROK_AUTH_CLIENT_ID"\) \?\? \(grokPreviewBroker \? PREVIEW_CLIENT_ID/);
  });

  it("trusts kidease-git.vercel.app and existing kidease.ca hosts", () => {
    const server = read("src/lib/auth/server.ts");
    assert.match(server, /"kidease\.ca"/);
    assert.match(server, /"www\.kidease\.ca"/);
    assert.match(server, /"kidease-git\.vercel\.app"/);
  });

  it("documents BETTER_AUTH_SECRET + FACEBOOK_CLIENT_* and does not mint secrets", () => {
    const server = read("src/lib/auth/server.ts");
    const example = read(".env.example");
    assert.match(server, /BETTER_AUTH_SECRET/);
    assert.match(server, /Production must set BETTER_AUTH_SECRET/);
    assert.match(server, /Do not mint a production secret in the repo/);
    assert.match(example, /^BETTER_AUTH_SECRET=$/m);
    assert.match(example, /^FACEBOOK_CLIENT_ID=$/m);
    assert.match(example, /^FACEBOOK_CLIENT_SECRET=$/m);
    assert.match(example, /\/api\/auth\/callback\/facebook/);
    assert.match(example, /www\.kidease\.ca\/api\/auth\/callback\/facebook/);
    assert.doesNotMatch(example, /BETTER_AUTH_SECRET=.+/);
    assert.doesNotMatch(server, /BETTER_AUTH_SECRET\s*=\s*["'`][0-9a-f]{16,}/i);
  });

  it("client + popup treat native facebook like google (signIn.social)", () => {
    const client = read("src/lib/auth/client.ts");
    const popup = read("src/lib/auth/popup.server.ts");
    const login = read("src/routes/login.tsx");
    assert.match(client, /isNativeSocialProvider/);
    assert.match(client, /signIn\.social/);
    assert.match(client, /"apple" \| "google" \| "facebook"/);
    assert.match(popup, /isNativeSocialProvider/);
    assert.match(popup, /signInSocial/);
    assert.match(popup, /"apple" \| "google" \| "facebook"/);
    assert.match(login, /getSignInProviders/);
    assert.match(login, /continueFacebook/);
  });

  it("hides Facebook when env is missing; shows it only when native Facebook is on", () => {
    assert.equal(NATIVE_FACEBOOK.providerId, "facebook");
    assert.equal(NATIVE_FACEBOOK.idp, "facebook");
    assert.equal(NATIVE_FACEBOOK.label, "Facebook");
    assert.equal(
      GROK_PROVIDERS.some((p) => p.idp === "facebook" || p.providerId === "grok-x"),
      false,
    );

    const none = visibleSignInProviders({ nativeGoogle: false, broker: false });
    assert.equal(none.some((p) => p.idp === "facebook"), false);
    assert.equal(none.some((p) => p.idp === "apple"), false);
    assert.deepEqual(none, []);

    const hiddenOnBroker = visibleSignInProviders({
      nativeGoogle: false,
      nativeFacebook: false,
      broker: true,
    });
    assert.equal(hiddenOnBroker.some((p) => p.idp === "facebook"), false);

    const nativeOnly = visibleSignInProviders({
      nativeGoogle: false,
      nativeFacebook: true,
      broker: false,
    });
    assert.deepEqual(
      nativeOnly.filter((p) => p.idp === "facebook"),
      [NATIVE_FACEBOOK],
    );

    const both = visibleSignInProviders({
      nativeGoogle: true,
      nativeFacebook: true,
      broker: false,
      preferNativeGoogle: true,
    });
    assert.deepEqual(
      both.filter((p) => p.idp === "google"),
      [NATIVE_GOOGLE],
    );
    assert.deepEqual(
      both.filter((p) => p.idp === "facebook"),
      [NATIVE_FACEBOOK],
    );
  });

  it("hides Continue with Facebook until FEATURE_FACEBOOK_LOGIN is on", () => {
    assert.equal(
      facebookLoginVisible({
        FACEBOOK_CLIENT_ID: "app-id",
        FACEBOOK_CLIENT_SECRET: "app-secret",
      }),
      false,
    );
    assert.equal(
      facebookLoginVisible({
        FACEBOOK_CLIENT_ID: "app-id",
        FACEBOOK_CLIENT_SECRET: "app-secret",
        FEATURE_FACEBOOK_LOGIN: "0",
      }),
      false,
    );
    assert.equal(
      facebookLoginVisible({
        FACEBOOK_CLIENT_ID: "app-id",
        FACEBOOK_CLIENT_SECRET: "app-secret",
        FEATURE_FACEBOOK_LOGIN: "1",
      }),
      true,
    );
    assert.equal(facebookLoginVisible({ FEATURE_FACEBOOK_LOGIN: "1" }), false);
    const loader = read("src/lib/server/sign-in-providers.ts");
    const example = read(".env.example");
    assert.match(loader, /facebookLoginVisible/);
    assert.match(loader, /FEATURE_FACEBOOK_LOGIN|facebookLoginVisible/);
    assert.doesNotMatch(loader, /nativeFacebook\s*=\s*true/);
    assert.match(example, /^FEATURE_FACEBOOK_LOGIN=0$/m);
    assert.doesNotMatch(example, /^FEATURE_FACEBOOK_LOGIN=1$/m);
  });

  it("login loader only lists Facebook when FACEBOOK_CLIENT_* are set and the Live flag is on", () => {
    const loader = read("src/lib/server/sign-in-providers.ts");
    const idp = read("src/lib/auth/facebook-idp.ts");
    assert.match(loader, /facebookLoginVisible/);
    assert.match(idp, /FACEBOOK_CLIENT_ID/);
    assert.match(idp, /FACEBOOK_CLIENT_SECRET/);
    assert.match(idp, /FEATURE_FACEBOOK_LOGIN/);
    assert.doesNotMatch(loader, /nativeFacebook\s*=\s*true/);
  });

  it("hides Apple unless nativeApple is on (same dead-button rule as Facebook)", () => {
    assert.equal(NATIVE_APPLE.providerId, "apple");
    const hidden = visibleSignInProviders({ nativeGoogle: false, broker: false });
    assert.equal(hidden.some((p) => p.idp === "apple"), false);
    const shown = visibleSignInProviders({
      nativeApple: true,
      nativeGoogle: false,
      broker: false,
    });
    assert.deepEqual(
      shown.filter((p) => p.idp === "apple"),
      [NATIVE_APPLE],
    );
    const loader = read("src/lib/server/sign-in-providers.ts");
    assert.match(loader, /APPLE_CLIENT_ID/);
    assert.match(loader, /APPLE_PRIVATE_KEY/);
    assert.doesNotMatch(loader, /nativeApple\s*=\s*true/);
    assert.doesNotMatch(loader, /from ["']@\/lib\/auth\/apple-idp/);
  });

  it("requests only email and public_profile (not OpenID or extra permissions)", () => {
    assert.deepEqual([...FACEBOOK_LOGIN_SCOPES], ["email", "public_profile"]);
    assert.equal(FACEBOOK_LOGIN_SCOPES.includes("openid"), false);
    assert.equal(FACEBOOK_LOGIN_SCOPES.includes("profile"), false);
    assert.equal(FACEBOOK_LOGIN_SCOPES.includes("user_friends"), false);

    const server = read("src/lib/auth/server.ts");
    const idp = read("src/lib/auth/facebook-idp.ts");
    const client = read("src/lib/auth/client.ts");
    const popup = read("src/lib/auth/popup.server.ts");
    const login = read("src/routes/login.tsx");
    assert.match(idp, /FACEBOOK_LOGIN_SCOPES/);
    assert.match(server, /disableDefaultScope:\s*true/);
    assert.match(server, /scope:\s*\[\.\.\.FACEBOOK_LOGIN_SCOPES\]/);
    assert.match(server, /mapProfileToUser:\s*mapFacebookProfileToUser/);
    assert.doesNotMatch(server, /facebook:\s*\{[^}]*\bscopes:/s);
    assert.match(server, /prompt:\s*"select_account"/);
    assert.match(server, /emailAndPassword:\s*emailAndPasswordConfig/);
    assert.doesNotMatch(client, /signIn\.social\(\{[\s\S]*scopes:/);
    assert.doesNotMatch(popup, /signInSocial\(\{[\s\S]*scopes:/);
    assert.doesNotMatch(login, /scopes:\s*\[/);
  });

  it("maps a missing Facebook email to a .invalid placeholder, keeps a real one", () => {
    assert.deepEqual(mapFacebookProfileToUser({ id: "123", email: "pat@example.com" }), {
      email: "pat@example.com",
    });
    assert.deepEqual(mapFacebookProfileToUser({ id: "123", email: "  " }), {
      email: "123@facebook.invalid",
      emailVerified: false,
    });
    assert.deepEqual(mapFacebookProfileToUser({ sub: "oidc-sub" }), {
      email: "oidcsub@facebook.invalid",
      emailVerified: false,
    });
    assert.deepEqual(mapFacebookProfileToUser({}), {});
    assert.equal(isFacebookPlaceholderEmail("123@facebook.invalid"), true);
    assert.equal(isFacebookPlaceholderEmail("pat@example.com"), false);
    assert.equal(facebookPlaceholderEmail("12 3"), "123@facebook.invalid");
    assert.equal(shouldSendVerifyEmail({ email: "123@facebook.invalid", emailVerified: false }), false);
    assert.equal(shouldSendVerifyEmail({ email: "pat@example.com", emailVerified: false }), true);
  });

  it("sends a redirect_uri that is exactly one registered host, with no trailing slash", () => {
    assert.deepEqual([...FACEBOOK_OAUTH_HOSTS], ["kidease.ca", "www.kidease.ca", "kidease-git.vercel.app"]);
    for (const host of FACEBOOK_OAUTH_HOSTS) {
      const uri = facebookRedirectUri(host);
      assert.equal(uri, `https://${host}${FACEBOOK_CALLBACK_PATH}`);
      assert.equal(uri.endsWith("/"), false);
      assert.equal(facebookOauthHost(`${host}:443`), host);
      assert.equal(facebookRedirectUri(`${host}/`), `https://${host}${FACEBOOK_CALLBACK_PATH}`);
    }
    assert.equal(facebookRedirectUri("kidease-git-pr-1.vercel.app"), null);
    assert.equal(facebookRedirectUri("kidease-abc123.vercel.app"), null);
    assert.equal(facebookRedirectUri("preview.grok-sandbox.com"), null);
    assert.equal(facebookRedirectUri("localhost"), null);
    assert.equal(facebookRedirectUri("kidease.vercel.app"), null);
    assert.equal(facebookRedirectUri("kidease.grok.me"), null);

    const expected = "https://www.kidease.ca/api/auth/callback/facebook";
    const ok = `https://www.facebook.com/v24.0/dialog/oauth?client_id=app&redirect_uri=${encodeURIComponent(expected)}&scope=email%20public_profile`;
    assert.equal(facebookRedirectMatches(ok, expected), true);
    assert.equal(facebookAuthorizeScopesAllowed(ok), true);
    const slash = `https://www.facebook.com/dialog/oauth?redirect_uri=${encodeURIComponent(`${expected}/`)}&scope=email,public_profile`;
    assert.equal(facebookRedirectMatches(slash, expected), false);
    const broker = `https://www.facebook.com/dialog/oauth?redirect_uri=${encodeURIComponent("https://preview.grok-sandbox.com/api/auth/oauth2/callback/facebook")}&scope=email%20public_profile`;
    assert.equal(facebookRedirectMatches(broker, expected), false);
    const extra = `https://www.facebook.com/dialog/oauth?redirect_uri=${encodeURIComponent(expected)}&scope=email%20public_profile%20user_friends`;
    assert.equal(facebookAuthorizeScopesAllowed(extra), false);
    assert.deepEqual(stripFacebookSignInScopes({ provider: "facebook", scopes: ["user_friends"] }), {
      provider: "facebook",
    });
  });

  it("does not rewrite Facebook onto the preview broker callback", () => {
    assert.equal(brokerOAuthCallbackPath("facebook"), null);
    assert.equal(brokerOAuthCallbackPath("grok-google"), "/oauth2/callback/grok-google");
    const server = read("src/lib/auth/server.ts");
    const preview = read("src/lib/auth/preview.ts");
    const providers = read("src/lib/server/sign-in-providers.ts");
    assert.match(preview, /providerId === "facebook"/);
    assert.match(server, /brokerOAuthCallbackPath/);
    assert.match(providers, /facebookOauthHost/);
    assert.match(read("src/routes/api/auth/$.ts"), /prepareFacebookSignIn/);
    assert.match(read("src/routes/api/auth/$.ts"), /guardFacebookAuthorize/);
    assert.equal(FACEBOOK_HOST_UNAVAILABLE.includes("kidease.ca"), true);
  });

  it("sends new Facebook accounts through parent or centre staff, never a child", () => {
    assert.equal(facebookSignupRole("parent"), "parent");
    assert.equal(facebookSignupRole("provider"), "provider");
    assert.equal(facebookSignupRole("child"), null);
    assert.equal(facebookSignupRole("admin"), null);
    assert.equal(facebookNewUserCallbackPath({ role: "child", locale: "fr" }), "/fr/login?intent=up&step=role");
    assert.equal(
      facebookNewUserCallbackPath({ role: "parent", desk: "director", next: "/provider" }),
      "/login?intent=up&role=parent&desk=director&next=%2Fprovider",
    );
    const login = read("src/routes/login.tsx");
    assert.match(login, /facebookNewUserCallbackPath/);
    assert.match(login, /facebook-role/);
    assert.match(login, /FACEBOOK_ROLE_PENDING_KEY/);
    assert.match(login, /markAdultConfirmedForSession/);
    assert.match(read("src/components/facebook-role-boot.tsx"), /step=role/);
    assert.doesNotMatch(read("src/lib/server/facebook-email.ts"), /'parent'/);
    assert.match(login, /I confirm I am 18 or older\./);
    assert.match(login, /Je confirme que j’ai 18 ans ou plus\./);
    assert.doesNotMatch(login, /chooseAccountRole\("child"\)/);
    const copy = read("src/lib/copy.ts");
    assert.match(copy, /A child cannot have an account/);
    assert.match(copy, /Un enfant ne peut pas avoir de compte/);
  });

  it("does not crash when Facebook omits email, and blocks messaging until one is confirmed", () => {
    assert.equal(
      facebookContactBlocksAction({ email: "123@facebook.invalid", emailVerified: false, facebookEmailRequired: true }),
      true,
    );
    assert.equal(
      facebookContactBlocksAction({ email: "pat@example.com", emailVerified: false, facebookEmailRequired: true }),
      true,
    );
    assert.equal(
      facebookContactBlocksAction({ email: "pat@example.com", emailVerified: true, facebookEmailRequired: true }),
      false,
    );
    assert.equal(
      facebookContactBlocksAction({ email: "pat@example.com", emailVerified: false, facebookEmailRequired: false }),
      false,
    );
    assert.equal(FACEBOOK_EMAIL_REQUIRED_MESSAGE.includes("email"), true);
    const family = read("src/lib/server/family.ts");
    const inbox = read("src/lib/server/inbox.ts");
    const tours = read("src/lib/server/tours.ts");
    const slots = read("src/lib/server/tour-calendar.ts");
    assert.match(family, /assertFacebookContactEmail/);
    assert.match(family, /unlinkStoredFacebook/);
    assert.match(inbox, /assertFacebookContactEmail/);
    assert.match(tours, /assertFacebookContactEmail/);
    assert.match(slots, /assertFacebookContactEmail/);
    assert.match(read("src/lib/server/lead-requests.ts"), /assertFacebookContactEmail/);
    assert.match(read("src/components/facebook-email-prompt.tsx"), /facebookEmailLead/);
    assert.match(read("src/lib/copy.ts"), /facebookEmailLead/);
    assert.match(read("src/lib/auth/email-password.ts"), /isFacebookPlaceholderEmail/);
  });

  it("unlinks Facebook when the account is deleted", async () => {
    assert.equal(FACEBOOK_UNLINK_URL, "https://graph.facebook.com/v24.0/me/permissions");
    const calls = [];
    const ok = await unlinkFacebookPermissions("user-token", async (url, init) => {
      calls.push({ url: String(url), method: init?.method, authorization: init?.headers?.authorization });
      return { ok: true };
    });
    assert.equal(ok, true);
    assert.equal(calls[0].method, "DELETE");
    assert.equal(calls[0].url, FACEBOOK_UNLINK_URL);
    assert.equal(String(calls[0].url).includes("user-token"), false);
    assert.equal(calls[0].authorization, "Bearer user-token");
    const unlink = read("src/lib/server/facebook-account-unlink.ts");
    const family = read("src/lib/server/family.ts");
    assert.match(unlink, /providerId" = 'facebook'/);
    assert.match(unlink, /unlinkFacebookPermissions/);
    assert.equal(family.split("unlinkStoredFacebook").length > 2, true);
  });

  it("does not commit Facebook, Google, or Better Auth secrets", () => {
    const files = [
      "src/lib/auth/facebook-idp.ts",
      "src/lib/auth/google-idp.ts",
      "src/lib/auth/server.ts",
      "src/lib/auth/broker-env.ts",
      ".env.example",
    ];
    for (const rel of files) {
      const src = read(rel);
      assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
      assert.doesNotMatch(src, /GOCSPX-/);
      assert.doesNotMatch(src, /CLIENT_SECRET\s*=\s*["'`][^"'`]+["'`]/);
    }
  });
});
