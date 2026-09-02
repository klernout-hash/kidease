import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
