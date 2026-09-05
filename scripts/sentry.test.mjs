import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SENTRY_CSP_CONNECT,
  SENTRY_DENY_URLS,
  SENTRY_DSN_ENV,
  SENTRY_IGNORE_ERRORS,
  SENTRY_PUBLIC_DSN_ENV,
  SENTRY_TEST_MESSAGE,
  parseSentryDsn,
  scrubPiiString,
  scrubPiiValue,
  scrubSentryEvent,
  sentryDataCollection,
  sentryTracesSampleRate,
} from "../src/lib/sentry-shared.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Sentry wiring", () => {
  it("documents server-only and public DSN names without committing a value", () => {
    const example = read(".env.example");
    const security = read("SECURITY.md");
    assert.equal(SENTRY_DSN_ENV, "SENTRY_DSN");
    assert.equal(SENTRY_PUBLIC_DSN_ENV, "VITE_PUBLIC_SENTRY_DSN");
    assert.match(example, /# SENTRY_DSN=/);
    assert.match(example, /# VITE_PUBLIC_SENTRY_DSN=/);
    assert.doesNotMatch(example, /https:\/\/[a-z0-9]+@/i);
    assert.match(security, /SENTRY_DSN/);
    assert.match(security, /VITE_PUBLIC_SENTRY_DSN/);
    assert.match(security, /\/api\/admin\/sentry-test/);
  });

  it("keeps the private DSN out of client modules and Vite envPrefix", () => {
    const client = read("src/lib/sentry.client.ts");
    const shared = read("src/lib/sentry-shared.ts");
    const instrument = read("src/instrument.client.ts");
    const vite = read("vite.config.ts");
    assert.match(shared, /VITE_PUBLIC_SENTRY_DSN/);
    assert.match(client, /SENTRY_PUBLIC_DSN_ENV/);
    assert.doesNotMatch(client, /process\.env\.SENTRY_DSN/);
    assert.doesNotMatch(instrument, /process\.env\.SENTRY_DSN/);
    assert.match(vite, /envPrefix: \["VITE_", "POSTHOG_HOST"\]/);
    assert.doesNotMatch(vite, /envPrefix:[^\n]*SENTRY/);
    assert.match(vite, /@sentry\/node/);
    assert.match(read("src/lib/sentry.server.ts"), /SENTRY_DSN/);
  });

  it("does not send events when DSN is unset and uses a low prod trace rate", () => {
    assert.equal(sentryTracesSampleRate("production"), 0.1);
    assert.equal(sentryTracesSampleRate("preview"), 0);
    assert.equal(sentryTracesSampleRate("development"), 0);
    assert.match(read("src/lib/sentry.client.ts"), /if \(!dsn\) return false/);
    assert.match(read("src/lib/sentry.server.ts"), /if \(!dsn\) return false/);
    assert.match(read("src/lib/observe.ts"), /capture\?\.\(error, context\)/);
  });

  it("scrubs cookies, Authorization, emails, tokens, and child names", () => {
    const collection = sentryDataCollection();
    assert.equal(collection.userInfo, false);
    assert.equal(collection.cookies, false);
    assert.equal(collection.httpHeaders.request, false);
    assert.equal(collection.httpHeaders.response, false);
    assert.deepEqual(collection.httpBodies, []);
    assert.equal(scrubPiiString("Bearer secret-token"), "Bearer [Filtered]");
    assert.equal(scrubPiiString("parent@example.com called"), "[email] called");
    assert.equal(scrubPiiValue({ email: "a@b.c", child_name: "Ada", route: "/admin" }).email, "[Filtered]");
    assert.equal(scrubPiiValue({ email: "a@b.c", child_name: "Ada", route: "/admin" }).child_name, "[Filtered]");
    assert.equal(scrubPiiValue({ email: "a@b.c", child_name: "Ada", route: "/admin" }).route, "/admin");

    const event = scrubSentryEvent({
      request: {
        cookies: { session: "abc" },
        headers: { Cookie: "session=abc", Authorization: "Bearer x", "content-type": "application/json" },
        data: { password: "hunter2" },
        query_string: "email=a@b.c",
      },
      user: { id: "user-1", email: "a@b.c", ip_address: "1.2.3.4", name: "Ada" },
      extra: { token: "t", listing: "ok" },
      message: "failed for ada@kidease.ca",
    });
    assert.deepEqual(event.request.cookies, {});
    assert.equal(event.request.data, undefined);
    assert.equal(event.request.query_string, undefined);
    assert.equal(event.request.headers.Cookie, undefined);
    assert.equal(event.request.headers.Authorization, undefined);
    assert.equal(event.request.headers["content-type"], "application/json");
    assert.deepEqual(event.user, { id: "user-1" });
    assert.equal(event.extra.token, "[Filtered]");
    assert.equal(event.extra.listing, "ok");
    assert.equal(event.message, "failed for [email]");
  });

  it("ignores common browser-extension noise", () => {
    assert.ok(SENTRY_IGNORE_ERRORS.some((re) => re.test("Script error.")));
    assert.ok(SENTRY_IGNORE_ERRORS.some((re) => re.test("chrome-extension://abc/x.js")));
    assert.ok(SENTRY_DENY_URLS.some((re) => re.test("chrome-extension://abc/x.js")));
    assert.ok(SENTRY_DENY_URLS.some((re) => re.test("moz-extension://abc/x.js")));
  });

  it("gates the admin test route and allowlists ingest hosts in CSP", () => {
    const route = read("src/routes/api/admin.sentry-test.ts");
    assert.match(route, /createFileRoute\("\/api\/admin\/sentry-test"\)/);
    assert.match(route, /requireAdminCaller/);
    assert.match(route, /assertSameSiteRequest/);
    assert.match(route, /requireAdmin/);
    assert.match(route, /Sentry\.captureException\(new Error\(SENTRY_TEST_MESSAGE\)\)/);
    assert.equal(SENTRY_TEST_MESSAGE, "KidEase Sentry test");

    const csp = JSON.parse(read("vercel.json"))
      .headers.flatMap((h) => h.headers)
      .find((h) => h.key === "Content-Security-Policy").value;
    for (const host of SENTRY_CSP_CONNECT) {
      assert.match(csp, new RegExp(host.replace(/\./g, "\\.").replace(/\*/g, "\\*")));
    }
    assert.match(csp, /connect-src[^;]*https:\/\/maps\.googleapis\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/api\.stripe\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(read("src/routes/admin.tsx"), /AdminSentryTest/);
  });

  it("parses a DSN without throwing and inits from entry files", () => {
    assert.equal(parseSentryDsn("not-a-dsn"), null);
    const parsed = parseSentryDsn("https://abc123@o0.ingest.sentry.io/456");
    assert.equal(parsed?.key, "abc123");
    assert.match(parsed?.store ?? "", /\/api\/456\/store\/$/);
    assert.match(read("src/client.tsx"), /import "\.\/instrument\.client"/);
    assert.match(read("src/server.ts"), /import "\.\/instrument\.server"/);
    assert.match(read("src/server.ts"), /flushSentry/);
    assert.match(read("package.json"), /"@sentry\/react"/);
    assert.match(read("package.json"), /"@sentry\/node"/);
    assert.doesNotMatch(read("package.json"), /@sentry\/nextjs/);
  });
});
