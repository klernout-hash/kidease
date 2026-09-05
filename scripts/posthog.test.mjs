import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_POSTHOG_HOST,
  POSTHOG_HOST_ENV,
  POSTHOG_KEY_ENV,
  POSTHOG_US_ASSETS,
  POSTHOG_US_INGEST,
  identifyPostHogUser,
  maskCapturedNetworkRequest,
  posthogApiHost,
  posthogEnabled,
  posthogInitOptions,
  posthogProjectKey,
  resetPostHogClientForTests,
  resetPostHogIdentity,
  sanitizePostHogProperties,
} from "../src/lib/posthog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("PostHog client wiring", () => {
  it("reads the public Vercel key and US ingest host, never a private token", () => {
    const src = read("src/lib/posthog.ts");
    assert.equal(POSTHOG_KEY_ENV, "VITE_PUBLIC_POSTHOG_KEY");
    assert.equal(POSTHOG_HOST_ENV, "POSTHOG_HOST");
    assert.equal(DEFAULT_POSTHOG_HOST, "https://us.i.posthog.com");
    assert.equal(POSTHOG_US_INGEST, "https://us.i.posthog.com");
    assert.equal(POSTHOG_US_ASSETS, "https://us-assets.i.posthog.com");
    assert.match(src, /VITE_PUBLIC_POSTHOG_KEY/);
    assert.match(src, /POSTHOG_HOST/);
    assert.doesNotMatch(src, /phc_[A-Za-z0-9]+/);
    assert.doesNotMatch(src, /process\.env\.POSTHOG_PERSONAL/);
    assert.doesNotMatch(read(".env.example"), /phc_/);
  });

  it("stays off when the public key is unset", () => {
    resetPostHogClientForTests();
    assert.equal(posthogProjectKey(), "");
    assert.equal(posthogEnabled(), false);
    assert.equal(posthogApiHost(), DEFAULT_POSTHOG_HOST);
  });

  it("masks session replay inputs and all on-screen text, and keeps flags on", () => {
    const options = posthogInitOptions();
    assert.equal(options.capture_pageview, "history_change");
    assert.equal(options.autocapture, true);
    assert.equal(options.disable_session_recording, false);
    assert.equal(options.advanced_disable_feature_flags, false);
    assert.equal(options.person_profiles, "identified_only");
    assert.equal(options.session_recording?.maskAllInputs, true);
    assert.equal(options.session_recording?.maskTextSelector, "*");
    assert.equal(options.session_recording?.maskInputOptions?.password, true);
    assert.equal(options.session_recording?.recordBody, false);
    assert.equal(options.session_recording?.recordHeaders, false);
  });

  it("identifies by Better Auth user id and never sends email", () => {
    const src = read("src/lib/posthog.ts");
    const boot = read("src/components/posthog-boot.tsx");
    assert.match(src, /client\.identify\(id\)/);
    assert.match(src, /id === "dev-user"/);
    assert.doesNotMatch(src, /identify\([^)]*email/);
    assert.doesNotMatch(src, /identify\([^)]*primaryEmail/);
    assert.match(boot, /identifyPostHogUser\(user\.id\)/);
    assert.match(boot, /isDevFallback/);
    assert.match(boot, /resetPostHogIdentity/);
    resetPostHogClientForTests();
    identifyPostHogUser("  ");
    identifyPostHogUser("dev-user");
    resetPostHogIdentity();
  });

  it("resets PostHog on sign-out and boots once from the root shell", () => {
    const auth = read("src/lib/auth/client.ts");
    const rootRoute = read("src/routes/__root.tsx");
    const boot = read("src/components/posthog-boot.tsx");
    assert.match(auth, /resetPostHogIdentity\(\)/);
    assert.match(rootRoute, /PostHogBoot/);
    assert.match(boot, /startPostHog\(\)/);
    assert.match(read("src/lib/posthog.ts"), /if \(started \|\| typeof window === "undefined"\) return/);
  });

  it("strips secrets from event properties and network bodies", () => {
    const cleaned = sanitizePostHogProperties({
      path: "/login",
      password: "hunter2",
      api_key: "secret",
      listing: "ok",
    });
    assert.deepEqual(cleaned, { path: "/login", listing: "ok" });
    const masked = maskCapturedNetworkRequest({
      name: "https://kidease.ca/api/auth",
      requestBody: '{"password":"x"}',
      responseBody: '{"token":"y"}',
      requestHeaders: { authorization: "Bearer x" },
      responseHeaders: { "set-cookie": "a" },
    });
    assert.equal(masked.requestBody, undefined);
    assert.equal(masked.responseBody, undefined);
    assert.equal(masked.requestHeaders, undefined);
    assert.equal(masked.responseHeaders, undefined);
  });

  it("allowlists US PostHog hosts in CSP without adding unsafe-eval", () => {
    const csp = JSON.parse(read("vercel.json")).headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === "Content-Security-Policy").value;
    assert.match(csp, /script-src[^;]*https:\/\/us\.i\.posthog\.com/);
    assert.match(csp, /script-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
    assert.match(csp, /worker-src 'self' blob: data:/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /\*\.posthog\.com/);
    const vite = read("vite.config.ts");
    assert.match(vite, /envPrefix: \["VITE_", "POSTHOG_HOST"\]/);
    assert.match(vite, /ssr: \{ external: \["sharp", "posthog-js", "@sentry\/node"\] \}/);
    assert.match(read("package.json"), /"posthog-js"/);
  });

  it("keeps passwords out of session replay on auth forms", () => {
    assert.match(read("src/routes/login.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/reset-password.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/verify-2fa.tsx"), /ph-no-capture/);
  });
});
