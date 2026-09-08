import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_CONSENT_BANNER_IDLE_TIMEOUT_MS,
  ANALYTICS_CONSENT_BANNER_INTERACTION_EVENTS,
  ANALYTICS_CONSENT_BANNER_LOAD_CAP_MS,
  ANALYTICS_CONSENT_BANNER_REVEAL_YIELD_MS,
  ANALYTICS_CONSENT_KEY,
  analyticsConsentAllowsCapture,
  analyticsConsentAllowsReplay,
  analyticsConsentApplies,
  readAnalyticsConsent,
  scheduleAnalyticsConsentBannerReveal,
  shouldShowAnalyticsConsentBanner,
  shouldStartPostHog,
  writeAnalyticsConsent,
} from "../src/lib/analytics-consent.ts";
import {
  DEFAULT_POSTHOG_HOST,
  DEFAULT_REPLAY_SAMPLE_RATE,
  POSTHOG_HOST_ENV,
  POSTHOG_KEY_ENV,
  POSTHOG_REPLAY_ENV,
  POSTHOG_REPLAY_FLAG,
  POSTHOG_REPLAY_NATIVE_ENV,
  POSTHOG_REPLAY_SAMPLE_ENV,
  POSTHOG_PROXY_PATH,
  POSTHOG_UI_HOST,
  POSTHOG_US_ASSETS,
  POSTHOG_US_INGEST,
  applyPostHogRecordingGate,
  capturePostHogEvent,
  identifyPostHogUser,
  maskCapturedNetworkRequest,
  parseReplaySampleRate,
  posthogApiHost,
  posthogEnabled,
  posthogInitOptions,
  POSTHOG_FIRST_PARTY_ORIGIN,
  posthogProjectKey,
  resetPostHogClientForTests,
  resetPostHogIdentity,
  sanitizePostHogProperties,
  sessionReplayEnabled,
} from "../src/lib/posthog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe("PostHog client wiring", () => {
  it("reads the public Vercel key and US ingest host, never a private token", () => {
    const src = read("src/lib/posthog.ts");
    assert.equal(POSTHOG_KEY_ENV, "VITE_PUBLIC_POSTHOG_KEY");
    assert.equal(POSTHOG_HOST_ENV, "POSTHOG_HOST");
    assert.equal(POSTHOG_REPLAY_ENV, "VITE_PUBLIC_POSTHOG_REPLAY");
    assert.equal(POSTHOG_REPLAY_SAMPLE_ENV, "VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE");
    assert.equal(POSTHOG_REPLAY_NATIVE_ENV, "VITE_PUBLIC_POSTHOG_REPLAY_NATIVE");
    assert.equal(POSTHOG_REPLAY_FLAG, "session-replay-web");
    assert.equal(DEFAULT_POSTHOG_HOST, "https://us.i.posthog.com");
    assert.equal(POSTHOG_US_INGEST, "https://us.i.posthog.com");
    assert.equal(POSTHOG_US_ASSETS, "https://us-assets.i.posthog.com");
    assert.match(src, /capturePostHogEvent/);
    assert.match(src, /flushQueuedPostHogEvents/);
    assert.match(src, /kidease-ph-queue/);
    resetPostHogClientForTests();
    assert.doesNotThrow(() => capturePostHogEvent("login_funnel", { email: "hidden", step: "viewed" }));
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
    assert.equal(posthogApiHost(), `${POSTHOG_FIRST_PARTY_ORIGIN}${POSTHOG_PROXY_PATH}`);
    assert.equal(
      posthogApiHost({}, false, "https://www.kidease.ca"),
      "https://www.kidease.ca/ingest",
    );
    assert.equal(POSTHOG_PROXY_PATH, "/ingest");
    assert.equal(POSTHOG_UI_HOST, "https://us.posthog.com");
    assert.equal(POSTHOG_FIRST_PARTY_ORIGIN, "https://www.kidease.ca");
    assert.equal(
      posthogApiHost({ POSTHOG_HOST: "https://us.i.posthog.com" }),
      `${POSTHOG_FIRST_PARTY_ORIGIN}${POSTHOG_PROXY_PATH}`,
    );
    assert.equal(
      posthogApiHost({ VITE_PUBLIC_POSTHOG_HOST: "https://ph.example.com" }),
      "https://ph.example.com",
    );
  });

  it("masks session replay inputs and all on-screen text, and keeps flags on", () => {
    const options = posthogInitOptions({ native: false, consent: "granted" });
    assert.equal(options.api_host, `${POSTHOG_FIRST_PARTY_ORIGIN}${POSTHOG_PROXY_PATH}`);
    assert.equal(options.ui_host, POSTHOG_UI_HOST);
    assert.match(read("src/lib/posthog.ts"), /\$lib_custom_api_host/);
    assert.match(read("src/lib/server/posthog-proxy.ts"), /x-forwarded-host/);
    assert.match(read("src/lib/server/posthog-proxy.ts"), /x-forwarded-proto/);
    assert.match(read("src/lib/server/posthog-proxy.ts"), /x-forwarded-for/);
    assert.equal(options.capture_pageview, "history_change");
    assert.equal(options.autocapture, true);
    assert.equal(options.disable_session_recording, false);
    assert.equal(options.advanced_disable_feature_flags, false);
    assert.equal(options.person_profiles, "identified_only");
    assert.equal(options.session_recording?.maskAllInputs, true);
    assert.equal(options.session_recording?.maskTextSelector, "*");
    assert.equal(options.session_recording?.maskInputOptions?.password, true);
    assert.equal(options.session_recording?.maskInputOptions?.email, true);
    assert.equal(options.session_recording?.maskInputOptions?.tel, true);
    assert.equal(options.session_recording?.recordBody, false);
    assert.equal(options.session_recording?.recordHeaders, false);
    assert.equal(options.session_recording?.sampleRate, DEFAULT_REPLAY_SAMPLE_RATE);
  });

  it("samples replay at a bounded rate and honors env / native / consent gates", () => {
    assert.equal(parseReplaySampleRate(""), DEFAULT_REPLAY_SAMPLE_RATE);
    assert.equal(parseReplaySampleRate("0.2"), 0.2);
    assert.equal(parseReplaySampleRate("20"), 0.2);
    assert.equal(parseReplaySampleRate("1"), 1);
    assert.equal(parseReplaySampleRate("nope"), DEFAULT_REPLAY_SAMPLE_RATE);
    assert.equal(sessionReplayEnabled({ native: false, consent: "unset" }), false);
    assert.equal(sessionReplayEnabled({ native: false, consent: "granted" }), true);
    assert.equal(sessionReplayEnabled({ native: false, consent: "denied" }), false);
    assert.equal(sessionReplayEnabled({ native: true, consent: "unset" }), false);
    assert.equal(
      sessionReplayEnabled({
        native: true,
        consent: "unset",
        env: { [POSTHOG_REPLAY_NATIVE_ENV]: "1" },
      }),
      true,
    );
    assert.equal(
      sessionReplayEnabled({
        native: false,
        consent: "unset",
        env: { [POSTHOG_REPLAY_ENV]: "0" },
      }),
      false,
    );
    const sampled = posthogInitOptions({
      native: false,
      consent: "granted",
      env: { [POSTHOG_REPLAY_SAMPLE_ENV]: "0.1" },
    });
    assert.equal(sampled.session_recording?.sampleRate, 0.1);
    assert.equal(sampled.disable_session_recording, false);
    const denied = posthogInitOptions({ native: false, consent: "denied" });
    assert.equal(denied.disable_session_recording, true);
    const pending = posthogInitOptions({ native: false, consent: "unset" });
    assert.equal(pending.disable_session_recording, true);
    const native = posthogInitOptions({ native: true, consent: "unset" });
    assert.equal(native.disable_session_recording, true);
    assert.equal(native.api_host, `${POSTHOG_FIRST_PARTY_ORIGIN}${POSTHOG_PROXY_PATH}`);
  });

  it("requires Allow before website PostHog and hides the banner in Capacitor", () => {
    assert.equal(ANALYTICS_CONSENT_KEY, "kidease-analytics-consent");
    assert.equal(readAnalyticsConsent(memoryStorage()), "unset");
    assert.equal(analyticsConsentAllowsReplay("unset"), false);
    assert.equal(analyticsConsentAllowsCapture("unset"), false);
    assert.equal(analyticsConsentAllowsReplay("granted"), true);
    assert.equal(analyticsConsentAllowsReplay("denied"), false);
    assert.equal(shouldShowAnalyticsConsentBanner({ native: false, consent: "unset" }), true);
    assert.equal(shouldShowAnalyticsConsentBanner({ native: false, consent: "granted" }), false);
    assert.equal(shouldShowAnalyticsConsentBanner({ native: false, consent: "denied" }), false);
    assert.equal(shouldShowAnalyticsConsentBanner({ native: true, consent: "unset" }), false);
    assert.equal(analyticsConsentApplies({ native: true }), false);
    assert.equal(shouldStartPostHog({ native: false, consent: "unset" }), false);
    assert.equal(shouldStartPostHog({ native: false, consent: "denied" }), false);
    assert.equal(shouldStartPostHog({ native: false, consent: "granted" }), true);
    assert.equal(shouldStartPostHog({ native: true, consent: "unset" }), true);
    const store = memoryStorage();
    writeAnalyticsConsent("denied", store);
    assert.equal(readAnalyticsConsent(store), "denied");
    writeAnalyticsConsent("granted", store);
    assert.equal(readAnalyticsConsent(store), "granted");
    writeAnalyticsConsent("unset", store);
    assert.equal(readAnalyticsConsent(store), "unset");
    assert.equal(readAnalyticsConsent(memoryStorage({ [ANALYTICS_CONSENT_KEY]: "allow" })), "granted");
    assert.equal(readAnalyticsConsent(memoryStorage({ [ANALYTICS_CONSENT_KEY]: "essential" })), "denied");
    applyPostHogRecordingGate(null);

    const banner = read("src/components/cookie-consent-banner.tsx");
    const rootRoute = read("src/routes/__root.tsx");
    const start = read("src/lib/posthog.ts");
    const legal = read("src/lib/legal-copy.ts");
    const help = read("src/lib/help-knowledge.ts");
    const copy = read("src/lib/copy.ts");
    assert.match(rootRoute, /CookieConsentBanner/);
    assert.match(banner, /shouldShowAnalyticsConsentBanner/);
    assert.match(banner, /scheduleAnalyticsConsentBannerReveal/);
    assert.match(banner, /ke-cookie-consent-body/);
    assert.match(banner, /cookieConsentBannerLead/);
    assert.match(banner, /sr-only/);
    assert.match(banner, /text-\[11px\] leading-4/);
    assert.match(copy, /cookieConsentBannerLead:/);
    assert.doesNotMatch(banner, /setOpen\(shouldShowAnalyticsConsentBanner\(\)\)/);
    assert.match(banner, /writeAnalyticsConsent\(value\)/);
    assert.match(banner, /choose\("granted"\)/);
    assert.match(banner, /choose\("denied"\)/);
    assert.match(banner, /startPostHog/);
    assert.match(banner, /to="\/cookies"/);
    assert.match(banner, /to="\/privacy"/);
    assert.match(banner, /cookieConsentEssential/);
    assert.match(banner, /cookieConsentAllow/);
    assert.match(banner, /role="region"/);
    assert.doesNotMatch(banner, /\[\[data-channel=app\]_&\]:hidden/);
    assert.match(start, /shouldStartPostHog\(\)/);
    assert.match(copy, /cookieConsentEssential: "Essential"/);
    assert.match(copy, /cookieConsentAllow: "Allow analytics"/);
    assert.match(copy, /cookieConsentEssential: "Essentiel"/);
    assert.match(copy, /cookieConsentAllow: "Autoriser l’analytique"/);
    assert.match(legal, /Allow analytics/);
    assert.match(legal, /Autoriser l’analytique/);
    assert.doesNotMatch(legal, /does not show a cookie banner/);
    assert.doesNotMatch(help, /so no cookie banner/);
    assert.doesNotMatch(read("docs/posthog.md"), /no cookie banner/);
  });

  it("defers the cookie banner until after load idle and first input so it is not LCP", () => {
    assert.equal(ANALYTICS_CONSENT_BANNER_LOAD_CAP_MS, 2500);
    assert.equal(ANALYTICS_CONSENT_BANNER_IDLE_TIMEOUT_MS, 2000);
    assert.equal(ANALYTICS_CONSENT_BANNER_REVEAL_YIELD_MS, 0);
    assert.ok(ANALYTICS_CONSENT_BANNER_INTERACTION_EVENTS.includes("pointerdown"));
    assert.ok(ANALYTICS_CONSENT_BANNER_INTERACTION_EVENTS.includes("scroll"));

    let shown = 0;
    const timeouts = new Map();
    let nextId = 1;
    let idleCb = null;
    let loadCb = null;
    let interactCb = null;

    const cancel = scheduleAnalyticsConsentBannerReveal(() => {
      shown += 1;
    }, {
      readyState: "loading",
      requestIdleCallback: (cb, opts) => {
        assert.equal(opts?.timeout, ANALYTICS_CONSENT_BANNER_IDLE_TIMEOUT_MS);
        idleCb = cb;
        return 99;
      },
      cancelIdleCallback: (id) => {
        if (id === 99) idleCb = null;
      },
      setTimeout: (cb, ms) => {
        const id = nextId++;
        timeouts.set(id, { cb, ms });
        return id;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
      addLoadListener: (cb) => {
        loadCb = cb;
        return () => {
          loadCb = null;
        };
      },
      addInteractionListener: (cb) => {
        interactCb = cb;
        return () => {
          interactCb = null;
        };
      },
    });

    assert.equal(shown, 0);
    assert.equal(idleCb, null);
    assert.ok(loadCb);
    const cap = [...timeouts.values()].find((row) => row.ms === ANALYTICS_CONSENT_BANNER_LOAD_CAP_MS);
    assert.ok(cap);

    loadCb();
    assert.equal(typeof idleCb, "function");
    idleCb();
    assert.equal(shown, 0);
    assert.equal(typeof interactCb, "function");
    interactCb();
    assert.equal(shown, 0, "first input must not paint the banner in the same task");
    const yielded = [...timeouts.values()].find((row) => row.ms === ANALYTICS_CONSENT_BANNER_REVEAL_YIELD_MS);
    assert.ok(yielded);
    yielded.cb();
    assert.equal(shown, 1);

    interactCb?.();
    assert.equal(shown, 1);
    cancel();
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
    assert.match(read("src/components/posthog-boot.tsx"), /Missing VITE_PUBLIC_POSTHOG_KEY is a no-op/);
  });

  it("strips secrets and child-care PII keys from event properties and network bodies", () => {
    const cleaned = sanitizePostHogProperties({
      path: "/login",
      password: "hunter2",
      api_key: "secret",
      listing: "ok",
      child_name: "Ada",
      allergies: "peanuts",
      medicalNotes: "note",
      email: "a@b.c",
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

  it("proxies first-party /ingest to US PostHog and keeps session cookies off that hop", async () => {
    const { isPosthogProxyPath, posthogUpstreamUrl } = await import("../src/lib/posthog-proxy.ts");
    assert.equal(isPosthogProxyPath("/ingest"), true);
    assert.equal(isPosthogProxyPath("/ingest/e"), true);
    assert.equal(isPosthogProxyPath("/parent"), false);
    assert.equal(posthogUpstreamUrl("/ingest/e", "?ip=1"), "https://us.i.posthog.com/e?ip=1");
    assert.equal(
      posthogUpstreamUrl("/ingest/static/array.js"),
      "https://us-assets.i.posthog.com/static/array.js",
    );
    assert.equal(
      posthogUpstreamUrl("/ingest/array/flags"),
      "https://us-assets.i.posthog.com/array/flags",
    );
    const vercel = read("vercel.json");
    assert.match(vercel, /"source": "\/ingest\/static\/:path\(\.\*\)"/);
    assert.match(vercel, /"destination": "https:\/\/us-assets\.i\.posthog\.com\/static\/:path"/);
    assert.match(vercel, /"source": "\/ingest\/array\/:path\(\.\*\)"/);
    assert.match(vercel, /"source": "\/ingest\/:path\(\.\*\)"/);
    assert.match(vercel, /"destination": "https:\/\/us\.i\.posthog\.com\/:path"/);
    const proxy = read("src/lib/server/posthog-proxy.ts");
    assert.match(proxy, /headers\.delete\("cookie"\)|key === "cookie"/);
    assert.match(proxy, /authorization/);
    assert.match(proxy, /access-control-allow-origin/);
    assert.match(proxy, /applyIngestCors/);
    assert.match(read("server/middleware/ingest-proxy.ts"), /proxyPosthogRequest/);
    assert.match(read("vite.config.ts"), /posthogIngestPlugin/);
    assert.match(read("vite.config.ts"), /app-builder:posthog-ingest/);
    assert.match(read("docs/posthog.md"), /Reverse proxy/);
    assert.match(read("src/lib/legal-copy.ts"), /\/ingest path/);
  });

  it("allowlists US PostHog hosts in CSP without adding unsafe-eval", async () => {
    const { buildContentSecurityPolicy } = await import("./csp.mjs");
    const csp = buildContentSecurityPolicy("posthog-test");
    assert.match(csp, /script-src[^;]*https:\/\/us\.i\.posthog\.com/);
    assert.match(csp, /script-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
    assert.match(csp, /worker-src 'self' blob: data:/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /\*\.posthog\.com/);
    const vite = read("vite.config.ts");
    assert.match(vite, /envPrefix: \["VITE_", "POSTHOG_HOST"\]/);
    assert.match(vite, /ssr: \{ external: \["sharp", "posthog-js", "@sentry\/node", "inngest"\] \}/);
    assert.match(read("package.json"), /"posthog-js"/);
  });

  it("keeps passwords and child-care fields out of session replay DOM", () => {
    assert.match(read("src/routes/login.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/forgot-password.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/reset-password.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/verify-2fa.tsx"), /ph-no-capture/);
    assert.match(read("src/components/child-profile-form.tsx"), /ph-no-capture/);
    assert.match(read("src/components/child-care-card.tsx"), /ph-no-capture/);
    assert.match(read("src/components/parent-desk.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/inbox.$id.tsx"), /ph-no-capture/);
    assert.match(read("src/routes/provider.tsx"), /ph-no-capture/);
  });

  it("documents replay env vars and how Kyle watches recordings", () => {
    const envExample = read(".env.example");
    const docs = read("docs/posthog.md");
    assert.match(envExample, /VITE_PUBLIC_POSTHOG_REPLAY=/);
    assert.match(envExample, /VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE=0\.2/);
    assert.match(envExample, /VITE_PUBLIC_POSTHOG_REPLAY_NATIVE=0/);
    assert.match(envExample, /docs\/posthog\.md/);
    assert.match(docs, /Session replay/);
    assert.match(docs, /session-replay-web/);
    assert.match(docs, /VITE_PUBLIC_POSTHOG_KEY/);
    assert.match(docs, /ph-no-capture/);
    assert.match(docs, /kidease-analytics-consent/);
    assert.match(docs, /us\.posthog\.com\/project\/594559\/replay\/home/);
    assert.doesNotMatch(docs, /phc_[A-Za-z0-9]+/);
    assert.match(read("docs/flags.md"), /docs\/posthog\.md/);
    assert.match(read("SECURITY.md"), /docs\/posthog\.md/);
  });
});
