import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  visibleSignInProviders,
  NATIVE_GOOGLE,
  NATIVE_TWITTER,
  GROK_PROVIDERS,
} from "../src/lib/auth/providers.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("native X auth (Better Auth socialProviders.twitter)", () => {
  it("reads TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET from process.env, never VITE_ or X_CLIENT_*", () => {
    const idp = read("src/lib/auth/twitter-idp.ts");
    const server = read("src/lib/auth/server.ts");
    assert.match(idp, /TWITTER_CLIENT_ID/);
    assert.match(idp, /TWITTER_CLIENT_SECRET/);
    assert.match(idp, /process\.env\[key\]/);
    assert.doesNotMatch(idp, /VITE_TWITTER_CLIENT/);
    assert.doesNotMatch(idp, /X_CLIENT_ID/);
    assert.doesNotMatch(idp, /X_CLIENT_SECRET/);
    assert.doesNotMatch(server, /VITE_TWITTER_CLIENT/);
    assert.match(server, /socialProviders/);
    assert.match(server, /twitterIdpConfigured/);
    assert.match(server, /socialProviders\.twitter/);
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
    assert.match(providers, /grok-x/);
    assert.match(providers, /providerId:\s*"twitter"/);
  });

  it("does not newly enable Apple", () => {
    const server = read("src/lib/auth/server.ts");
    const providers = read("src/lib/auth/providers.ts");
    // Existing leftover Apple stays gated on APPLE_* — this change must not
    // add Apple as a newly configured social path.
    assert.match(server, /appleIdpConfigured/);
    assert.match(providers, /providerId:\s*"apple"/);
    assert.doesNotMatch(read("src/lib/auth/twitter-idp.ts"), /APPLE_/);
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

  it("documents BETTER_AUTH_SECRET + TWITTER_CLIENT_* and does not mint secrets", () => {
    const server = read("src/lib/auth/server.ts");
    const example = read(".env.example");
    assert.match(server, /BETTER_AUTH_SECRET/);
    assert.match(server, /Production must set BETTER_AUTH_SECRET/);
    assert.match(server, /Do not mint a production secret in the repo/);
    assert.match(example, /^BETTER_AUTH_SECRET=$/m);
    assert.match(example, /^TWITTER_CLIENT_ID=$/m);
    assert.match(example, /^TWITTER_CLIENT_SECRET=$/m);
    assert.match(example, /\/api\/auth\/callback\/twitter/);
    assert.doesNotMatch(example, /BETTER_AUTH_SECRET=.+/);
    assert.doesNotMatch(example, /X_CLIENT_ID/);
    assert.doesNotMatch(server, /BETTER_AUTH_SECRET\s*=\s*["'`][0-9a-f]{16,}/i);
  });

  it("client + popup treat native twitter like google (signIn.social)", () => {
    const client = read("src/lib/auth/client.ts");
    const popup = read("src/lib/auth/popup.server.ts");
    const login = read("src/routes/login.tsx");
    assert.match(client, /isNativeSocialProvider/);
    assert.match(client, /signIn\.social/);
    assert.match(client, /"apple" \| "google" \| "twitter"/);
    assert.match(popup, /isNativeSocialProvider/);
    assert.match(popup, /signInSocial/);
    assert.match(popup, /"apple" \| "google" \| "twitter"/);
    assert.match(login, /getSignInProviders/);
    assert.match(login, /continueX/);
  });

  it("shows one X button when native OR broker is configured", () => {
    const brokerX = GROK_PROVIDERS.find((p) => p.providerId === "grok-x");
    assert.ok(brokerX);
    assert.equal(NATIVE_TWITTER.providerId, "twitter");
    assert.equal(NATIVE_TWITTER.idp, "twitter");
    assert.equal(NATIVE_TWITTER.label, "X");

    const none = visibleSignInProviders({ nativeGoogle: false, broker: false });
    assert.equal(none.some((p) => p.idp === "twitter"), false);

    const nativeOnly = visibleSignInProviders({
      nativeGoogle: false,
      nativeTwitter: true,
      broker: false,
    });
    assert.deepEqual(
      nativeOnly.filter((p) => p.idp === "twitter"),
      [NATIVE_TWITTER],
    );

    const brokerOnly = visibleSignInProviders({ nativeGoogle: false, broker: true });
    assert.deepEqual(
      brokerOnly.filter((p) => p.idp === "twitter"),
      [brokerX],
    );

    const bothPreferNative = visibleSignInProviders({
      nativeGoogle: false,
      nativeTwitter: true,
      broker: true,
      preferNativeTwitter: true,
    });
    assert.deepEqual(
      bothPreferNative.filter((p) => p.idp === "twitter"),
      [NATIVE_TWITTER],
    );

    const bothPreferBroker = visibleSignInProviders({
      nativeGoogle: false,
      nativeTwitter: true,
      broker: true,
      preferNativeTwitter: false,
    });
    assert.deepEqual(
      bothPreferBroker.filter((p) => p.idp === "twitter"),
      [brokerX],
    );
  });

  it("keeps native Google picking when X is also configured", () => {
    const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
    assert.ok(brokerGoogle);
    const both = visibleSignInProviders({
      nativeGoogle: true,
      nativeTwitter: true,
      broker: false,
      preferNativeGoogle: true,
    });
    assert.deepEqual(
      both.filter((p) => p.idp === "google"),
      [NATIVE_GOOGLE],
    );
    assert.deepEqual(
      both.filter((p) => p.idp === "twitter"),
      [NATIVE_TWITTER],
    );
  });

  it("does not commit Twitter, Google, or Better Auth secrets", () => {
    const files = [
      "src/lib/auth/twitter-idp.ts",
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
