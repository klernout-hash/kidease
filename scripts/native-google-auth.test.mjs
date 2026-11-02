import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { googleSignInEnabled, googleSignInOffered } from "../src/lib/auth/google-login-flag.ts";
import { visibleSignInProviders, NATIVE_GOOGLE, GROK_PROVIDERS } from "../src/lib/auth/providers.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("native Google auth (Better Auth socialProviders.google)", () => {
  it("reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from process.env, never VITE_", () => {
    const idp = read("src/lib/auth/google-idp.ts");
    const server = read("src/lib/auth/server.ts");
    assert.match(idp, /GOOGLE_CLIENT_ID/);
    assert.match(idp, /GOOGLE_CLIENT_SECRET/);
    assert.match(idp, /process\.env\[key\]/);
    assert.doesNotMatch(idp, /VITE_GOOGLE_CLIENT/);
    assert.doesNotMatch(server, /VITE_GOOGLE_CLIENT/);
    assert.match(server, /socialProviders/);
    assert.match(server, /googleIdpConfigured/);
    assert.match(server, /prompt:\s*"select_account"/);
  });

  it("keeps the Grok broker path when GROK_AUTH_CLIENT_ID + SECRET are present", () => {
    const broker = read("src/lib/auth/broker-env.ts");
    const server = read("src/lib/auth/server.ts");
    const providers = read("src/lib/auth/providers.ts");
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

  it("documents that Production must set BETTER_AUTH_SECRET and does not mint one", () => {
    const server = read("src/lib/auth/server.ts");
    const example = read(".env.example");
    assert.match(server, /BETTER_AUTH_SECRET/);
    assert.match(server, /Production must set BETTER_AUTH_SECRET/);
    assert.match(server, /Do not mint a production secret in the repo/);
    assert.match(example, /^BETTER_AUTH_SECRET=$/m);
    assert.match(example, /^GOOGLE_CLIENT_ID=$/m);
    assert.match(example, /^GOOGLE_CLIENT_SECRET=$/m);
    assert.doesNotMatch(example, /BETTER_AUTH_SECRET=.+/);
    assert.doesNotMatch(server, /BETTER_AUTH_SECRET\s*=\s*["'`][0-9a-f]{16,}/i);
  });

  it("client + popup treat native google like apple (signIn.social)", () => {
    const client = read("src/lib/auth/client.ts");
    const popup = read("src/lib/auth/popup.server.ts");
    const login = read("src/routes/login.tsx");
    assert.match(client, /isNativeSocialProvider/);
    assert.match(client, /signIn\.social/);
    assert.match(popup, /isNativeSocialProvider/);
    assert.match(popup, /signInSocial/);
    assert.match(login, /getSignInProviders/);
  });

  it("shows one Google button when native OR broker is configured", () => {
    const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
    assert.ok(brokerGoogle);

    const none = visibleSignInProviders({ nativeGoogle: false, broker: false });
    assert.equal(none.some((p) => p.idp === "google"), false);
    assert.equal(none.some((p) => p.idp === "apple"), false);

    const nativeOnly = visibleSignInProviders({ nativeGoogle: true, broker: false });
    assert.deepEqual(
      nativeOnly.filter((p) => p.idp === "google"),
      [NATIVE_GOOGLE],
    );

    const brokerOnly = visibleSignInProviders({ nativeGoogle: false, broker: true });
    assert.deepEqual(
      brokerOnly.filter((p) => p.idp === "google"),
      [brokerGoogle],
    );

    const bothPreferNative = visibleSignInProviders({
      nativeGoogle: true,
      broker: true,
      preferNativeGoogle: true,
    });
    assert.deepEqual(
      bothPreferNative.filter((p) => p.idp === "google"),
      [NATIVE_GOOGLE],
    );

    const bothPreferBroker = visibleSignInProviders({
      nativeGoogle: true,
      broker: true,
      preferNativeGoogle: false,
    });
    assert.deepEqual(
      bothPreferBroker.filter((p) => p.idp === "google"),
      [brokerGoogle],
    );
  });

  it("hides Continue with Google until GOOGLE_SIGNIN_ENABLED is on", () => {
    assert.equal(googleSignInEnabled({}), false);
    assert.equal(googleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "0" }), false);
    assert.equal(googleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "off" }), false);
    assert.equal(
      googleSignInEnabled({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }),
      false,
    );
    assert.equal(googleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "1" }), true);
    assert.equal(googleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "true" }), true);

    const creds = {
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      GROK_AUTH_CLIENT_ID: "grok",
      GROK_AUTH_CLIENT_SECRET: "grok-secret",
      VERCEL: "1",
    };
    assert.deepEqual(googleSignInOffered(creds), { native: false, broker: false });
    assert.deepEqual(googleSignInOffered({ ...creds, GOOGLE_SIGNIN_ENABLED: "1" }), {
      native: true,
      broker: true,
    });
    assert.deepEqual(googleSignInOffered({ GOOGLE_SIGNIN_ENABLED: "1" }), {
      native: false,
      broker: true,
    });
    assert.deepEqual(googleSignInOffered({ GOOGLE_SIGNIN_ENABLED: "1", VERCEL: "1" }), {
      native: false,
      broker: false,
    });

    const hidden = googleSignInOffered(creds);
    assert.deepEqual(
      visibleSignInProviders({
        nativeGoogle: hidden.native,
        broker: hidden.broker,
        nativeApple: true,
        nativeFacebook: true,
      }).map((provider) => provider.idp),
      ["apple", "facebook"],
    );

    const shown = googleSignInOffered({ ...creds, GOOGLE_SIGNIN_ENABLED: "1" });
    assert.deepEqual(
      visibleSignInProviders({
        nativeGoogle: shown.native,
        broker: shown.broker,
        preferNativeGoogle: true,
        nativeApple: true,
        nativeFacebook: true,
      }).map((provider) => provider.idp),
      ["apple", "google", "facebook"],
    );

    const example = read(".env.example");
    const loader = read("src/lib/server/sign-in-providers.ts");
    const server = read("src/lib/auth/server.ts");
    assert.match(example, /^GOOGLE_SIGNIN_ENABLED=0$/m);
    assert.doesNotMatch(example, /^GOOGLE_SIGNIN_ENABLED=1$/m);
    assert.match(example, /^GOOGLE_CLIENT_ID=$/m);
    assert.match(example, /^GOOGLE_CLIENT_SECRET=$/m);
    assert.match(example, /^FEATURE_GOOGLE_MAPS=0$/m);
    assert.match(example, /^# VITE_GOOGLE_MAPS_API_KEY=$/m);
    assert.doesNotMatch(read("src/lib/flags.ts"), /GOOGLE_SIGNIN_ENABLED/);
    assert.match(loader, /googleSignInOffered/);
    assert.match(server, /googleSignInEnabled/);
    assert.match(read("src/lib/auth/native-oauth-return.server.ts"), /googleSignInEnabled/);
    assert.match(read("src/components/help-bot.tsx"), /data-ke="help-launcher"/);
    assert.match(read("src/lib/auth/providers.ts"), /SOCIAL_SIGN_IN_ORDER = \["apple", "google", "facebook"\]/);
  });

  it("does not commit Google or Better Auth secrets", () => {
    const files = [
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
