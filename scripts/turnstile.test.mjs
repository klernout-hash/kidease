import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clientIpFromHeaders,
  isTurnstileIdempotencyKey,
  readTurnstileToken,
  resetTurnstileVerifyCacheForTests,
  turnstileFailureMessage,
  turnstileIdempotencyKey,
  verifyTurnstileResponse,
} from "../src/lib/server/turnstile-verify.ts";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("Turnstile siteverify", () => {
  beforeEach(() => {
    resetTurnstileVerifyCacheForTests();
  });

  it("mints a stable UUID idempotency key per token", async () => {
    const a = await turnstileIdempotencyKey("tok-a");
    const b = await turnstileIdempotencyKey("tok-a");
    const c = await turnstileIdempotencyKey("tok-b");
    assert.equal(isTurnstileIdempotencyKey(a), true);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("reads the token from Better Auth or Cloudflare header names", () => {
    assert.equal(readTurnstileToken(new Headers({ "x-turnstile-token": " abc " })), "abc");
    assert.equal(readTurnstileToken(new Headers({ "x-captcha-response": "cap" })), "cap");
    assert.equal(readTurnstileToken(new Headers({ "cf-turnstile-response": "cf" })), "cf");
    assert.equal(readTurnstileToken(new Headers()), "");
  });

  it("prefers Cloudflare's connecting IP", () => {
    assert.equal(
      clientIpFromHeaders(
        new Headers({
          "cf-connecting-ip": "203.0.113.9",
          "x-forwarded-for": "10.0.0.1, 203.0.113.9",
        }),
      ),
      "203.0.113.9",
    );
    assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" })), "198.51.100.2");
  });

  it("skips when mode is off or optional without a token", async () => {
    assert.deepEqual(await verifyTurnstileResponse({ token: "", secret: "s", mode: "off" }), {
      ok: true,
      skipped: true,
    });
    assert.deepEqual(await verifyTurnstileResponse({ token: "", secret: "s", mode: "optional" }), {
      ok: true,
      skipped: true,
    });
    const missing = await verifyTurnstileResponse({ token: "", secret: "s", mode: "enforce" });
    assert.equal(missing.ok, false);
    assert.equal(turnstileFailureMessage(missing.errorCodes), "Please complete the security check.");
  });

  it("accepts a successful siteverify and does not call Cloudflare again for the same token", async () => {
    let calls = 0;
    const fetch = async (url, init) => {
      calls += 1;
      const body = String(init?.body || "");
      assert.match(url, /siteverify/);
      assert.match(body, /idempotency_key=/);
      assert.match(body, /remoteip=203\.0\.113\.9/);
      return jsonResponse({ success: true });
    };
    const first = await verifyTurnstileResponse({
      token: "fresh-token",
      secret: "secret",
      mode: "enforce",
      remoteip: "203.0.113.9",
      fetch,
    });
    const second = await verifyTurnstileResponse({
      token: "fresh-token",
      secret: "secret",
      mode: "enforce",
      fetch,
    });
    assert.equal(first.ok, true);
    assert.equal(first.skipped, false);
    assert.equal(second.ok, true);
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
  });

  it("dedupes in-flight siteverify for the same token", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return jsonResponse({ success: true });
    };
    const [a, b] = await Promise.all([
      verifyTurnstileResponse({ token: "parallel", secret: "s", mode: "enforce", fetch }),
      verifyTurnstileResponse({ token: "parallel", secret: "s", mode: "enforce", fetch }),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(calls, 1);
  });

  it("retries internal-error then succeeds", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ success: false, "error-codes": ["internal-error"] }, 503);
      return jsonResponse({ success: true });
    };
    const result = await verifyTurnstileResponse({
      token: "retry-me",
      secret: "s",
      mode: "enforce",
      fetch,
      retryDelayMs: 1,
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  });

  it("fails enforce on timeout-or-duplicate when this process never accepted the token", async () => {
    const result = await verifyTurnstileResponse({
      token: "already-used",
      secret: "s",
      mode: "enforce",
      fetch: async () => jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    });
    assert.equal(result.ok, false);
    assert.equal(turnstileFailureMessage(result.errorCodes), "Security check failed. Refresh and try again.");
  });

  it("fails open in optional mode when siteverify rejects", async () => {
    const result = await verifyTurnstileResponse({
      token: "bad",
      secret: "s",
      mode: "optional",
      fetch: async () => jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
  });
});
