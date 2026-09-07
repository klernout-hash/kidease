import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyEmailAccounts,
  friendlyAuthError,
  messageForEmailAccount,
  oauthOnlyMessage,
  resolveSocialSignInRedirect,
  socialSignInFailedMessage,
} from "../src/lib/auth/login-errors.ts";
import { NATIVE_APPLE, visibleSignInProviders } from "../src/lib/auth/providers.ts";
import {
  aliasInboundAuthCookies,
  applySharedAuthCookies,
  isKideasePublicHost,
  mergeSetCookieHeaders,
  readSessionTokenFromHeader,
  SESSION_TOKEN_COOKIE,
  SHARED_SESSION_TOKEN_COOKIE,
  shareOutboundAuthCookies,
} from "../src/lib/auth/cookies.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("password sign-in errors", () => {
  it("tells missing / oauth-only / wrong-password / turnstile / mail apart", () => {
    assert.match(
      friendlyAuthError("Invalid email or password", { kind: "missing", providers: [] }),
      /Email or password is incorrect/,
    );
    assert.match(
      friendlyAuthError("Invalid email or password", { kind: "oauth_only", providers: ["google"] }),
      /Email or password is incorrect/,
    );
    assert.match(
      friendlyAuthError("Invalid email or password", { kind: "has_password", providers: [] }),
      /Email or password is incorrect/,
    );
    assert.match(friendlyAuthError("Please complete the security check."), /security check/);
    assert.match(friendlyAuthError("Security check failed. Refresh and try again."), /Refresh/);
    assert.match(friendlyAuthError("Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY)"), /RESEND_API_KEY/);
    assert.match(friendlyAuthError("Too many requests"), /Wait a minute/);
    assert.equal(classifyEmailAccounts([]), "missing");
    assert.equal(classifyEmailAccounts([{ providerId: "google", password: null }]), "oauth_only");
    assert.equal(classifyEmailAccounts([{ providerId: "credential", password: "hash" }]), "has_password");
    assert.match(messageForEmailAccount({ kind: "missing", providers: [] }), /No KidEase account/);
    assert.match(oauthOnlyMessage(["apple"]), /Apple/);
    assert.match(friendlyAuthError("provider not found"), /not configured/);
    assert.match(friendlyAuthError(socialSignInFailedMessage("apple")), /Apple/);
  });

  it("throws when social sign-in returns no URL (Apple dead-button)", () => {
    assert.throws(() => resolveSocialSignInRedirect({ data: {}, error: null }, "apple"), /Apple/);
    assert.throws(() => resolveSocialSignInRedirect({ data: { url: "  " }, error: null }, "apple"), /Apple/);
    assert.throws(() => resolveSocialSignInRedirect({ error: { message: "" } }, "apple"), /Apple/);
    assert.throws(() => resolveSocialSignInRedirect({ error: { message: "provider not found" } }, "google"), /provider not found/);
    assert.equal(
      resolveSocialSignInRedirect({ data: { url: "https://appleid.apple.com/auth" } }, "apple"),
      "https://appleid.apple.com/auth",
    );
  });

  it("hides Apple unless nativeApple is on; login does not fall back to a dead Apple button", () => {
    assert.equal(visibleSignInProviders({ nativeGoogle: false, broker: false }).some((p) => p.idp === "apple"), false);
    assert.deepEqual(
      visibleSignInProviders({ nativeApple: true, nativeGoogle: false, broker: false }),
      [NATIVE_APPLE],
    );
    const login = read("src/routes/login.tsx");
    const loader = read("src/lib/server/sign-in-providers.ts");
    const client = read("src/lib/auth/client.ts");
    assert.match(loader, /APPLE_CLIENT_ID/);
    assert.match(loader, /APPLE_TEAM_ID/);
    assert.match(loader, /APPLE_KEY_ID/);
    assert.match(loader, /APPLE_PRIVATE_KEY/);
    assert.match(loader, /nativeApple/);
    assert.doesNotMatch(login, /GROK_PROVIDERS/);
    assert.match(login, /withTimeoutFallback\(getSignInProviders\(\)/);
    assert.match(client, /resolveSocialSignInRedirect/);
  });

  it("login uses the shared mapper and does not enumerate accounts after a failed password", () => {
    const login = read("src/routes/login.tsx");
    assert.match(login, /friendlyAuthError/);
    assert.doesNotMatch(login, /explainEmailSignInFailure/);
    assert.match(login, /resetTurnstile/);
    assert.match(login, /turnstileRequired && !token\.trim\(\)/);
    assert.match(login, /www\.kidease\.ca\/login/);
    assert.match(login, /Forgot password/);
    assert.doesNotMatch(login, /function friendlyAuthError/);
  });
});

