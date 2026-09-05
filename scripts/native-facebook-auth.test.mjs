import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  visibleSignInProviders,
  NATIVE_GOOGLE,
  NATIVE_FACEBOOK,
  GROK_PROVIDERS,
} from "../src/lib/auth/providers.ts";

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

  it("login loader only lists Facebook when FACEBOOK_CLIENT_* are set", () => {
    const loader = read("src/lib/server/sign-in-providers.ts");
    assert.match(loader, /FACEBOOK_CLIENT_ID/);
    assert.match(loader, /FACEBOOK_CLIENT_SECRET/);
    assert.doesNotMatch(loader, /nativeFacebook\s*=\s*true/);
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