describe("apex/www session cookies", () => {
  it("aliases the shared cookie onto the __Host- name Better Auth reads", () => {
    assert.equal(isKideasePublicHost("www.kidease.ca"), true);
    assert.equal(isKideasePublicHost("kidease.ca"), true);
    assert.equal(isKideasePublicHost("kidease.grok.me"), false);
    const aliased = aliasInboundAuthCookies(`${SHARED_SESSION_TOKEN_COOKIE}=abc`);
    assert.match(aliased, new RegExp(`${SESSION_TOKEN_COOKIE}=abc`));
    assert.equal(readSessionTokenFromHeader(`${SHARED_SESSION_TOKEN_COOKIE}=abc`), "abc");
  });

  it("duplicates __Host- Set-Cookie as Domain=kidease.ca on public hosts only", () => {
    const hostCookie = `${SESSION_TOKEN_COOKIE}=tok; Path=/; Secure; HttpOnly; SameSite=Lax`;
    const extra = shareOutboundAuthCookies([hostCookie]);
    assert.equal(extra.length, 1);
    assert.match(extra[0], new RegExp(`^${SHARED_SESSION_TOKEN_COOKIE}=tok`));
    assert.match(extra[0], /Domain=kidease\.ca/i);
    assert.doesNotMatch(extra[0], /__Host-/);
    assert.deepEqual(mergeSetCookieHeaders([hostCookie], "kidease.grok.me"), [hostCookie]);
    assert.equal(mergeSetCookieHeaders([hostCookie], "www.kidease.ca").length, 2);
    const shared = applySharedAuthCookies(
      new Request("https://www.kidease.ca/api/auth/sign-in/email", {
        headers: { host: "www.kidease.ca" },
      }),
      new Response(null, { headers: { "set-cookie": hostCookie } }),
    );
    assert.equal(shared.headers.getSetCookie().length, 2);
    const isolated = applySharedAuthCookies(
      new Request("https://kidease.grok.me/api/auth/ok", { headers: { host: "kidease.grok.me" } }),
      new Response(null, { headers: { "set-cookie": hostCookie } }),
    );
    assert.equal(isolated.headers.getSetCookie().length, 1);
  });

  it("auth handler aliases inbound cookies and shares outbound ones", () => {
    const authApi = read("src/routes/api/auth/$.ts");
    const server = read("src/lib/auth/server.ts");
    const twoFa = read("src/lib/server/two-factor.server.ts");
    assert.match(authApi, /requestWithAliasedAuthCookies/);
    assert.match(authApi, /applySharedAuthCookies/);
    assert.match(server, /SHARED_SESSION_TOKEN_COOKIE/);
    assert.match(twoFa, /SHARED_TWO_FACTOR_COOKIE/);
    assert.match(twoFa, /KIDEASE_COOKIE_DOMAIN/);
  });
});

describe("Turnstile is single-use and required when the widget is on", () => {
  it("resets the widget after a failed auth post", () => {
    const field = read("src/components/turnstile-field.tsx");
    const login = read("src/routes/login.tsx");
    const forgot = read("src/routes/forgot-password.tsx");
    const reset = read("src/routes/reset-password.tsx");
    assert.match(field, /resetSignal/);
    assert.match(field, /api\.reset/);
    assert.match(login, /resetSignal=\{resetSignal\}/);
    assert.match(forgot, /resetTurnstile/);
    assert.match(reset, /resetTurnstile/);
  });
});
